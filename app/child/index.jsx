import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../../constants/Colors';
import { startLocationTracking } from '../../src/services/locationService';
import {
  initScreentime, startUsageTracking, stopUsageTracking,
  subscribeMyScreentime, setActiveApp, DEFAULT_APPS,
} from '../../src/services/screentimeService';

function fmt(m) {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h > 0 ? `${h}h ${mm}m` : `${mm}m`;
}

function fmtSec(sec) {
  if (!sec) return '0m';
  const m = Math.floor(sec / 60);
  return fmt(m);
}

const APP_KEYS = Object.keys(DEFAULT_APPS);

export default function ChildHome() {
  const [locStatus, setLocStatus] = useState('위치 확인 중...');
  const [screenData, setScreenData] = useState(null);
  const [activeApp, setActiveAppState] = useState(null); // 현재 사용 중인 앱

  // 위치 추적 시작
  useEffect(() => {
    async function initLocation() {
      try {
        const result = await startLocationTracking();
        if (result === 'active') {
          setLocStatus('📍 위치 추적 활성화됨');
        } else if (result === 'foreground-only') {
          setLocStatus('📍 앱 사용 중에만 위치 확인');
        } else {
          setLocStatus('⚠️ 위치 권한이 필요합니다');
        }
      } catch (e) {
        setLocStatus('⚠️ 위치 서비스 오류');
      }
    }
    initLocation();
  }, []);

  // 스크린타임 초기화 + 추적
  useEffect(() => {
    let unsubscribe = () => {};
    async function init() {
      await initScreentime();
      await startUsageTracking();
      unsubscribe = subscribeMyScreentime((data) => setScreenData(data));
    }
    init();
    return () => { stopUsageTracking(); unsubscribe(); };
  }, []);

  async function handleSelectApp(key) {
    const next = activeApp === key ? null : key;
    setActiveAppState(next);
    await setActiveApp(next);
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

      {/* 남은 시간 링 */}
      <View style={s.timerArea}>
        <View style={[s.timerRing, { borderColor: remaining > 0 ? Colors.primaryLight : '#FCEBEB' }]}>
          <Text style={s.timerVal}>{fmt(remaining)}</Text>
          <Text style={s.timerLabel}>남은 시간</Text>
        </View>
        <Text style={s.timerSub}>오늘 {fmt(dailyUsage)} 사용 / 제한 {fmt(dailyLimit)}</Text>
      </View>

      {/* 지금 뭐 하고 있어? */}
      <View style={s.card}>
        <Text style={s.cardTitle}>지금 뭐 해?</Text>
        <Text style={s.cardSub}>사용 중인 앱을 선택하면 정확하게 측정돼요</Text>
        <View style={s.appBtns}>
          {APP_KEYS.map((key) => {
            const app = DEFAULT_APPS[key];
            const selected = activeApp === key;
            return (
              <TouchableOpacity
                key={key}
                style={[s.appBtn, selected && { backgroundColor: app.tc, borderColor: app.tc }]}
                onPress={() => handleSelectApp(key)}
              >
                <Text style={[s.appBtnText, selected && { color: '#fff' }]}>{app.name}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={[s.appBtn, activeApp === null && { backgroundColor: Colors.borderMid }]}
            onPress={() => handleSelectApp(null)}
          >
            <Text style={s.appBtnText}>없음</Text>
          </TouchableOpacity>
        </View>
        {activeApp && apps[activeApp] && (
          <View style={s.nowRow}>
            <View style={[s.dot, { backgroundColor: DEFAULT_APPS[activeApp]?.tc || Colors.primary }]} />
            <Text style={s.nowText}>
              {DEFAULT_APPS[activeApp]?.name} 사용 중 · 오늘{' '}
              {fmtSec(apps[activeApp].usedSeconds || apps[activeApp].used * 60)}
            </Text>
          </View>
        )}
      </View>

      {/* 앱별 사용시간 */}
      <View style={s.card}>
        <Text style={s.cardTitle}>앱별 사용시간</Text>
        {appEntries.map(([key, app], i) => {
          const usedSec = app.usedSeconds || app.used * 60 || 0;
          const usedMin = Math.floor(usedSec / 60);
          const pct = app.limit ? Math.min(100, Math.round((usedMin / app.limit) * 100)) : 0;
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
  container: { flex: 1, backgroundColor: Colors.white },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary, marginBottom: 16 },
  locBar: { backgroundColor: '#E8F5E9', borderRadius: 8, padding: 10, marginBottom: 16, alignItems: 'center' },
  locText: { fontSize: 13, color: '#2E7D32' },
  timerArea: { alignItems: 'center', marginBottom: 20 },
  timerRing: { width: 140, height: 140, borderRadius: 70, borderWidth: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  timerVal: { fontSize: 24, fontWeight: '700', color: Colors.textPrimary },
  timerLabel: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  timerSub: { fontSize: 13, color: Colors.textSecondary },
  card: { backgroundColor: Colors.bg, borderRadius: 12, padding: 14, marginBottom: 12 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, marginBottom: 4 },
  cardSub: { fontSize: 12, color: Colors.textSecondary, marginBottom: 12 },
  appBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  appBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  appBtnText: { fontSize: 13, color: Colors.textSecondary },
  nowRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: Colors.border },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  nowText: { fontSize: 13, color: Colors.textPrimary },
  appRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  appRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  appDot: { width: 8, height: 8, borderRadius: 4 },
  appLabel: { fontSize: 13, color: Colors.textSecondary },
  appVal: { fontSize: 13, color: Colors.textPrimary },
  bar: { height: 4, backgroundColor: Colors.border, borderRadius: 2, marginTop: 6 },
  barFill: { height: 4, borderRadius: 2 },
  noLimit: { fontSize: 11, color: Colors.textHint, marginTop: 4 },
  bonusCard: { backgroundColor: Colors.bg, borderRadius: 12, padding: 16 },
  bonusTitle: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary, marginBottom: 4 },
  bonusDesc: { fontSize: 13, color: Colors.textSecondary, marginBottom: 12 },
  bonusBtn: { backgroundColor: Colors.primaryLight, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  bonusBtnText: { fontSize: 14, fontWeight: '500', color: Colors.primary },
});
