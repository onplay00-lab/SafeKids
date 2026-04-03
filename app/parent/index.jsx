import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { doc, getDoc, onSnapshot, collection, query, orderBy, limit, addDoc, serverTimestamp } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { db } from '../../constants/firebase';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../contexts/AuthContext';
import { subscribeScreentime } from '../../src/services/screentimeService';
import { subscribeSOS, resolveSOS } from '../../src/services/sosService';
import { subscribeLatestEmotion } from '../../src/services/emotionService';
import { requestSoundAround, subscribeLatestSoundRequest } from '../../src/services/soundAroundService';
import { subscribeBehaviorAlerts, ALERT_ICONS, SEVERITY_COLORS, markAlertRead } from '../../src/services/behaviorAnalysisService';
import { Audio } from 'expo-av';

const CHILD_COLORS = [
  { color: Colors.primaryLight, textColor: Colors.primary },
  { color: '#FBEAF0', textColor: '#72243E' },
  { color: '#EAF3DE', textColor: '#27500A' },
];

export default function ParentHome() {
  const { t } = useTranslation();
  const { familyId } = useAuth();
  const [children, setChildren] = useState([]);
  const [screenMap, setScreenMap] = useState({});
  const [sosAlerts, setSosAlerts] = useState([]);
  const [locationMap, setLocationMap] = useState({});
  const [presenceMap, setPresenceMap] = useState({});
  const [geoAlerts, setGeoAlerts] = useState([]);
  const [timeRequests, setTimeRequests] = useState([]);
  const [emotionMap, setEmotionMap] = useState({});
  const [childNamesMap, setChildNamesMap] = useState({});
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [soundRequest, setSoundRequest] = useState(null);
  const [playingSound, setPlayingSound] = useState(null);
  const [behaviorAlerts, setBehaviorAlerts] = useState([]);

  function fmt(m) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return h > 0 ? t('fmt.hours', { h, m: mm }) : t('fmt.minutes', { m: mm });
  }

  function timeAgo(date) {
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return t('fmt.justNow');
    if (diff < 3600) return t('fmt.minutesAgo', { n: Math.floor(diff / 60) });
    if (diff < 86400) return t('fmt.hoursAgo', { n: Math.floor(diff / 3600) });
    return t('fmt.daysAgo', { n: Math.floor(diff / 86400) });
  }

  // 가족 내 아이 목록 로드
  useEffect(() => {
    if (!familyId) {
      console.warn('[ParentHome] familyId가 없습니다');
      return;
    }
    async function loadChildren() {
      try {
        console.log('[ParentHome] 가족 로딩 시작:', familyId);
        const famDoc = await getDoc(doc(db, 'families', familyId));
        if (!famDoc.exists()) {
          console.warn('[ParentHome] 가족 문서가 존재하지 않습니다:', familyId);
          return;
        }
        const famData = famDoc.data();
        const childUids = famData.children || [];
        const childNamesMapData = famData.childNames || {};
        setChildNamesMap(childNamesMapData);
        console.log('[ParentHome] 자녀 목록:', childUids);
        if (childUids.length === 0) {
          console.warn('[ParentHome] 등록된 자녀가 없습니다');
          return;
        }
        const list = await Promise.all(childUids.map(async (uid, i) => {
          // childNames 맵 우선, 없으면 users 문서에서 가져오기
          let name = childNamesMapData[uid];
          if (!name) {
            const userDoc = await getDoc(doc(db, 'users', uid));
            name = userDoc.exists() ? (userDoc.data().name || userDoc.data().email?.split('@')[0]) : uid;
          }
          const initials = name.substring(0, 2).toUpperCase();
          const colors = CHILD_COLORS[i % CHILD_COLORS.length];
          return { uid, name, initials, ...colors };
        }));
        setChildren(list);
      } catch (err) {
        console.error('[ParentHome] 자녀 로딩 오류:', err);
      }
    }
    loadChildren();
  }, [familyId]);

  // 각 아이의 스크린타임 실시간 구독
  useEffect(() => {
    if (!familyId || children.length === 0) return;
    const unsubs = children.map((c) =>
      subscribeScreentime(familyId, c.uid, (data) => {
        setScreenMap((prev) => ({ ...prev, [c.uid]: data }));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [familyId, children]);

  // SOS 알림 실시간 구독
  useEffect(() => {
    if (!familyId) return;
    const unsub = subscribeSOS(familyId, (alerts) => {
      setSosAlerts(alerts);
    });
    return unsub;
  }, [familyId]);

  // 각 아이의 위치(배터리 포함) 실시간 구독
  useEffect(() => {
    if (!familyId || children.length === 0) return;
    const unsubs = children.map((c) =>
      onSnapshot(doc(db, 'families', familyId, 'locations', c.uid), (snap) => {
        if (snap.exists()) {
          setLocationMap((prev) => ({ ...prev, [c.uid]: snap.data() }));
        }
      }, (err) => console.error('[위치 구독 오류]', c.uid, err))
    );
    return () => unsubs.forEach((u) => u());
  }, [familyId, children]);

  // 각 아이의 온라인 상태 실시간 구독
  useEffect(() => {
    if (!familyId || children.length === 0) return;
    const unsubs = children.map((c) =>
      onSnapshot(doc(db, 'families', familyId, 'presence', c.uid), (snap) => {
        if (snap.exists()) {
          setPresenceMap((prev) => ({ ...prev, [c.uid]: snap.data() }));
        }
      }, (err) => console.error('[온라인상태 구독 오류]', c.uid, err))
    );
    return () => unsubs.forEach((u) => u());
  }, [familyId, children]);

  // 각 아이의 감정 상태 구독
  useEffect(() => {
    if (!familyId || children.length === 0) return;
    const unsubs = children.map((c) =>
      subscribeLatestEmotion(familyId, c.uid, (data) => {
        setEmotionMap((prev) => ({ ...prev, [c.uid]: data }));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [familyId, children]);

  // 지오펜스 알림 이력 구독
  useEffect(() => {
    if (!familyId) return;
    const q = query(collection(db, 'families', familyId, 'geofenceAlerts'), orderBy('createdAt', 'desc'), limit(20));
    const unsub = onSnapshot(q, (snap) => {
      setGeoAlerts(snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id, type: 'geo', alertType: data.type,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
        };
      }));
    }, (err) => console.error('[지오펜스 구독 오류]', err));
    return unsub;
  }, [familyId]);

  // 시간 요청 이력 구독
  useEffect(() => {
    if (!familyId) return;
    const q = query(collection(db, 'families', familyId, 'timeRequests'), orderBy('createdAt', 'desc'), limit(20));
    const unsub = onSnapshot(q, (snap) => {
      setTimeRequests(snap.docs.map((d) => ({
        id: d.id, type: 'time', ...d.data(),
        createdAt: d.data().createdAt?.toDate() || new Date(),
      })));
    }, (err) => console.error('[시간요청 구독 오류]', err));
    return unsub;
  }, [familyId]);

  // 선택된 자녀의 Sound Around + 행동 알림 구독
  const selectedChildUid = children[selectedIdx]?.uid;
  useEffect(() => {
    if (!familyId || !selectedChildUid) return;
    const unsub1 = subscribeLatestSoundRequest(familyId, selectedChildUid, setSoundRequest);
    const unsub2 = subscribeBehaviorAlerts(familyId, selectedChildUid, setBehaviorAlerts);
    return () => { unsub1(); unsub2(); };
  }, [familyId, selectedChildUid]);

  async function handleSoundAround(child) {
    Alert.alert(
      t('parent.home.soundAroundTitle'),
      t('parent.home.soundAroundMessage', { name: child.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('parent.home.soundAroundRequest'), onPress: async () => {
          try {
            await requestSoundAround(familyId, child.uid, 30);
            Alert.alert(t('parent.home.soundAroundRequested'));
          } catch (e) { Alert.alert(t('common.error')); }
        }},
      ]
    );
  }

  async function handlePlaySoundAround(base64) {
    try {
      if (playingSound) { await playingSound.unloadAsync(); setPlayingSound(null); return; }
      const { sound } = await Audio.Sound.createAsync({ uri: `data:audio/m4a;base64,${base64}` });
      setPlayingSound(sound);
      sound.setOnPlaybackStatusUpdate(status => { if (status.didJustFinish) { sound.unloadAsync(); setPlayingSound(null); } });
      await sound.playAsync();
    } catch (e) { console.error('재생 오류:', e); }
  }

  async function handleLoudSignal(child) {
    Alert.alert(
      t('parent.home.loudSignalTitle'),
      t('parent.home.loudSignalMessage', { name: child.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('parent.home.loudSignalSend'), onPress: async () => {
            try {
              await addDoc(collection(db, 'families', familyId, 'loudSignals'), {
                childUid: child.uid,
                message: '부모님이 연락을 원해요!',
                createdAt: serverTimestamp(),
              });
              Alert.alert(t('parent.home.loudSignalSent'), t('parent.home.loudSignalSentDesc', { name: child.name }));
            } catch (e) { Alert.alert(t('common.error'), t('parent.home.loudSignalFailed')); }
          }
        },
      ]
    );
  }

  const selectedChild = children[selectedIdx];

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>{t('parent.home.title')}</Text>

      {!familyId && (
        <View style={{ backgroundColor: '#FFF5F5', padding: 16, borderRadius: 12, marginBottom: 12 }}>
          <Text style={{ fontSize: 14, color: '#C62828', fontWeight: '600' }}>{t('parent.home.familyNeeded')}</Text>
          <Text style={{ fontSize: 13, color: '#666', marginTop: 4 }}>{t('parent.home.familyNeededDesc')}</Text>
        </View>
      )}

      {familyId && children.length === 0 && (
        <View style={{ backgroundColor: '#F5F5F5', padding: 16, borderRadius: 12, marginBottom: 12 }}>
          <Text style={{ fontSize: 14, color: '#333', fontWeight: '600' }}>{t('parent.home.noChildren')}</Text>
          <Text style={{ fontSize: 13, color: '#666', marginTop: 4 }}>{t('parent.home.noChildrenDesc')}</Text>
        </View>
      )}

      {/* SOS 배너: 최근 미해결 SOS가 있으면 표시 */}
      {sosAlerts.filter(a => !a.resolved).slice(0, 1).map(a => (
        <View key={a.id} style={s.sosBanner}>
          <View style={{ flex: 1 }}>
            <Text style={s.sosBannerText}>{t('parent.home.sosAlert', { name: (a.childUid && childNamesMap[a.childUid]) || a.childName, time: timeAgo(a.createdAt) })}</Text>
          </View>
          <TouchableOpacity style={s.sosBannerBtn} onPress={() => resolveSOS(familyId, a.id)}>
            <Text style={s.sosBannerBtnText}>{t('parent.home.resolved')}</Text>
          </TouchableOpacity>
        </View>
      ))}

      {/* 자녀 선택 탭 */}
      {children.length > 1 && (
        <View style={s.childTabs}>
          {children.map((c, i) => (
            <TouchableOpacity
              key={c.uid}
              style={[s.childTab, i === selectedIdx && s.childTabActive]}
              onPress={() => setSelectedIdx(i)}
            >
              <View style={[s.tabAvatar, { backgroundColor: c.color }]}>
                <Text style={[s.tabAvatarText, { color: c.textColor }]}>{c.initials}</Text>
              </View>
              <Text style={[s.childTabText, i === selectedIdx && s.childTabTextActive]} numberOfLines={1}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* 선택된 자녀 카드 */}
      {selectedChild && (() => {
        const c = selectedChild;
        const sd = screenMap[c.uid];
        const loc = locationMap[c.uid];
        const presence = presenceMap[c.uid];
        const hasSOS = sosAlerts.some(a => a.childUid === c.uid && !a.resolved);
        const emotion = emotionMap[c.uid];
        const battery = loc?.battery ?? -1;
        const charging = loc?.charging ?? false;
        const lowBattery = battery >= 0 && battery <= 20 && !charging;
        const isOnline = presence?.isOnline === true;
        const lastSeen = presence?.lastSeen?.toDate?.();
        return (
          <View style={s.childCard}>
            <View style={s.avatarWrap}>
              <View style={[s.avatar, { backgroundColor: c.color }]}><Text style={[s.avatarText, { color: c.textColor }]}>{c.initials}</Text></View>
              <View style={[s.onlineDot, { backgroundColor: isOnline ? Colors.safe : Colors.border }]} />
            </View>
            <View style={s.childInfo}>
              <View style={s.childNameRow}>
                <Text style={s.childName}>{c.name}</Text>
                <Text style={[s.onlineText, { color: isOnline ? Colors.safe : Colors.textHint }]}>
                  {isOnline ? t('common.online') : lastSeen ? timeAgo(lastSeen) : t('common.offline')}
                </Text>
              </View>
              <View style={s.childSubRow}>
                <Text style={s.childLoc}>{sd ? t('parent.home.usage', { time: fmt(sd.dailyUsage || 0) }) : t('common.noData')}</Text>
                {battery >= 0 && (
                  <Text style={[s.batteryText, lowBattery && s.batteryLow]}>
                    {charging ? '⚡' : '🔋'}{battery}%
                  </Text>
                )}
                {emotion && emotion.date === new Date().toISOString().split('T')[0] && (
                  <Text style={s.emotionBadge}>{emotion.emoji} {t(`emotions.${emotion.emotionId}`)}</Text>
                )}
              </View>
            </View>
            <View style={s.cardActions}>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <TouchableOpacity style={s.loudBtn} onPress={() => handleLoudSignal(c)}>
                  <Text style={s.loudBtnText}>📢</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.loudBtn, { backgroundColor: '#E8F5E9' }]} onPress={() => handleSoundAround(c)}>
                  <Text style={s.loudBtnText}>🎧</Text>
                </TouchableOpacity>
              </View>
              <View style={[s.badge, { backgroundColor: hasSOS ? Colors.dangerBg : lowBattery ? '#FFF3E0' : Colors.safeBg }]}>
                <Text style={[s.badgeText, { color: hasSOS ? Colors.danger : lowBattery ? '#E65100' : Colors.safe }]}>
                  {hasSOS ? 'SOS!' : lowBattery ? t('common.lowBattery') : t('common.safe')}
                </Text>
              </View>
            </View>
          </View>
        );
      })()}

      {/* 선택된 자녀의 오늘 사용 시간 */}
      {selectedChild && (
        <View style={s.card}>
          <Text style={s.cardLabel}>{t('parent.home.todayUsage')}</Text>
          {(() => {
            const sd = screenMap[selectedChild.uid];
            const usedMin = sd?.dailyUsage || 0;
            const limitMin = sd?.dailyLimit || 240;
            const pct = limitMin > 0 ? Math.round((usedMin / limitMin) * 100) : 0;
            const warn = pct > 80;
            return (
              <View>
                <Text style={[s.usageTime, warn && { color: Colors.warn }]}>{fmt(usedMin)}</Text>
                <View style={s.bar}><View style={[s.barFill, { width: `${Math.min(100, pct)}%`, backgroundColor: warn ? '#BA7517' : Colors.primary }]} /></View>
                <Text style={s.usageLimit}>{t('parent.home.limit', { time: fmt(limitMin) })}</Text>
              </View>
            );
          })()}
        </View>
      )}

      <View style={s.card}>
        <TouchableOpacity style={s.alertHeader} onPress={() => setShowAllAlerts(!showAllAlerts)}>
          <Text style={s.cardLabel}>{t('parent.home.alertHistory')}</Text>
          <Text style={s.alertToggle}>{showAllAlerts ? t('parent.home.collapse') : t('parent.home.showAll')}</Text>
        </TouchableOpacity>
        {(() => {
          const allAlerts = [
            ...sosAlerts.map(a => ({ ...a, type: 'sos' })),
            ...geoAlerts,
            ...timeRequests,
          ].sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0));
          const displayed = showAllAlerts ? allAlerts : allAlerts.slice(0, 5);
          if (allAlerts.length === 0) return <Text style={s.notiText}>{t('parent.home.noAlerts')}</Text>;
          return displayed.map(a => {
            const icon = a.type === 'sos' ? '🚨' : a.type === 'geo' ? (a.alertType === 'enter' ? '📍' : '🚶') : '⏰';
            // childNames 맵에서 부모가 설정한 이름 우선 사용
            const resolvedName = (a.childUid && childNamesMap[a.childUid]) || a.childName;
            const text = a.type === 'sos'
              ? t('parent.home.sosAlertText', { name: resolvedName })
              : a.type === 'geo'
              ? (a.alertType === 'enter'
                ? t('parent.home.geoArrival', { name: resolvedName, place: a.geofenceName })
                : t('parent.home.geoDeparture', { name: resolvedName, place: a.geofenceName }))
              : t('parent.home.timeRequest', { name: resolvedName, min: a.extraMinutes });
            const statusText = a.type === 'sos'
              ? (a.resolved ? t('parent.home.confirmed') : '')
              : a.type === 'time'
              ? (a.status === 'approved' ? t('parent.home.approved') : a.status === 'rejected' ? t('parent.home.rejected') : t('parent.home.pending'))
              : '';
            return (
              <View key={`${a.type}-${a.id}`} style={[s.alertRow, a.type === 'sos' && !a.resolved && s.alertRowPending]}>
                <Text style={s.alertIcon}>{icon}</Text>
                <View style={s.alertInfo}>
                  <Text style={s.alertText}>{text}</Text>
                  <Text style={s.alertTime}>{timeAgo(a.createdAt)}{statusText}</Text>
                </View>
                {a.type === 'sos' && !a.resolved && (
                  <TouchableOpacity style={s.resolveBtn} onPress={() => resolveSOS(familyId, a.id)}>
                    <Text style={s.resolveBtnText}>{t('common.confirm')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          });
        })()}
      </View>

      {/* Sound Around 상태 */}
      {soundRequest && (
        <View style={s.card}>
          <Text style={s.cardLabel}>{t('parent.home.soundAround')}</Text>
          {soundRequest.status === 'pending' && <Text style={s.notiText}>{t('parent.home.soundAroundPending')}</Text>}
          {soundRequest.status === 'recording' && <Text style={s.notiText}>🔴 {t('parent.home.soundAroundRecording')}</Text>}
          {soundRequest.status === 'completed' && soundRequest.audioBase64 && (
            <TouchableOpacity style={s.playBtn} onPress={() => handlePlaySoundAround(soundRequest.audioBase64)}>
              <Text style={s.playBtnText}>{playingSound ? '⏹ ' + t('parent.home.soundAroundStop') : '▶️ ' + t('parent.home.soundAroundPlay')}</Text>
            </TouchableOpacity>
          )}
          {soundRequest.status === 'failed' && <Text style={[s.notiText, { color: Colors.danger }]}>{t('parent.home.soundAroundFailed')}</Text>}
        </View>
      )}

      {/* 행동 분석 알림 */}
      {behaviorAlerts.length > 0 && (
        <View style={s.card}>
          <Text style={s.cardLabel}>{t('parent.home.behaviorAlerts')}</Text>
          {behaviorAlerts.filter(a => !a.read).slice(0, 3).map(a => {
            const sc = SEVERITY_COLORS[a.severity] || SEVERITY_COLORS.info;
            return (
              <TouchableOpacity key={a.id} style={[s.behaviorRow, { backgroundColor: sc.bg }]} onPress={() => markAlertRead(familyId, a.id)}>
                <Text style={s.behaviorIcon}>{ALERT_ICONS[a.type] || '📋'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.behaviorTitle, { color: sc.text }]}>{a.title}</Text>
                  <Text style={s.behaviorDesc}>{a.description}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  content: { padding: 20, paddingTop: 60, paddingBottom: 30 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary, marginBottom: 20 },
  sosBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.dangerBg, borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#F09595' },
  sosBannerText: { fontSize: 14, fontWeight: '600', color: Colors.danger },
  sosBannerBtn: { backgroundColor: Colors.danger, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginLeft: 10 },
  sosBannerBtnText: { fontSize: 12, fontWeight: '600', color: Colors.white },
  childTabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  childTab: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: Colors.bg, borderWidth: 1.5, borderColor: 'transparent' },
  childTabActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  tabAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tabAvatarText: { fontSize: 11, fontWeight: '600' },
  childTabText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500', flex: 1 },
  childTabTextActive: { color: Colors.primary, fontWeight: '600' },
  childCard: { flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: Colors.bg, borderRadius: 12, marginBottom: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { fontSize: 14, fontWeight: '600' },
  avatarWrap: { position: 'relative', marginRight: 12 },
  onlineDot: { position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: Colors.white },
  childInfo: { flex: 1 },
  childNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  childName: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  onlineText: { fontSize: 11 },
  childSubRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  childLoc: { fontSize: 12, color: Colors.textSecondary },
  batteryText: { fontSize: 12, color: Colors.safe, fontWeight: '500' },
  batteryLow: { color: '#E65100' },
  emotionBadge: { fontSize: 12, color: Colors.textSecondary },
  cardActions: { alignItems: 'center', gap: 6 },
  loudBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFF3E0', alignItems: 'center', justifyContent: 'center' },
  loudBtnText: { fontSize: 16 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 12, fontWeight: '500' },
  card: { backgroundColor: Colors.bg, borderRadius: 12, padding: 14, marginTop: 12 },
  cardLabel: { fontSize: 13, color: Colors.textSecondary, marginBottom: 10 },
  usageRow: { flexDirection: 'row', gap: 16 },
  usageItem: { flex: 1 },
  usageName: { fontSize: 12, color: Colors.textSecondary, marginBottom: 4 },
  usageTime: { fontSize: 18, fontWeight: '600', color: Colors.textPrimary, marginBottom: 6 },
  bar: { height: 4, backgroundColor: Colors.border, borderRadius: 2 },
  barFill: { height: 4, borderRadius: 2 },
  usageLimit: { fontSize: 11, color: Colors.textHint, marginTop: 4 },
  notiText: { fontSize: 13, color: Colors.textSecondary, marginTop: 4 },
  alertRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  alertIcon: { fontSize: 18, marginRight: 10 },
  alertInfo: { flex: 1 },
  alertText: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  alertTime: { fontSize: 11, color: Colors.textHint, marginTop: 2 },
  alertDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.danger },
  alertHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  alertToggle: { fontSize: 13, color: Colors.primary, fontWeight: '500' },
  alertRowPending: { backgroundColor: '#FFF5F5', borderRadius: 8, paddingHorizontal: 8, marginHorizontal: -8 },
  resolveBtn: { backgroundColor: Colors.primary, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 },
  resolveBtnText: { fontSize: 12, fontWeight: '600', color: Colors.white },
  playBtn: { backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 8 },
  playBtnText: { fontSize: 14, fontWeight: '600', color: Colors.white },
  behaviorRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, marginBottom: 6 },
  behaviorIcon: { fontSize: 20, marginRight: 10 },
  behaviorTitle: { fontSize: 13, fontWeight: '600' },
  behaviorDesc: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
});
