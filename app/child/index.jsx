import { useEffect, useState, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Platform, Modal, TextInput, KeyboardAvoidingView, AppState,
} from 'react-native';
import { collection, addDoc, query, where, onSnapshot, orderBy, serverTimestamp, doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../../constants/firebase';
import * as Notifications from 'expo-notifications';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../contexts/AuthContext';
import { startLocationTracking } from '../../src/services/locationService';
import {
  initScreentime, startUsageTracking, stopUsageTracking,
  subscribeMyScreentime, checkUsagePermission, requestUsagePermission,
} from '../../src/services/screentimeService';
import { subscribeAppBlocking, BLOCKABLE_APPS } from '../../src/services/appBlockingService';
import { EMOTIONS, saveEmotionCheck, subscribeLatestEmotion } from '../../src/services/emotionService';
import * as ExpoUsageStats from '../../modules/expo-usage-stats';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { subscribePendingSoundRequest, updateSoundRequest } from '../../src/services/soundAroundService';

const EXTRA_OPTIONS = [15, 30, 60];

export default function ChildHome() {
  const { user, familyId } = useAuth();
  const { t } = useTranslation();

  function fmt(m) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    if (h > 0) return t('fmt.hours', { h, m: String(mm).padStart(2, '0') });
    return t('fmt.minutes', { m: mm });
  }
  const [locStatus, setLocStatus]     = useState(null);
  const [screenData, setScreenData]   = useState(null);
  const [needPermission, setNeedPermission] = useState(false);
  const [trackingMode, setTrackingMode] = useState(null);

  // 추가 시간 요청 관련 상태
  const [modalVisible, setModalVisible] = useState(false);
  const [reason, setReason]     = useState('');
  const [extraMin, setExtraMin] = useState(30);
  const [customMin, setCustomMin] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [sending, setSending]   = useState(false);
  const [lastRequest, setLastRequest] = useState(null); // 가장 최근 요청 상태
  const [needOverlayPerm, setNeedOverlayPerm] = useState(false);
  const [blockingData, setBlockingData] = useState(null);
  const [currentEmotion, setCurrentEmotion] = useState(null);
  const [showEmotionPicker, setShowEmotionPicker] = useState(false);
  const [soundCountdown, setSoundCountdown] = useState(0);
  const soundRecordingRef = useRef(false);
  const prevRemaining = useRef(null);
  const warnedAt = useRef({ warn15: false, warn5: false, warnOver: false });

  // Sound Around: 부모의 녹음 요청 감지 → 자동 녹음
  useEffect(() => {
    if (!user || !familyId) return;
    const unsub = subscribePendingSoundRequest(familyId, user.uid, async (request) => {
      if (!request || soundRecordingRef.current) return;
      try {
        soundRecordingRef.current = true;
        setSoundCountdown(30);

        const { granted } = await Audio.requestPermissionsAsync();
        if (!granted) {
          await updateSoundRequest(familyId, request.id, { status: 'failed', reason: 'permission_denied' });
          soundRecordingRef.current = false;
          setSoundCountdown(0);
          return;
        }

        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
        const recording = new Audio.Recording();
        await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
        await recording.startAsync();

        const timer = setInterval(() => {
          setSoundCountdown(prev => {
            if (prev <= 1) { clearInterval(timer); return 0; }
            return prev - 1;
          });
        }, 1000);

        setTimeout(async () => {
          clearInterval(timer);
          try {
            await recording.stopAndUnloadAsync();
            const uri = recording.getURI();
            if (uri) {
              const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
              await updateSoundRequest(familyId, request.id, { status: 'completed', audioBase64: base64, completedAt: new Date() });
            } else {
              await updateSoundRequest(familyId, request.id, { status: 'failed', reason: 'no_uri' });
            }
          } catch (e) {
            console.error('녹음 완료 처리 실패:', e);
            await updateSoundRequest(familyId, request.id, { status: 'failed', reason: e.message });
          } finally {
            soundRecordingRef.current = false;
            setSoundCountdown(0);
          }
        }, 30000);
      } catch (e) {
        console.error('녹음 시작 실패:', e);
        await updateSoundRequest(familyId, request.id, { status: 'failed', reason: e.message });
        soundRecordingRef.current = false;
        setSoundCountdown(0);
      }
    });
    return () => unsub();
  }, [user, familyId]);

  // 감정 체크인 구독
  useEffect(() => {
    if (!user || !familyId) return;
    const unsub = subscribeLatestEmotion(familyId, user.uid, (data) => {
      setCurrentEmotion(data);
      // 오늘 아직 체크인 안 했으면 자동으로 팝업
      const today = new Date().toISOString().split('T')[0];
      if (!data || data.date !== today) {
        setShowEmotionPicker(true);
      }
    });
    return () => unsub();
  }, [user, familyId]);

  async function handleEmotionSelect(emotionId) {
    if (!user || !familyId) return;
    let name = user.displayName || user.email?.split('@')[0] || t('common.child');
    try {
      const famDoc = await getDoc(doc(db, 'families', familyId));
      if (famDoc.exists()) {
        const customName = (famDoc.data().childNames || {})[user.uid];
        if (customName) name = customName;
      }
    } catch {}
    await saveEmotionCheck(familyId, user.uid, name, emotionId);
    setShowEmotionPicker(false);
  }

  // 앱 차단 설정 구독
  useEffect(() => {
    if (!user || !familyId) return;
    const unsub = subscribeAppBlocking(familyId, user.uid, (data) => {
      setBlockingData(data);
    });
    return () => unsub();
  }, [user, familyId]);

  // 차단된 앱 감지 및 오버레이 표시
  useEffect(() => {
    if (Platform.OS !== 'android' || !blockingData) return;
    const blocked = blockingData.blockedApps || {};
    const sched = blockingData.schedule;

    // 스케줄 차단 시간 체크
    function isInBlockSchedule() {
      if (!sched?.enabled) return false;
      const now = new Date();
      const hm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      if (sched.start <= sched.end) {
        return hm >= sched.start && hm < sched.end;
      }
      return hm >= sched.start || hm < sched.end;
    }

    // 차단할 패키지 목록 만들기
    const blockedPackages = new Set();
    for (const [key, isBlocked] of Object.entries(blocked)) {
      if (isBlocked && BLOCKABLE_APPS[key]) {
        BLOCKABLE_APPS[key].packages.forEach(p => blockedPackages.add(p));
      }
    }

    if (blockedPackages.size === 0 && !isInBlockSchedule()) return;

    const interval = setInterval(async () => {
      try {
        const hasOverlay = await ExpoUsageStats.checkOverlayPermission();
        if (!hasOverlay) return;

        const hasPerm = await ExpoUsageStats.checkPermission();
        if (!hasPerm) return;

        const stats = await ExpoUsageStats.getUsageStats(Date.now() - 5000, Date.now());
        if (!stats || stats.length === 0) return;

        // 가장 최근 포그라운드 앱 찾기
        const sorted = stats.sort((a, b) => b.lastTimeUsed - a.lastTimeUsed);
        const currentPkg = sorted[0]?.packageName;
        if (!currentPkg) return;

        const shouldBlock = blockedPackages.has(currentPkg) ||
          (isInBlockSchedule() && blockedPackages.has(currentPkg));

        if (shouldBlock) {
          await ExpoUsageStats.showLockOverlay(t('child.home.appBlockMessage'));
        }
      } catch (e) {}
    }, 3000);

    return () => clearInterval(interval);
  }, [blockingData]);

  // 오버레이 권한 확인
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    async function checkOverlay() {
      try {
        const has = await ExpoUsageStats.checkOverlayPermission();
        if (!has) setNeedOverlayPerm(true);
      } catch (e) {}
    }
    checkOverlay();
  }, []);

  // 시간 초과 시 오버레이 잠금 표시 / 해제 + 경고 알림
  useEffect(() => {
    if (screenData === null) return;
    const usage = screenData?.dailyUsage || 0;
    const limit = screenData?.dailyLimit || 240;
    const rem = Math.max(0, limit - usage);

    // 제한 시간이 바뀌면 경고 상태 초기화
    if (prevRemaining.current !== null && rem > prevRemaining.current + 10) {
      warnedAt.current = { warn15: false, warn5: false, warnOver: false };
    }

    // 로컬 경고 알림 (15분, 5분 전)
    async function sendWarning(title, body) {
      try {
        await Notifications.scheduleNotificationAsync({
          content: { title, body, sound: true },
          trigger: null,
        });
      } catch (e) {}
    }

    if (rem > 0 && rem <= 15 && !warnedAt.current.warn15) {
      warnedAt.current.warn15 = true;
      sendWarning(t('child.home.warnNotif15Title'), t('child.home.warnNotif15Body', { n: rem }));
    }
    if (rem > 0 && rem <= 5 && !warnedAt.current.warn5) {
      warnedAt.current.warn5 = true;
      sendWarning(t('child.home.warnNotif5Title'), t('child.home.warnNotif5Body', { n: rem }));
    }

    if (Platform.OS !== 'android') { prevRemaining.current = rem; return; }

    async function updateOverlay() {
      try {
        const hasOverlay = await ExpoUsageStats.checkOverlayPermission();
        if (!hasOverlay) return;

        if (rem <= 0) {
          if (!warnedAt.current.warnOver) {
            warnedAt.current.warnOver = true;
            sendWarning(t('child.home.lockNotifTitle'), t('child.home.lockNotifBody'));
          }
          await ExpoUsageStats.showLockOverlay(
            t('child.home.timeOverOverlay', { limit: fmt(limit) })
          );
        } else {
          // 시간이 남아있으면 (추가 시간 승인 등) 오버레이 해제
          const locked = await ExpoUsageStats.isLocked();
          if (locked) {
            await ExpoUsageStats.hideLockOverlay();
          }
        }
      } catch (e) {}
    }
    updateOverlay();
    prevRemaining.current = rem;
  }, [screenData]);

  // 앱이 포그라운드로 돌아올 때 오버레이 상태 재확인
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'active' && Platform.OS === 'android') {
        try {
          const has = await ExpoUsageStats.checkOverlayPermission();
          if (has) setNeedOverlayPerm(false);
        } catch (e) {}
      }
    });
    return () => sub.remove();
  }, []);

  // 온라인 상태 업데이트
  useEffect(() => {
    if (!user || !familyId) return;
    const presenceRef = doc(db, 'families', familyId, 'presence', user.uid);

    async function setOnline(isOnline) {
      try {
        await setDoc(presenceRef, { isOnline, lastSeen: serverTimestamp() }, { merge: true });
      } catch (e) {}
    }

    // 앱 시작 시 온라인
    setOnline(true);

    const sub = AppState.addEventListener('change', (state) => {
      setOnline(state === 'active');
    });

    return () => {
      setOnline(false);
      sub.remove();
    };
  }, [user, familyId]);

  // 위치 추적
  useEffect(() => {
    startLocationTracking()
      .then((r) => {
        if (r === 'active')               setLocStatus('active');
        else if (r === 'foreground-only') setLocStatus('foreground');
        else                              setLocStatus('noPermission');
      })
      .catch(() => setLocStatus('error'));
  }, []);

  // 스크린타임 초기화 + 추적
  useEffect(() => {
    let unsubscribe = () => {};
    async function init() {
      await initScreentime();
      if (Platform.OS === 'android') {
        const hasPerm = await checkUsagePermission();
        if (!hasPerm) setNeedPermission(true);
      }
      const mode = await startUsageTracking();
      setTrackingMode(mode);
      unsubscribe = subscribeMyScreentime((data) => setScreenData(data));
    }
    init();
    return () => { stopUsageTracking(); unsubscribe(); };
  }, []);

  // 내 요청 상태 실시간 구독
  useEffect(() => {
    if (!familyId || !user) return;
    const q = query(
      collection(db, 'families', familyId, 'timeRequests'),
      where('childUid', '==', user.uid),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) setLastRequest({ id: snap.docs[0].id, ...snap.docs[0].data() });
      else setLastRequest(null);
    });
    return () => unsub();
  }, [familyId, user]);

  async function handleGrantPermission() {
    await requestUsagePermission();
    setNeedPermission(false);
    await stopUsageTracking();
    const mode = await startUsageTracking();
    setTrackingMode(mode);
  }

  const finalExtraMin = isCustom ? (parseInt(customMin, 10) || 0) : extraMin;
  const isValidTime = finalExtraMin > 0 && finalExtraMin <= 480;

  async function handleSendRequest() {
    if (!familyId || !user || !reason.trim() || !isValidTime) return;
    setSending(true);
    try {
      // 부모가 설정한 이름 우선 사용
      let childName = user.displayName || user.email?.split('@')[0] || t('common.child');
      try {
        const famDoc = await getDoc(doc(db, 'families', familyId));
        if (famDoc.exists()) {
          const customName = (famDoc.data().childNames || {})[user.uid];
          if (customName) childName = customName;
        }
      } catch {}
      await addDoc(collection(db, 'families', familyId, 'timeRequests'), {
        childUid: user.uid,
        childName,
        reason: reason.trim(),
        extraMinutes: finalExtraMin,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      setModalVisible(false);
      setReason('');
      setExtraMin(30);
      setCustomMin('');
      setIsCustom(false);
    } catch (e) {
      console.error('요청 전송 실패:', e);
    } finally {
      setSending(false);
    }
  }

  const dailyUsage = screenData?.dailyUsage || 0;
  const dailyLimit = screenData?.dailyLimit || 240;
  const remaining  = Math.max(0, dailyLimit - dailyUsage);
  const apps       = screenData?.apps || {};
  const appEntries = Object.entries(apps);

  const hasPending  = lastRequest?.status === 'pending';
  const hasApproved = lastRequest?.status === 'approved';
  const hasRejected = lastRequest?.status === 'rejected';

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>{t('child.home.title')}</Text>

      {/* 감정 체크인 */}
      <TouchableOpacity style={s.emotionBar} onPress={() => setShowEmotionPicker(true)}>
        {currentEmotion && currentEmotion.date === new Date().toISOString().split('T')[0] ? (
          <>
            <Text style={s.emotionEmoji}>{currentEmotion.emoji}</Text>
            <Text style={s.emotionLabel}>{t('child.home.emotionToday', { label: t(`emotions.${currentEmotion.emotionId}`) })}</Text>
            <Text style={s.emotionChange}>{t('child.home.emotionChange')}</Text>
          </>
        ) : (
          <>
            <Text style={s.emotionEmoji}>🤔</Text>
            <Text style={s.emotionLabel}>{t('child.home.emotionAsk')}</Text>
            <Text style={s.emotionChange}>{t('child.home.emotionSelect')}</Text>
          </>
        )}
      </TouchableOpacity>

      {/* 감정 선택 모달 */}
      <Modal visible={showEmotionPicker} transparent animationType="fade" onRequestClose={() => setShowEmotionPicker(false)}>
        <View style={s.emotionOverlay}>
          <View style={s.emotionCard}>
            <Text style={s.emotionTitle}>{t('child.home.emotionTitle')}</Text>
            <View style={s.emotionGrid}>
              {EMOTIONS.map((em) => (
                <TouchableOpacity key={em.id} style={[s.emotionItem, { backgroundColor: em.color }]} onPress={() => handleEmotionSelect(em.id)}>
                  <Text style={s.emotionItemEmoji}>{em.emoji}</Text>
                  <Text style={[s.emotionItemLabel, { color: em.textColor }]}>{t(`emotions.${em.id}`)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={s.emotionClose} onPress={() => setShowEmotionPicker(false)}>
              <Text style={s.emotionCloseText}>{t('child.home.emotionLater')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Sound Around 녹음 중 배너 */}
      {soundCountdown > 0 && (
        <View style={s.soundBanner}>
          <Text style={s.soundBannerEmoji}>🎙️</Text>
          <Text style={s.soundBannerText}>{t('child.home.soundRecording', { sec: soundCountdown })}</Text>
        </View>
      )}

      {/* 위치 상태 */}
      <View style={s.locBar}>
        <Text style={s.locText}>
          {locStatus === 'active' ? t('child.home.locationActive')
            : locStatus === 'foreground' ? t('child.home.locationForeground')
            : locStatus === 'noPermission' ? t('child.home.locationPermNeeded')
            : locStatus === 'error' ? t('child.home.locationError')
            : t('child.home.locationChecking')}
        </Text>
      </View>

      {/* 권한 안내 배너 */}
      {needPermission && Platform.OS === 'android' && (
        <View style={s.permBanner}>
          <Text style={s.permTitle}>{t('child.home.permTitle')}</Text>
          <Text style={s.permDesc}>{t('child.home.permDesc')}</Text>
          <TouchableOpacity style={s.permBtn} onPress={handleGrantPermission}>
            <Text style={s.permBtnText}>{t('child.home.permBtn')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 오버레이 권한 배너 */}
      {needOverlayPerm && Platform.OS === 'android' && (
        <View style={s.permBanner}>
          <Text style={s.permTitle}>{t('child.home.overlayPermTitle')}</Text>
          <Text style={s.permDesc}>{t('child.home.overlayPermDesc')}</Text>
          <TouchableOpacity style={s.permBtn} onPress={async () => {
            try {
              await ExpoUsageStats.requestOverlayPermission();
            } catch (e) {}
          }}>
            <Text style={s.permBtnText}>{t('child.home.permBtn')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 측정 방식 뱃지 */}
      {trackingMode && (
        <View style={[s.modeBadge, trackingMode === 'native' ? s.modeNative : s.modeFallback]}>
          <Text style={s.modeText}>
            {trackingMode === 'native' ? t('child.home.nativeMode') : t('child.home.fallbackMode')}
          </Text>
        </View>
      )}

      {/* 시간 경고 배너 */}
      {remaining > 0 && remaining <= 15 && (
        <View style={[s.warnBanner, remaining <= 5 && s.warnBannerUrgent]}>
          <Text style={s.warnBannerText}>
            {remaining <= 5
              ? t('child.home.warnTimeUrgent', { n: remaining })
              : t('child.home.warnTime', { n: remaining })}
          </Text>
        </View>
      )}
      {remaining <= 0 && (
        <View style={s.warnBannerOver}>
          <Text style={s.warnBannerOverText}>{t('child.home.timeOver')}</Text>
        </View>
      )}

      {/* 남은 시간 링 */}
      <View style={s.timerArea}>
        <View style={[s.timerRing, {
          borderColor: remaining <= 0 ? '#F09595' : remaining <= 15 ? '#FFB74D' : Colors.primaryLight,
          borderWidth: remaining <= 15 ? 4 : 3,
        }]}>
          <Text style={[s.timerVal, remaining <= 0 && { color: Colors.danger }, remaining > 0 && remaining <= 15 && { color: '#E65100' }]}>{fmt(remaining)}</Text>
          <Text style={s.timerLabel}>{t('child.home.remaining')}</Text>
        </View>
        <Text style={s.timerSub}>{t('child.home.todayUsage', { used: fmt(dailyUsage), limit: fmt(dailyLimit) })}</Text>
      </View>

      {/* 앱별 사용시간 */}
      {appEntries.length > 0 && (
        <View style={s.card}>
          <Text style={s.cardTitle}>{t('child.home.appUsage')}</Text>
          {appEntries.map(([key, app], i) => {
            const usedSec = app.usedSeconds || app.used * 60 || 0;
            const usedMin = Math.floor(usedSec / 60);
            const pct  = app.limit ? Math.min(100, Math.round((usedMin / app.limit) * 100)) : 0;
            const warn = app.limit && pct > 80;
            return (
              <View key={key} style={i > 0 ? { marginTop: 12 } : undefined}>
                <View style={s.appRow}>
                  <View style={s.appRowLeft}>
                    <View style={[s.appDot, { backgroundColor: app.tc || Colors.primary }]} />
                    <Text style={s.appLabel}>{app.name}</Text>
                  </View>
                  <Text style={[s.appVal, warn && { color: '#BA7517' }]}>
                    {fmt(usedMin)}{app.limit ? ` / ${fmt(app.limit)}` : ''}
                  </Text>
                </View>
                {app.limit ? (
                  <View style={s.bar}>
                    <View style={[s.barFill, { width: `${pct}%`, backgroundColor: warn ? '#BA7517' : Colors.primary }]} />
                  </View>
                ) : (
                  <Text style={s.noLimit}>{t('child.home.noLimit')}</Text>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* 오늘 사용한 앱 (전체) */}
      {(screenData?.allAppsUsage || []).length > 0 && (
        <View style={s.card}>
          <Text style={s.cardTitle}>{t('child.home.todayApps')}</Text>
          {screenData.allAppsUsage.map((app, i) => (
            <View key={app.packageName} style={[s.allAppRow, i > 0 && { borderTopWidth: 0.5, borderTopColor: Colors.border }]}>
              <Text style={s.allAppName}>{app.name}</Text>
              <Text style={s.allAppTime}>{fmt(app.usedMinutes)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* 차단된 앱 안내 */}
      {blockingData && Object.entries(blockingData.blockedApps || {}).some(([, v]) => v) && (
        <View style={s.blockBanner}>
          <Text style={s.blockBannerTitle}>{t('child.home.blockedApps')}</Text>
          <View style={s.blockAppList}>
            {Object.entries(blockingData.blockedApps || {}).filter(([, v]) => v).map(([key]) => (
              <View key={key} style={s.blockAppChip}>
                <Text style={s.blockAppChipText}>
                  {BLOCKABLE_APPS[key]?.icon} {BLOCKABLE_APPS[key]?.name}
                </Text>
              </View>
            ))}
          </View>
          {blockingData.schedule?.enabled && (
            <Text style={s.blockSchedText}>
              {t('child.home.blockSchedule', { start: blockingData.schedule.start, end: blockingData.schedule.end })}
            </Text>
          )}
        </View>
      )}

      {/* 추가 시간 요청 */}
      <View style={s.bonusCard}>
        <Text style={s.bonusTitle}>{t('child.home.bonusTitle')}</Text>

        {/* 최근 요청 상태 배너 */}
        {hasPending && (
          <View style={[s.reqBadge, s.reqPending]}>
            <Text style={s.reqBadgeText}>{t('child.home.pendingBadge')}</Text>
          </View>
        )}
        {hasApproved && (
          <View style={[s.reqBadge, s.reqApproved]}>
            <Text style={s.reqBadgeText}>
              {t('child.home.approvedBadge', { min: lastRequest.extraMinutes })}
            </Text>
          </View>
        )}
        {hasRejected && (
          <View style={[s.reqBadge, s.reqRejected]}>
            <Text style={s.reqBadgeText}>{t('child.home.rejectedBadge')}</Text>
          </View>
        )}

        <Text style={s.bonusDesc}>{t('child.home.bonusDesc')}</Text>
        <TouchableOpacity
          style={[s.bonusBtn, hasPending && s.bonusBtnDisabled]}
          onPress={() => !hasPending && setModalVisible(true)}
          disabled={hasPending}
        >
          <Text style={[s.bonusBtnText, hasPending && s.bonusBtnTextDisabled]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {hasPending ? t('child.home.requestPending') : t('child.home.requestMore')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 시간 초과 잠금 모달 */}
      <Modal visible={remaining <= 0 && screenData !== null} transparent={false} animationType="fade" onRequestClose={() => {}}>
        <View style={s.lockOverlay}>
          <Text style={s.lockIcon}>⏰</Text>
          <Text style={s.lockTitle}>{t('child.home.lockTitle')}</Text>
          <Text style={s.lockDesc}>
            {t('child.home.lockDesc', { limit: fmt(dailyLimit) })}
          </Text>
          {hasPending ? (
            <View style={s.lockPendingBox}>
              <Text style={s.lockPendingText}>{t('child.home.lockPending')}</Text>
            </View>
          ) : (
            <TouchableOpacity style={s.lockBtn} onPress={() => setModalVisible(true)}>
              <Text style={s.lockBtnText}>{t('child.home.lockBtn')}</Text>
            </TouchableOpacity>
          )}
          <Text style={s.lockHint}>{t('child.home.lockHint')}</Text>
        </View>
      </Modal>

      {/* 요청 모달 */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>{t('child.home.modalTitle')}</Text>

            {/* 추가 시간 선택 */}
            <Text style={s.modalLabel}>{t('child.home.howMuch')}</Text>
            <View style={s.optionRow}>
              {EXTRA_OPTIONS.map((min) => (
                <TouchableOpacity
                  key={min}
                  style={[s.optionBtn, !isCustom && extraMin === min && s.optionBtnActive]}
                  onPress={() => { setExtraMin(min); setIsCustom(false); }}
                >
                  <Text style={[s.optionText, !isCustom && extraMin === min && s.optionTextActive]} numberOfLines={1} adjustsFontSizeToFit>
                    {min}{t('common.minutes')}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[s.optionBtn, isCustom && s.optionBtnActive]}
                onPress={() => setIsCustom(true)}
              >
                <Text style={[s.optionText, isCustom && s.optionTextActive]}>{t('child.home.custom')}</Text>
              </TouchableOpacity>
            </View>
            {isCustom && (
              <View style={s.customRow}>
                <TextInput
                  style={s.customInput}
                  placeholder={t('child.home.customPlaceholder')}
                  placeholderTextColor={Colors.textHint}
                  keyboardType="number-pad"
                  maxLength={3}
                  value={customMin}
                  onChangeText={setCustomMin}
                />
                <Text style={s.customUnit}>{t('common.minutes')}</Text>
              </View>
            )}

            {/* 이유 입력 */}
            <Text style={s.modalLabel}>{t('child.home.reasonLabel')}</Text>
            <TextInput
              style={s.textarea}
              placeholder={t('child.home.reasonPlaceholder')}
              placeholderTextColor={Colors.textHint}
              multiline
              numberOfLines={3}
              value={reason}
              onChangeText={setReason}
            />

            {/* 버튼 */}
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => { setModalVisible(false); setReason(''); setExtraMin(30); setCustomMin(''); setIsCustom(false); }}>
                <Text style={s.cancelBtnText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.submitBtn, (!reason.trim() || sending || !isValidTime) && s.submitBtnDisabled]}
                onPress={handleSendRequest}
                disabled={!reason.trim() || sending || !isValidTime}
              >
                <Text style={s.submitBtnText}>{sending ? t('child.home.sending') : t('child.home.sendRequest')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: Colors.white },
  content:     { padding: 20, paddingTop: 60, paddingBottom: 40 },
  title:       { fontSize: 22, fontWeight: '700', color: Colors.textPrimary, marginBottom: 16 },
  soundBanner:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EDE7F6', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#B39DDB' },
  soundBannerEmoji:{ fontSize: 22, marginRight: 10 },
  soundBannerText: { fontSize: 14, fontWeight: '600', color: '#4527A0' },
  locBar:      { backgroundColor: '#E8F5E9', borderRadius: 8, padding: 10, marginBottom: 12, alignItems: 'center' },
  locText:     { fontSize: 13, color: '#2E7D32' },

  permBanner:  { backgroundColor: '#FFF8E1', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#FFD54F' },
  permTitle:   { fontSize: 14, fontWeight: '600', color: '#5D4037', marginBottom: 6 },
  permDesc:    { fontSize: 13, color: '#6D4C41', marginBottom: 12, lineHeight: 20 },
  permBtn:     { backgroundColor: '#F57C00', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  permBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  modeBadge:   { borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginBottom: 12, alignSelf: 'flex-start' },
  modeNative:  { backgroundColor: '#E8F5E9' },
  modeFallback:{ backgroundColor: '#FFF3E0' },
  modeText:    { fontSize: 12, color: Colors.textSecondary },

  warnBanner:        { backgroundColor: '#FFF3E0', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#FFB74D' },
  warnBannerUrgent:  { backgroundColor: '#FBE9E7', borderColor: '#FF7043' },
  warnBannerText:    { fontSize: 14, fontWeight: '600', color: '#E65100', textAlign: 'center' },
  warnBannerOver:    { backgroundColor: Colors.dangerBg, borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#F09595' },
  warnBannerOverText:{ fontSize: 14, fontWeight: '600', color: Colors.danger, textAlign: 'center' },
  timerArea:   { alignItems: 'center', marginBottom: 20 },
  timerRing:   { width: 180, height: 180, borderRadius: 90, borderWidth: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  timerVal:    { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  timerLabel:  { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  timerSub:    { fontSize: 13, color: Colors.textSecondary },

  card:        { backgroundColor: Colors.bg, borderRadius: 12, padding: 14, marginBottom: 12 },
  cardTitle:   { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, marginBottom: 12 },
  appRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  appRowLeft:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  appDot:      { width: 8, height: 8, borderRadius: 4 },
  appLabel:    { fontSize: 13, color: Colors.textSecondary },
  appVal:      { fontSize: 13, color: Colors.textPrimary },
  bar:         { height: 4, backgroundColor: Colors.border, borderRadius: 2, marginTop: 6 },
  barFill:     { height: 4, borderRadius: 2 },
  noLimit:     { fontSize: 11, color: Colors.textHint, marginTop: 4 },

  allAppRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  allAppName:  { fontSize: 13, color: Colors.textPrimary, flex: 1 },
  allAppTime:  { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },

  // 감정 체크인
  emotionBar:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF8E1', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#FFE082' },
  emotionEmoji:     { fontSize: 24, marginRight: 10 },
  emotionLabel:     { flex: 1, fontSize: 14, color: Colors.textPrimary, fontWeight: '500' },
  emotionChange:    { fontSize: 13, color: Colors.primary, fontWeight: '500' },
  emotionOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  emotionCard:      { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '85%' },
  emotionTitle:     { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center', marginBottom: 20 },
  emotionGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  emotionItem:      { width: '22%', aspectRatio: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  emotionItemEmoji: { fontSize: 28 },
  emotionItemLabel: { fontSize: 10, fontWeight: '600', marginTop: 4 },
  emotionClose:     { marginTop: 16, alignItems: 'center', paddingVertical: 10 },
  emotionCloseText: { fontSize: 14, color: Colors.textSecondary },

  blockBanner:      { backgroundColor: '#FCEBEB', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#F09595' },
  blockBannerTitle: { fontSize: 14, fontWeight: '600', color: Colors.danger, marginBottom: 8 },
  blockAppList:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  blockAppChip:     { backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#F09595' },
  blockAppChipText: { fontSize: 12, color: Colors.danger },
  blockSchedText:   { fontSize: 11, color: Colors.textSecondary, marginTop: 8 },

  bonusCard:           { backgroundColor: Colors.bg, borderRadius: 12, padding: 16 },
  bonusTitle:          { fontSize: 15, fontWeight: '600', color: Colors.textPrimary, marginBottom: 8 },
  bonusDesc:           { fontSize: 13, color: Colors.textSecondary, marginBottom: 12 },
  bonusBtn:            { backgroundColor: Colors.primaryLight, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center' },
  bonusBtnDisabled:    { backgroundColor: Colors.border },
  bonusBtnText:        { fontSize: 14, fontWeight: '500', color: Colors.primary },
  bonusBtnTextDisabled:{ color: Colors.textHint },

  reqBadge:    { borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 10 },
  reqPending:  { backgroundColor: '#FFF8E1' },
  reqApproved: { backgroundColor: '#E8F5E9' },
  reqRejected: { backgroundColor: '#FCEBEB' },
  reqBadgeText:{ fontSize: 13, color: Colors.textPrimary },

  // 잠금 모달
  lockOverlay: { flex: 1, backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center', padding: 32 },
  lockIcon:    { fontSize: 64, marginBottom: 24 },
  lockTitle:   { fontSize: 28, fontWeight: '700', color: '#fff', textAlign: 'center', marginBottom: 16, lineHeight: 38 },
  lockDesc:    { fontSize: 16, color: '#aaa', textAlign: 'center', marginBottom: 32, lineHeight: 24 },
  lockBtn:     { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 40, marginBottom: 16 },
  lockBtnText: { fontSize: 17, fontWeight: '600', color: '#fff' },
  lockPendingBox:  { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 24, marginBottom: 16 },
  lockPendingText: { fontSize: 15, color: '#FFD54F', textAlign: 'center', lineHeight: 22 },
  lockHint:    { fontSize: 13, color: '#666', textAlign: 'center' },

  // 모달
  modalOverlay:{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalBox:    { backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalTitle:  { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: 20 },
  modalLabel:  { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 10 },

  optionRow:       { flexDirection: 'row', gap: 10, marginBottom: 20 },
  optionBtn:       { flex: 1, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 10, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: Colors.border },
  optionBtnActive: { backgroundColor: Colors.primaryLight, borderColor: Colors.primary },
  optionText:      { fontSize: 14, color: Colors.textSecondary },
  optionTextActive:{ color: Colors.primary, fontWeight: '600' },

  customRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 8 },
  customInput: { flex: 1, backgroundColor: Colors.bg, borderRadius: 10, padding: 12, fontSize: 16, color: Colors.textPrimary, borderWidth: 1.5, borderColor: Colors.primary, textAlign: 'center' },
  customUnit:  { fontSize: 15, color: Colors.textSecondary },

  textarea:    { backgroundColor: Colors.bg, borderRadius: 10, padding: 12, fontSize: 14, color: Colors.textPrimary, minHeight: 80, textAlignVertical: 'top', marginBottom: 20 },

  modalBtns:       { flexDirection: 'row', gap: 10 },
  cancelBtn:       { flex: 1, paddingVertical: 13, borderRadius: 10, backgroundColor: Colors.bg, alignItems: 'center' },
  cancelBtnText:   { fontSize: 15, color: Colors.textSecondary },
  submitBtn:       { flex: 2, paddingVertical: 13, borderRadius: 10, backgroundColor: Colors.primary, alignItems: 'center' },
  submitBtnDisabled:{ backgroundColor: Colors.border },
  submitBtnText:   { fontSize: 15, fontWeight: '600', color: Colors.white },
});
