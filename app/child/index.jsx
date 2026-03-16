import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../contexts/AuthContext';
import { startLocationTracking, stopLocationTracking } from '../../src/services/locationService';
import { startScreenTimeTracking, stopScreenTimeTracking, subscribeScreenTime } from '../../src/services/screentimeService';

function fmt(m) { const h = Math.floor(m / 60); const mm = m % 60; return h > 0 ? `${h}h ${mm}m` : `${mm}m`; }

export default function ChildHome() {
  const { user, familyId } = useAuth();
  const [locStatus, setLocStatus] = useState('위치 확인 중...');
  const [usedMinutes, setUsedMinutes] = useState(0);
  const [dailyLimit, setDailyLimit] = useState(240);

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
        console.error(e);
        setLocStatus('⚠️ 위치 서비스 오류');
      }
    }
    initLocation();
    startScreenTimeTracking();

    return () => {
      stopLocationTracking();
      stopScreenTimeTracking();
    };
  }, []);

  useEffect(() => {
    if (!familyId || !user) return;
    const unsub = subscribeScreenTime(familyId, user.uid, (data) => {
      setUsedMinutes(data.usedMinutes);
      setDailyLimit(data.dailyLimit);
    });
    return unsub;
  }, [familyId, user]);

  const remaining = Math.max(0, dailyLimit - usedMinutes);
  const pct = dailyLimit > 0 ? Math.min(100, Math.round((usedMinutes / dailyLimit) * 100)) : 0;
  const warn = pct > 80;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>SafeKids</Text>

      <View style={s.locBar}>
        <Text style={s.locText}>{locStatus}</Text>
      </View>

      <View style={s.timerArea}>
        <View style={[s.timerRing, { borderColor: warn ? '#FAEEDA' : Colors.primaryLight }]}>
          <Text style={s.timerVal}>{fmt(remaining)}</Text>
          <Text style={s.timerLabel}>Remaining</Text>
        </View>
        <Text style={s.timerSub}>Today {fmt(usedMinutes)} used / Limit {fmt(dailyLimit)}</Text>
      </View>

      <View style={s.card}>
        <Text style={s.cardLabel}>Usage</Text>
        <View style={s.barBig}><View style={[s.barFillBig, { width: `${pct}%`, backgroundColor: warn ? '#BA7517' : Colors.primary }]} /></View>
        <Text style={s.usagePct}>{pct}%</Text>
      </View>

      <View style={s.bonusCard}>
        <Text style={s.bonusTitle}>Need more time?</Text>
        <Text style={s.bonusDesc}>Write a reason and request from parents</Text>
        <TouchableOpacity style={s.bonusBtn}><Text style={s.bonusBtnText}>Request bonus time</Text></TouchableOpacity>
      </View>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  content: { padding: 20, paddingTop: 60 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary, marginBottom: 16 },
  locBar: { backgroundColor: '#E8F5E9', borderRadius: 8, padding: 10, marginBottom: 16, alignItems: 'center' },
  locText: { fontSize: 13, color: '#2E7D32' },
  timerArea: { alignItems: 'center', marginBottom: 20 },
  timerRing: { width: 140, height: 140, borderRadius: 70, borderWidth: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  timerVal: { fontSize: 24, fontWeight: '700', color: Colors.textPrimary },
  timerLabel: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  timerSub: { fontSize: 13, color: Colors.textSecondary },
  card: { backgroundColor: Colors.bg, borderRadius: 12, padding: 14, marginBottom: 12 },
  cardLabel: { fontSize: 13, color: Colors.textSecondary, marginBottom: 8 },
  barBig: { height: 6, backgroundColor: Colors.border, borderRadius: 3 },
  barFillBig: { height: 6, borderRadius: 3 },
  usagePct: { fontSize: 12, color: Colors.textHint, marginTop: 4, textAlign: 'right' },
  bonusCard: { backgroundColor: Colors.bg, borderRadius: 12, padding: 16 },
  bonusTitle: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary, marginBottom: 4 },
  bonusDesc: { fontSize: 13, color: Colors.textSecondary, marginBottom: 12 },
  bonusBtn: { backgroundColor: Colors.primaryLight, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  bonusBtnText: { fontSize: 14, fontWeight: '500', color: Colors.primary },
});
