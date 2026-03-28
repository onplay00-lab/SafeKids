import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { doc, getDoc, collection, query, onSnapshot, orderBy, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../constants/firebase';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../contexts/AuthContext';
import { subscribeScreentime, updateAppLimit, updateDailyLimit, updateWeeklyLimits, updateSchedule, fetchScreentimeHistory } from '../../src/services/screentimeService';

function fmt(m) { const h = Math.floor(m / 60); const mm = m % 60; return h > 0 ? `${h}시간 ${mm}분` : `${mm}분`; }

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export default function ParentScreenTime() {
  const { familyId } = useAuth();
  const [children, setChildren]     = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [screenData, setScreenData] = useState(null);
  const [requests, setRequests]     = useState([]);
  const [showWeekly, setShowWeekly] = useState(false);
  const [weeklyLimits, setWeeklyLimits] = useState(null);
  const [schedule, setSchedule] = useState({
    sleep: { start: '22:00', end: '07:00', enabled: true },
    study: { start: '16:00', end: '18:00', enabled: true },
  });
  const [timePicker, setTimePicker] = useState(null); // { type: 'sleep'|'study', field: 'start'|'end' }
  const [reportData, setReportData] = useState([]);
  const [showReport, setShowReport] = useState(false);

  // 가족 내 아이 목록 로드
  useEffect(() => {
    if (!familyId) return;
    async function loadChildren() {
      const famDoc = await getDoc(doc(db, 'families', familyId));
      if (!famDoc.exists()) return;
      const data = famDoc.data();
      const childUids = data.children || [];
      const names = data.childNames || {};
      const list = await Promise.all(childUids.map(async (uid) => {
        if (names[uid]) return { uid, name: names[uid] };
        const userDoc = await getDoc(doc(db, 'users', uid));
        return { uid, name: userDoc.exists() ? (userDoc.data().name || userDoc.data().email?.split('@')[0]) : uid };
      }));
      setChildren(list);
    }
    loadChildren();
  }, [familyId]);

  // 선택된 아이의 스크린타임 실시간 구독
  useEffect(() => {
    if (!familyId || children.length === 0) { setScreenData(null); return; }
    const child = children[selectedIdx];
    if (!child) return;
    const unsub = subscribeScreentime(familyId, child.uid, (data) => {
      setScreenData(data);
      setWeeklyLimits(data?.weeklyLimits || null);
      if (data?.schedule) setSchedule(data.schedule);
    });
    return () => unsub();
  }, [familyId, children, selectedIdx]);

  // 주간 리포트 로드
  useEffect(() => {
    if (!familyId || children.length === 0) return;
    const child = children[selectedIdx];
    if (!child) return;
    fetchScreentimeHistory(familyId, child.uid, 7).then(setReportData);
  }, [familyId, children, selectedIdx]);

  // 추가 시간 요청 실시간 구독 (pending 우선 표시)
  useEffect(() => {
    if (!familyId) return;
    const q = query(
      collection(db, 'families', familyId, 'timeRequests'),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [familyId]);

  const dailyUsage = screenData?.dailyUsage || 0;
  const dailyLimit = screenData?.dailyLimit || 240;
  const pctTotal   = dailyLimit > 0 ? Math.round((dailyUsage / dailyLimit) * 100) : 0;
  const apps       = screenData?.apps || {};
  const appEntries = Object.entries(apps);

  // 현재 선택된 아이의 pending 요청만 표시
  const selectedChild  = children[selectedIdx];
  const pendingForChild = requests.filter(
    (r) => r.childUid === selectedChild?.uid && r.status === 'pending'
  );

  function handleWeeklyChange(day, delta) {
    const current = weeklyLimits || {};
    const val = current[day] !== undefined ? current[day] : dailyLimit;
    const next = Math.max(30, Math.min(720, val + delta));
    const updated = { ...current, [day]: next };
    // 모든 요일 채우기
    for (let i = 0; i < 7; i++) {
      if (updated[i] === undefined) updated[i] = dailyLimit;
    }
    setWeeklyLimits(updated);
    if (selectedChild) updateWeeklyLimits(familyId, selectedChild.uid, updated);
  }

  function handleDisableWeekly() {
    setWeeklyLimits(null);
    setShowWeekly(false);
    if (selectedChild) {
      // weeklyLimits를 null로 설정
      const ref = doc(db, 'families', familyId, 'screentime', selectedChild.uid);
      updateDoc(ref, { weeklyLimits: null });
    }
  }

  function handleEnableWeekly() {
    const limits = {};
    for (let i = 0; i < 7; i++) limits[i] = dailyLimit;
    setWeeklyLimits(limits);
    setShowWeekly(true);
    if (selectedChild) updateWeeklyLimits(familyId, selectedChild.uid, limits);
  }

  function handleToggleLimit(appKey, app) {
    if (!familyId || children.length === 0) return;
    const child = children[selectedIdx];
    const newLimit = app.limit ? null : 60;
    updateAppLimit(familyId, child.uid, appKey, newLimit);
  }

  async function handleApprove(req) {
    if (!familyId || !selectedChild) return;
    try {
      // 요청 상태 업데이트
      await updateDoc(doc(db, 'families', familyId, 'timeRequests', req.id), {
        status: 'approved',
        respondedAt: serverTimestamp(),
      });
      // dailyLimit 증가
      const stRef = doc(db, 'families', familyId, 'screentime', req.childUid);
      const stDoc = await getDoc(stRef);
      const currentLimit = stDoc.exists() ? (stDoc.data().dailyLimit || 240) : 240;
      await updateDoc(stRef, { dailyLimit: currentLimit + req.extraMinutes });
    } catch (e) {
      console.error('승인 실패:', e);
    }
  }

  async function handleReject(req) {
    if (!familyId) return;
    try {
      await updateDoc(doc(db, 'families', familyId, 'timeRequests', req.id), {
        status: 'rejected',
        respondedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error('거절 실패:', e);
    }
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.headerRow}>
        <Text style={s.title}>사용 시간</Text>
        <View style={s.tabs}>
          {children.map((c, i) => (
            <TouchableOpacity key={c.uid} style={i === selectedIdx ? s.tabActive : s.tab} onPress={() => setSelectedIdx(i)}>
              <Text style={i === selectedIdx ? s.tabActiveText : s.tabText}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={s.card}>
        <View style={s.row}><Text style={s.cardLabel}>Today</Text><Text style={s.cardVal}>{fmt(dailyUsage)} / {fmt(dailyLimit)}</Text></View>
        <View style={s.barBig}><View style={[s.barFillBig, { width: `${Math.min(100, pctTotal)}%` }]} /></View>

        {/* 일일 제한 시간 설정 */}
        <View style={s.limitSection}>
          <Text style={s.limitLabel}>일일 제한 시간</Text>
          <View style={s.limitRow}>
            <TouchableOpacity
              style={s.limitBtn}
              onPress={() => {
                const next = Math.max(30, dailyLimit - 30);
                if (selectedChild) updateDailyLimit(familyId, selectedChild.uid, next);
              }}
            >
              <Text style={s.limitBtnText}>-30분</Text>
            </TouchableOpacity>
            <Text style={s.limitValue}>{fmt(dailyLimit)}</Text>
            <TouchableOpacity
              style={s.limitBtn}
              onPress={() => {
                const next = Math.min(720, dailyLimit + 30);
                if (selectedChild) updateDailyLimit(familyId, selectedChild.uid, next);
              }}
            >
              <Text style={s.limitBtnText}>+30분</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* 요일별 시간 제한 */}
      <View style={s.card}>
        <View style={s.row}>
          <Text style={s.cardLabel}>요일별 제한</Text>
          <TouchableOpacity onPress={() => {
            if (weeklyLimits) {
              if (showWeekly) setShowWeekly(false);
              else setShowWeekly(true);
            } else {
              handleEnableWeekly();
            }
          }}>
            <Text style={s.weeklyToggle}>{weeklyLimits ? (showWeekly ? '접기' : '펼치기') : '+ 설정'}</Text>
          </TouchableOpacity>
        </View>
        {weeklyLimits && showWeekly && (
          <>
            {DAY_LABELS.map((label, i) => {
              const val = weeklyLimits[i] !== undefined ? weeklyLimits[i] : dailyLimit;
              const isToday = new Date().getDay() === i;
              return (
                <View key={i} style={[s.weeklyRow, isToday && s.weeklyRowToday]}>
                  <Text style={[s.weeklyDay, isToday && s.weeklyDayToday]}>{label}</Text>
                  <View style={s.weeklyControls}>
                    <TouchableOpacity style={s.weeklyBtn} onPress={() => handleWeeklyChange(i, -30)}>
                      <Text style={s.weeklyBtnText}>-30</Text>
                    </TouchableOpacity>
                    <Text style={s.weeklyVal}>{fmt(val)}</Text>
                    <TouchableOpacity style={s.weeklyBtn} onPress={() => handleWeeklyChange(i, 30)}>
                      <Text style={s.weeklyBtnText}>+30</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
            <TouchableOpacity style={s.weeklyDisableBtn} onPress={handleDisableWeekly}>
              <Text style={s.weeklyDisableText}>요일별 제한 해제 (기본 제한으로)</Text>
            </TouchableOpacity>
          </>
        )}
        {weeklyLimits && !showWeekly && (
          <View style={s.weeklyPreview}>
            {DAY_LABELS.map((label, i) => (
              <View key={i} style={s.weeklyPreviewItem}>
                <Text style={[s.weeklyPreviewDay, new Date().getDay() === i && s.weeklyDayToday]}>{label}</Text>
                <Text style={s.weeklyPreviewVal}>{weeklyLimits[i] !== undefined ? `${Math.floor(weeklyLimits[i]/60)}h` : '-'}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* 추가 시간 요청 목록 */}
      {pendingForChild.length > 0 && (
        <>
          <Text style={s.section}>추가 시간 요청</Text>
          {pendingForChild.map((req) => (
            <View key={req.id} style={s.reqCard}>
              <View style={s.reqHeader}>
                <Text style={s.reqName}>{req.childName}</Text>
                <View style={s.reqBadge}>
                  <Text style={s.reqBadgeText}>+{req.extraMinutes}분</Text>
                </View>
              </View>
              <Text style={s.reqReason}>"{req.reason}"</Text>
              <View style={s.reqBtns}>
                <TouchableOpacity style={s.rejectBtn} onPress={() => handleReject(req)}>
                  <Text style={s.rejectBtnText}>거절</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.approveBtn} onPress={() => handleApprove(req)}>
                  <Text style={s.approveBtnText}>승인 +{req.extraMinutes}분</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </>
      )}

      <Text style={s.section}>앱 사용량</Text>
      {appEntries.map(([key, a]) => (
        <View key={key} style={s.appCard}>
          <View style={s.appRow}>
            <View style={[s.appIcon, { backgroundColor: a.color }]}><Text style={[s.appIconText, { color: a.tc }]}>{a.code}</Text></View>
            <View style={s.appInfo}>
              <Text style={s.appName}>{a.name}</Text>
              <Text style={s.appTime}>{a.used}분{a.limit ? ` / ${a.limit}분` : ''}</Text>
            </View>
            {a.limit ? (
              <TouchableOpacity style={[s.toggle, s.toggleOn]} onPress={() => handleToggleLimit(key, a)}>
                <View style={[s.toggleThumb, s.toggleThumbOn]} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.unlimit} onPress={() => handleToggleLimit(key, a)}>
                <Text style={s.unlimitText}>제한 없음</Text>
              </TouchableOpacity>
            )}
          </View>
          {a.limit && (
            <View style={s.appLimitRow}>
              <TouchableOpacity
                style={s.appLimitBtn}
                onPress={() => {
                  const next = Math.max(15, a.limit - 15);
                  if (selectedChild) updateAppLimit(familyId, selectedChild.uid, key, next);
                }}
              >
                <Text style={s.appLimitBtnText}>-15</Text>
              </TouchableOpacity>
              <Text style={s.appLimitVal}>{a.limit}분</Text>
              <TouchableOpacity
                style={s.appLimitBtn}
                onPress={() => {
                  const next = Math.min(480, a.limit + 15);
                  if (selectedChild) updateAppLimit(familyId, selectedChild.uid, key, next);
                }}
              >
                <Text style={s.appLimitBtnText}>+15</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ))}

      <Text style={[s.section, { marginTop: 20 }]}>시간표</Text>
      <View style={s.card}>
        {/* 잠자는 시간 */}
        <View style={s.schedRow}>
          <View style={s.schedLeft}>
            <Text style={s.schedName}>🌙 잠자는 시간</Text>
            <TouchableOpacity onPress={() => {
              const updated = { ...schedule, sleep: { ...schedule.sleep, enabled: !schedule.sleep.enabled } };
              setSchedule(updated);
              if (selectedChild) updateSchedule(familyId, selectedChild.uid, updated);
            }}>
              <Text style={s.schedToggle}>{schedule.sleep.enabled ? '켜짐' : '꺼짐'}</Text>
            </TouchableOpacity>
          </View>
          {schedule.sleep.enabled && (
            <View style={s.schedTimes}>
              <TouchableOpacity style={s.schedTimeBtn} onPress={() => setTimePicker({ type: 'sleep', field: 'start' })}>
                <Text style={s.schedTimeText}>{schedule.sleep.start}</Text>
              </TouchableOpacity>
              <Text style={s.schedDash}>~</Text>
              <TouchableOpacity style={s.schedTimeBtn} onPress={() => setTimePicker({ type: 'sleep', field: 'end' })}>
                <Text style={s.schedTimeText}>{schedule.sleep.end}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        {/* 공부 시간 */}
        <View style={[s.schedRow, { borderBottomWidth: 0 }]}>
          <View style={s.schedLeft}>
            <Text style={s.schedName}>📚 공부 시간</Text>
            <TouchableOpacity onPress={() => {
              const updated = { ...schedule, study: { ...schedule.study, enabled: !schedule.study.enabled } };
              setSchedule(updated);
              if (selectedChild) updateSchedule(familyId, selectedChild.uid, updated);
            }}>
              <Text style={s.schedToggle}>{schedule.study.enabled ? '켜짐' : '꺼짐'}</Text>
            </TouchableOpacity>
          </View>
          {schedule.study.enabled && (
            <View style={s.schedTimes}>
              <TouchableOpacity style={s.schedTimeBtn} onPress={() => setTimePicker({ type: 'study', field: 'start' })}>
                <Text style={s.schedTimeText}>{schedule.study.start}</Text>
              </TouchableOpacity>
              <Text style={s.schedDash}>~</Text>
              <TouchableOpacity style={s.schedTimeBtn} onPress={() => setTimePicker({ type: 'study', field: 'end' })}>
                <Text style={s.schedTimeText}>{schedule.study.end}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* 주간 리포트 */}
      <View style={s.card}>
        <TouchableOpacity style={s.row} onPress={() => setShowReport(!showReport)}>
          <Text style={s.cardLabel}>주간 리포트</Text>
          <Text style={s.weeklyToggle}>{showReport ? '접기' : '펼치기'}</Text>
        </TouchableOpacity>
        {showReport && (
          reportData.length === 0 ? (
            <Text style={s.reportEmpty}>아직 기록이 없어요. 내일부터 쌓입니다!</Text>
          ) : (
            <>
              {/* 막대 차트 */}
              <View style={s.reportChart}>
                {reportData.slice().reverse().map((item) => {
                  const pct = item.dailyLimit > 0 ? Math.min(100, Math.round((item.dailyUsage / item.dailyLimit) * 100)) : 0;
                  const over = item.dailyUsage > item.dailyLimit;
                  const dayLabel = DAY_LABELS[new Date(item.date).getDay()];
                  return (
                    <View key={item.date} style={s.reportBarItem}>
                      <View style={s.reportBarBg}>
                        <View style={[s.reportBarFill, { height: `${pct}%`, backgroundColor: over ? Colors.danger : Colors.primary }]} />
                      </View>
                      <Text style={s.reportBarDay}>{dayLabel}</Text>
                      <Text style={s.reportBarVal}>{item.dailyUsage}분</Text>
                    </View>
                  );
                })}
              </View>
              {/* 평균 */}
              <View style={s.reportSummary}>
                <Text style={s.reportSummaryText}>
                  주평균 {Math.round(reportData.reduce((s, d) => s + (d.dailyUsage || 0), 0) / reportData.length)}분 / 일
                </Text>
              </View>
            </>
          )
        )}
      </View>

      {/* 시간 선택 모달 */}
      {timePicker && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setTimePicker(null)}>
          <View style={s.pickerOverlay}>
            <View style={s.pickerCard}>
              <Text style={s.pickerTitle}>
                {timePicker.type === 'sleep' ? '잠자는 시간' : '공부 시간'} - {timePicker.field === 'start' ? '시작' : '종료'}
              </Text>
              <View style={s.pickerGrid}>
                {Array.from({ length: 24 }, (_, h) => {
                  const times = [`${String(h).padStart(2,'0')}:00`, `${String(h).padStart(2,'0')}:30`];
                  return times.map(t => (
                    <TouchableOpacity
                      key={t}
                      style={[s.pickerItem, schedule[timePicker.type][timePicker.field] === t && s.pickerItemActive]}
                      onPress={() => {
                        const updated = {
                          ...schedule,
                          [timePicker.type]: { ...schedule[timePicker.type], [timePicker.field]: t },
                        };
                        setSchedule(updated);
                        if (selectedChild) updateSchedule(familyId, selectedChild.uid, updated);
                        setTimePicker(null);
                      }}
                    >
                      <Text style={[s.pickerItemText, schedule[timePicker.type][timePicker.field] === t && s.pickerItemTextActive]}>{t}</Text>
                    </TouchableOpacity>
                  ));
                })}
              </View>
              <TouchableOpacity style={s.pickerClose} onPress={() => setTimePicker(null)}>
                <Text style={s.pickerCloseText}>닫기</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: Colors.white },
  content:     { padding: 20, paddingTop: 60, paddingBottom: 40 },
  title:       { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  headerRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  tabs:        { flexDirection: 'row', gap: 6 },
  tab:         { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, backgroundColor: Colors.bg },
  tabActive:   { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, backgroundColor: Colors.primaryLight },
  tabText:     { fontSize: 13, color: Colors.textSecondary },
  tabActiveText:{ fontSize: 13, color: Colors.primary, fontWeight: '500' },
  card:        { backgroundColor: Colors.bg, borderRadius: 12, padding: 14, marginBottom: 8 },
  cardLabel:   { fontSize: 13, color: Colors.textSecondary },
  cardVal:     { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  row:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  barBig:      { height: 6, backgroundColor: Colors.border, borderRadius: 3 },
  barFillBig:  { height: 6, backgroundColor: Colors.primary, borderRadius: 3 },
  section:     { fontSize: 15, fontWeight: '600', color: Colors.textPrimary, marginTop: 12, marginBottom: 10 },
  appCard:     { paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  appRow:      { flexDirection: 'row', alignItems: 'center' },
  appIcon:     { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  appIconText: { fontSize: 11, fontWeight: '600' },
  appInfo:     { flex: 1 },
  appName:     { fontSize: 14, color: Colors.textPrimary },
  appTime:     { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  toggle:      { width: 36, height: 20, borderRadius: 10, backgroundColor: Colors.borderMid, padding: 2 },
  toggleOn:    { backgroundColor: Colors.primary },
  toggleThumb: { width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.white },
  toggleThumbOn:{ transform: [{ translateX: 16 }] },
  unlimit:     { backgroundColor: Colors.safeBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  unlimitText: { fontSize: 11, color: Colors.safe, fontWeight: '500' },
  appLimitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 8, gap: 10 },
  appLimitBtn: { backgroundColor: Colors.primaryLight, borderRadius: 6, paddingVertical: 4, paddingHorizontal: 10 },
  appLimitBtnText: { fontSize: 12, fontWeight: '600', color: Colors.primary },
  appLimitVal: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, minWidth: 44, textAlign: 'center' },
  schedRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  schedLeft:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  schedName:   { fontSize: 13, color: Colors.textPrimary },
  schedToggle: { fontSize: 11, color: Colors.primary, fontWeight: '500' },
  schedTimes:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  schedTimeBtn:{ backgroundColor: Colors.primaryLight, borderRadius: 6, paddingVertical: 4, paddingHorizontal: 10 },
  schedTimeText:{ fontSize: 14, fontWeight: '600', color: Colors.primary },
  schedDash:   { fontSize: 13, color: Colors.textSecondary },

  // 시간 선택 모달
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  pickerCard:    { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '85%', maxHeight: '70%' },
  pickerTitle:   { fontSize: 16, fontWeight: '600', color: Colors.textPrimary, textAlign: 'center', marginBottom: 16 },
  pickerGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  pickerItem:    { borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: Colors.bg, minWidth: 60, alignItems: 'center' },
  pickerItemActive: { backgroundColor: Colors.primary },
  pickerItemText:   { fontSize: 13, color: Colors.textPrimary },
  pickerItemTextActive: { color: '#fff', fontWeight: '600' },
  pickerClose:   { marginTop: 16, alignItems: 'center', paddingVertical: 10 },
  pickerCloseText: { fontSize: 14, color: Colors.textSecondary },

  // 일일 제한 설정
  limitSection:{ marginTop: 14, borderTopWidth: 0.5, borderTopColor: Colors.border, paddingTop: 12 },
  limitLabel:  { fontSize: 13, color: Colors.textSecondary, marginBottom: 8 },
  limitRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  limitBtn:    { backgroundColor: Colors.primaryLight, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  limitBtnText:{ fontSize: 14, fontWeight: '600', color: Colors.primary },
  limitValue:  { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, minWidth: 80, textAlign: 'center' },

  // 요일별 제한
  weeklyToggle:    { fontSize: 13, color: Colors.primary, fontWeight: '500' },
  weeklyRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  weeklyRowToday:  { backgroundColor: Colors.primaryLight, borderRadius: 8, paddingHorizontal: 8, marginHorizontal: -8 },
  weeklyDay:       { fontSize: 14, fontWeight: '500', color: Colors.textPrimary, width: 28 },
  weeklyDayToday:  { color: Colors.primary, fontWeight: '700' },
  weeklyControls:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  weeklyBtn:       { backgroundColor: Colors.primaryLight, borderRadius: 6, paddingVertical: 4, paddingHorizontal: 10 },
  weeklyBtnText:   { fontSize: 12, fontWeight: '600', color: Colors.primary },
  weeklyVal:       { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, minWidth: 50, textAlign: 'center' },
  weeklyDisableBtn:{ marginTop: 10, alignItems: 'center', paddingVertical: 8 },
  weeklyDisableText:{ fontSize: 12, color: Colors.textHint },

  // 주간 리포트
  reportEmpty:    { fontSize: 13, color: Colors.textSecondary, marginTop: 6, textAlign: 'center', paddingVertical: 12 },
  reportChart:    { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: 80, marginTop: 10, marginBottom: 4 },
  reportBarItem:  { alignItems: 'center', flex: 1 },
  reportBarBg:    { width: 18, height: 70, backgroundColor: Colors.border, borderRadius: 4, justifyContent: 'flex-end', overflow: 'hidden' },
  reportBarFill:  { width: '100%', borderRadius: 4 },
  reportBarDay:   { fontSize: 11, color: Colors.textSecondary, marginTop: 4 },
  reportBarVal:   { fontSize: 10, color: Colors.textHint, marginTop: 1 },
  reportSummary:  { alignItems: 'center', marginTop: 8 },
  reportSummaryText: { fontSize: 12, color: Colors.textSecondary },
  weeklyPreview:   { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  weeklyPreviewItem:{ alignItems: 'center' },
  weeklyPreviewDay:{ fontSize: 12, color: Colors.textSecondary, marginBottom: 2 },
  weeklyPreviewVal:{ fontSize: 12, fontWeight: '600', color: Colors.textPrimary },

  // 요청 카드
  reqCard:     { backgroundColor: '#FFF8E1', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#FFD54F' },
  reqHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  reqName:     { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  reqBadge:    { backgroundColor: '#F57C00', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  reqBadgeText:{ fontSize: 12, color: '#fff', fontWeight: '600' },
  reqReason:   { fontSize: 13, color: Colors.textSecondary, marginBottom: 12, fontStyle: 'italic' },
  reqBtns:     { flexDirection: 'row', gap: 8 },
  rejectBtn:   { flex: 1, paddingVertical: 9, borderRadius: 8, backgroundColor: Colors.bg, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  rejectBtnText:{ fontSize: 13, color: Colors.textSecondary },
  approveBtn:  { flex: 2, paddingVertical: 9, borderRadius: 8, backgroundColor: Colors.primary, alignItems: 'center' },
  approveBtnText:{ fontSize: 13, fontWeight: '600', color: Colors.white },
});
