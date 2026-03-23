import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../contexts/AuthContext';
import {
  subscribePromises,
  subscribeTodayChecks,
  subscribeWeeklyChecks,
  toggleCheck,
} from '../../src/services/promiseService';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ChildPromise() {
  const { user, familyId } = useAuth();
  const [promises, setPromises] = useState([]);
  const [checkedMap, setCheckedMap] = useState({});
  const [weeklyData, setWeeklyData] = useState(null);

  // 약속 목록 구독
  useEffect(() => {
    if (!familyId) return;
    return subscribePromises(familyId, setPromises);
  }, [familyId]);

  // 오늘 체크 현황 구독
  useEffect(() => {
    if (!familyId || !user) return;
    return subscribeTodayChecks(familyId, user.uid, setCheckedMap);
  }, [familyId, user]);

  // 주간 체크 현황 구독
  useEffect(() => {
    if (!familyId || !user) return;
    return subscribeWeeklyChecks(familyId, user.uid, setWeeklyData);
  }, [familyId, user]);

  function handleToggle(promiseId) {
    if (!familyId || !user) return;
    const today = todayStr();
    toggleCheck(familyId, promiseId, user.uid, today, !!checkedMap[promiseId]);
  }

  const today = todayStr();
  const totalPromises = promises.length;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>Family promise</Text>
      <Text style={s.subtitle}>우리가 함께 만든 약속</Text>

      {totalPromises === 0 ? (
        <View style={s.emptyCard}>
          <Text style={s.emptyText}>아직 약속이 없어요</Text>
          <Text style={s.emptyHint}>부모님이 약속을 추가하면 여기에 표시됩니다</Text>
        </View>
      ) : (
        <>
          {promises.map((p) => {
            const done = !!checkedMap[p.id];
            return (
              <TouchableOpacity key={p.id} style={s.promiseRow} onPress={() => handleToggle(p.id)}>
                <View style={[s.check, done && s.checkDone]}>
                  {done && <View style={s.checkMark} />}
                </View>
                <View style={s.promiseInfo}>
                  <Text style={[s.promiseText, done && s.promiseTextDone]}>{p.text}</Text>
                  <Text style={s.promiseSub}>
                    {done ? '오늘 완료!' : '탭해서 완료'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}

          {/* 주간 현황 */}
          {weeklyData && (
            <View style={s.weekCard}>
              <Text style={s.weekTitle}>This week</Text>
              <View style={s.weekRow}>
                {weeklyData.dates.map((date, i) => {
                  const checkedCount = weeklyData.byDate[date]?.size || 0;
                  const isFuture = date > today;
                  const isToday = date === today;
                  let status = 'future';
                  if (!isFuture && totalPromises > 0) {
                    if (checkedCount >= totalPromises) status = 'done';
                    else if (checkedCount > 0) status = 'partial';
                    else status = 'none';
                  }
                  return (
                    <View
                      key={date}
                      style={[
                        s.dayCircle,
                        status === 'done' && s.dayDone,
                        status === 'partial' && s.dayPartial,
                        isToday && s.dayToday,
                      ]}
                    >
                      <Text
                        style={[
                          s.dayText,
                          status === 'done' && s.dayTextDone,
                          status === 'partial' && s.dayTextPartial,
                          isToday && s.dayTextToday,
                        ]}
                      >
                        {DAY_LABELS[i]}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </>
      )}

      <View style={s.locCard}>
        <View style={s.locDot} />
        <View style={s.locInfo}>
          <Text style={s.locTitle}>Location sharing ON</Text>
          <Text style={s.locDesc}>Parents can see your location</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: Colors.white },
  content:    { padding: 20, paddingTop: 60, paddingBottom: 40 },
  title:      { fontSize: 22, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  subtitle:   { fontSize: 13, color: Colors.textSecondary, marginBottom: 20 },
  emptyCard:  { backgroundColor: Colors.bg, borderRadius: 12, padding: 24, alignItems: 'center' },
  emptyText:  { fontSize: 15, fontWeight: '600', color: Colors.textPrimary, marginBottom: 4 },
  emptyHint:  { fontSize: 13, color: Colors.textSecondary },
  promiseRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  check:      { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: Colors.borderMid, marginRight: 12, alignItems: 'center', justifyContent: 'center' },
  checkDone:  { backgroundColor: Colors.safeBg, borderColor: '#97C459' },
  checkMark:  { width: 8, height: 5, borderLeftWidth: 1.5, borderBottomWidth: 1.5, borderColor: Colors.safe, transform: [{ rotate: '-45deg' }], marginTop: -1 },
  promiseInfo:{ flex: 1 },
  promiseText:{ fontSize: 14, color: Colors.textPrimary },
  promiseTextDone: { color: Colors.textSecondary, textDecorationLine: 'line-through' },
  promiseSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  weekCard:   { backgroundColor: Colors.bg, borderRadius: 12, padding: 14, marginTop: 20 },
  weekTitle:  { fontSize: 14, fontWeight: '500', color: Colors.textPrimary, marginBottom: 12 },
  weekRow:    { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dayCircle:  { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center' },
  dayDone:    { backgroundColor: Colors.safeBg },
  dayPartial: { backgroundColor: Colors.warnBg },
  dayToday:   { borderWidth: 1.5, borderColor: Colors.primary },
  dayText:    { fontSize: 12, color: Colors.textHint },
  dayTextDone:   { color: Colors.safe },
  dayTextPartial:{ color: Colors.warn },
  dayTextToday:  { fontWeight: '600' },
  locCard:    { flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: Colors.bg, borderRadius: 12, marginTop: 16 },
  locDot:     { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary, marginRight: 12 },
  locInfo:    { flex: 1 },
  locTitle:   { fontSize: 13, color: Colors.textPrimary },
  locDesc:    { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
});
