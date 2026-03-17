import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Colors } from '../../constants/Colors';
import { startLocationTracking } from '../../src/services/locationService';
import {
  initScreentime, startUsageTracking, stopUsageTracking,
  subscribeMyScreentime, checkUsagePermission, requestUsagePermission,
} from '../../src/services/screentimeService';

function fmt(m) {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h > 0 ? `${h}h ${mm}m` : `${mm}m`;
}

export default function ChildHome() {
  const [locStatus, setLocStatus]     = useState('위치 확인 중...');
  const [screenData, setScreenData]   = useState(null);
  const [needPermission, setNeedPermission] = useState(false);
  const [trackingMode, setTrackingMode] = useState(null); // 'native' | 'fallback'

  // 위치 추적
  useEffect(() => {
    startLocationTracking()
      .then((r) => {
        if (r === 'active')           setLocStatus('📍 위치 추적 활성화됨');
        else if (r === 'foreground-only') setLocStatus('📍 앱 사용 중에만 위치 확인');
        else                          setLocStatus('⚠️ 위치 권한이 필요합니다');
      })
      .catch(() => setLocStatus('⚠️ 위치 서비스 오류'));
  }, []);

  // 스크린타임 초기화 + 추적
  useEffect(() => {
    let unsubscribe = () => {};

    async function init() {
      await initScreentime();

      // Android: 권한 먼저 확인
      if (Platform.OS === 'android') {
        const hasPerm = await checkUsagePermission();
        if (!hasPerm) {
          setNeedPermission(true);
        }
      }

      const mode = await startUsageTracking();
      setTrackingMode(mode);
      unsubscribe = subscribeMyScreentime((data) => setScreenData(data));
    }

    init();
    return () => { stopUsageTracking(); unsubscribe(); };
  }, []);

  async function handleGrantPermission() {
    await requestUsagePermission();
    // 설정 화면에서 돌아올 때 AppState active 이벤트로 재확인
    // (Android는 설정 복귀 시 앱이 resume됨 → useEffect 재실행 불필요)
    setNeedPermission(false);
    // 추적 재시작
    await stopUsageTracking();
    const mode = await startUsageTracking();
    setTrackingMode(mode);
  }

  const dailyUsage  = screenData?.dailyUsage  || 0;
  const dailyLimit  = screenData?.dailyLimit  || 240;
  const remaining   = Math.max(0, dailyLimit - dailyUsage);
  const apps        = screenData?.apps || {};
  const appEntries  = Object.entries(apps);

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

      {/* 추가 시간 요청 */}
      <View style={s.bonusCard}>
        <Text style={s.bonusTitle}>시간이 더 필요해요?</Text>
        <Text style={s.bonusDesc}>이유를 작성하고 부모님께 요청하세요</Text>
        <TouchableOpacity style={s.bonusBtn}>
          <Text style={s.bonusBtnText}>추가 시간 요청</Text>
        </TouchableOpacity>
      </View>
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
  timerRing:   { width: 140, height: 140, borderRadius: 70, borderWidth: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  timerVal:    { fontSize: 24, fontWeight: '700', color: Colors.textPrimary },
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

  bonusCard:    { backgroundColor: Colors.bg, borderRadius: 12, padding: 16 },
  bonusTitle:   { fontSize: 15, fontWeight: '600', color: Colors.textPrimary, marginBottom: 4 },
  bonusDesc:    { fontSize: 13, color: Colors.textSecondary, marginBottom: 12 },
  bonusBtn:     { backgroundColor: Colors.primaryLight, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  bonusBtnText: { fontSize: 14, fontWeight: '500', color: Colors.primary },
});
