import { useEffect, useState, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Platform, Modal, TextInput, KeyboardAvoidingView, AppState,
} from 'react-native';
import { collection, addDoc, query, where, onSnapshot, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../../constants/firebase';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../contexts/AuthContext';
import { startLocationTracking } from '../../src/services/locationService';
import {
  initScreentime, startUsageTracking, stopUsageTracking,
  subscribeMyScreentime, checkUsagePermission, requestUsagePermission,
} from '../../src/services/screentimeService';
import * as ExpoUsageStats from '../../modules/expo-usage-stats';

function fmt(m) {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}시간 ${String(mm).padStart(2, '0')}분`;
}

const EXTRA_OPTIONS = [15, 30, 60];

export default function ChildHome() {
  const { user, familyId } = useAuth();
  const [locStatus, setLocStatus]     = useState('위치 확인 중...');
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
  const prevRemaining = useRef(null);

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

  // 시간 초과 시 오버레이 잠금 표시 / 해제
  useEffect(() => {
    if (Platform.OS !== 'android' || screenData === null) return;
    const usage = screenData?.dailyUsage || 0;
    const limit = screenData?.dailyLimit || 240;
    const rem = Math.max(0, limit - usage);

    async function updateOverlay() {
      try {
        const hasOverlay = await ExpoUsageStats.checkOverlayPermission();
        if (!hasOverlay) return;

        if (rem <= 0) {
          await ExpoUsageStats.showLockOverlay(
            `부모님이 설정한 ${fmt(limit)}을 모두 사용했어요`
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

  // 위치 추적
  useEffect(() => {
    startLocationTracking()
      .then((r) => {
        if (r === 'active')               setLocStatus('📍 위치 추적 활성화됨');
        else if (r === 'foreground-only') setLocStatus('📍 앱 사용 중에만 위치 확인');
        else                              setLocStatus('⚠️ 위치 권한이 필요합니다');
      })
      .catch(() => setLocStatus('⚠️ 위치 서비스 오류'));
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
      await addDoc(collection(db, 'families', familyId, 'timeRequests'), {
        childUid: user.uid,
        childName: user.displayName || user.email?.split('@')[0] || '자녀',
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
      <Text style={s.title}>SafeKids</Text>

      {/* 위치 상태 */}
      <View style={s.locBar}>
        <Text style={s.locText}>{locStatus}</Text>
      </View>

      {/* 권한 안내 배너 */}
      {needPermission && Platform.OS === 'android' && (
        <View style={s.permBanner}>
          <Text style={s.permTitle}>📊 앱 사용 시간 권한이 필요해요</Text>
          <Text style={s.permDesc}>
            실제 앱별 사용 시간을 측정하려면{'\n'}기기 설정에서 권한을 허용해 주세요.
          </Text>
          <TouchableOpacity style={s.permBtn} onPress={handleGrantPermission}>
            <Text style={s.permBtnText}>설정에서 허용하기</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 오버레이 권한 배너 */}
      {needOverlayPerm && Platform.OS === 'android' && (
        <View style={s.permBanner}>
          <Text style={s.permTitle}>🔒 화면 잠금 권한이 필요해요</Text>
          <Text style={s.permDesc}>
            사용 시간 초과 시 화면 잠금을 위해{'\n'}'다른 앱 위에 표시' 권한을 허용해 주세요.
          </Text>
          <TouchableOpacity style={s.permBtn} onPress={async () => {
            try {
              await ExpoUsageStats.requestOverlayPermission();
            } catch (e) {}
          }}>
            <Text style={s.permBtnText}>설정에서 허용하기</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 측정 방식 뱃지 */}
      {trackingMode && (
        <View style={[s.modeBadge, trackingMode === 'native' ? s.modeNative : s.modeFallback]}>
          <Text style={s.modeText}>
            {trackingMode === 'native' ? '✅ 실제 앱 사용량 측정 중' : '⏱ SafeKids 앱 사용시간만 측정'}
          </Text>
        </View>
      )}

      {/* 남은 시간 링 */}
      <View style={s.timerArea}>
        <View style={[s.timerRing, { borderColor: remaining > 0 ? Colors.primaryLight : '#FCEBEB' }]}>
          <Text style={s.timerVal}>{fmt(remaining)}</Text>
          <Text style={s.timerLabel}>남은 시간</Text>
        </View>
        <Text style={s.timerSub}>오늘 {fmt(dailyUsage)} 사용 / 제한 {fmt(dailyLimit)}</Text>
      </View>

      {/* 앱별 사용시간 */}
      {appEntries.length > 0 && (
        <View style={s.card}>
          <Text style={s.cardTitle}>앱별 사용시간</Text>
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
                  <Text style={s.noLimit}>제한 없음</Text>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* 오늘 사용한 앱 (전체) */}
      {(screenData?.allAppsUsage || []).length > 0 && (
        <View style={s.card}>
          <Text style={s.cardTitle}>📱 오늘 사용한 앱</Text>
          {screenData.allAppsUsage.map((app, i) => (
            <View key={app.packageName} style={[s.allAppRow, i > 0 && { borderTopWidth: 0.5, borderTopColor: Colors.border }]}>
              <Text style={s.allAppName}>{app.name}</Text>
              <Text style={s.allAppTime}>{fmt(app.usedMinutes)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* 추가 시간 요청 */}
      <View style={s.bonusCard}>
        <Text style={s.bonusTitle}>시간이 더 필요해요?</Text>

        {/* 최근 요청 상태 배너 */}
        {hasPending && (
          <View style={[s.reqBadge, s.reqPending]}>
            <Text style={s.reqBadgeText}>⏳ 부모님께 요청 중... 답변을 기다려요</Text>
          </View>
        )}
        {hasApproved && (
          <View style={[s.reqBadge, s.reqApproved]}>
            <Text style={s.reqBadgeText}>
              ✅ 승인! +{lastRequest.extraMinutes}분 추가됐어요
            </Text>
          </View>
        )}
        {hasRejected && (
          <View style={[s.reqBadge, s.reqRejected]}>
            <Text style={s.reqBadgeText}>❌ 이번엔 거절됐어요</Text>
          </View>
        )}

        <Text style={s.bonusDesc}>이유를 작성하고 부모님께 요청하세요</Text>
        <TouchableOpacity
          style={[s.bonusBtn, hasPending && s.bonusBtnDisabled]}
          onPress={() => !hasPending && setModalVisible(true)}
          disabled={hasPending}
        >
          <Text style={[s.bonusBtnText, hasPending && s.bonusBtnTextDisabled]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {hasPending ? '요청 대기 중' : '추가 시간 요청'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 시간 초과 잠금 모달 */}
      <Modal visible={remaining <= 0 && screenData !== null} transparent={false} animationType="fade" onRequestClose={() => {}}>
        <View style={s.lockOverlay}>
          <Text style={s.lockIcon}>⏰</Text>
          <Text style={s.lockTitle}>오늘 사용 시간이{'\n'}끝났어요!</Text>
          <Text style={s.lockDesc}>
            부모님이 설정한 {fmt(dailyLimit)}을{'\n'}모두 사용했어요
          </Text>
          {hasPending ? (
            <View style={s.lockPendingBox}>
              <Text style={s.lockPendingText}>⏳ 부모님께 요청 중...{'\n'}답변을 기다려주세요</Text>
            </View>
          ) : (
            <TouchableOpacity style={s.lockBtn} onPress={() => setModalVisible(true)}>
              <Text style={s.lockBtnText}>추가 시간 요청하기</Text>
            </TouchableOpacity>
          )}
          <Text style={s.lockHint}>부모님이 승인하면 자동으로 돌아가요</Text>
        </View>
      </Modal>

      {/* 요청 모달 */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>추가 시간 요청</Text>

            {/* 추가 시간 선택 */}
            <Text style={s.modalLabel}>얼마나 필요해요?</Text>
            <View style={s.optionRow}>
              {EXTRA_OPTIONS.map((min) => (
                <TouchableOpacity
                  key={min}
                  style={[s.optionBtn, !isCustom && extraMin === min && s.optionBtnActive]}
                  onPress={() => { setExtraMin(min); setIsCustom(false); }}
                >
                  <Text style={[s.optionText, !isCustom && extraMin === min && s.optionTextActive]} numberOfLines={1} adjustsFontSizeToFit>
                    {min}분
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[s.optionBtn, isCustom && s.optionBtnActive]}
                onPress={() => setIsCustom(true)}
              >
                <Text style={[s.optionText, isCustom && s.optionTextActive]}>기타</Text>
              </TouchableOpacity>
            </View>
            {isCustom && (
              <View style={s.customRow}>
                <TextInput
                  style={s.customInput}
                  placeholder="분 입력"
                  placeholderTextColor={Colors.textHint}
                  keyboardType="number-pad"
                  maxLength={3}
                  value={customMin}
                  onChangeText={setCustomMin}
                />
                <Text style={s.customUnit}>분</Text>
              </View>
            )}

            {/* 이유 입력 */}
            <Text style={s.modalLabel}>이유를 알려주세요</Text>
            <TextInput
              style={s.textarea}
              placeholder="예) 숙제 때문에 유튜브를 더 봐야 해요"
              placeholderTextColor={Colors.textHint}
              multiline
              numberOfLines={3}
              value={reason}
              onChangeText={setReason}
            />

            {/* 버튼 */}
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => { setModalVisible(false); setReason(''); setExtraMin(30); setCustomMin(''); setIsCustom(false); }}>
                <Text style={s.cancelBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.submitBtn, (!reason.trim() || sending || !isValidTime) && s.submitBtnDisabled]}
                onPress={handleSendRequest}
                disabled={!reason.trim() || sending || !isValidTime}
              >
                <Text style={s.submitBtnText}>{sending ? '전송 중...' : '요청 보내기'}</Text>
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
