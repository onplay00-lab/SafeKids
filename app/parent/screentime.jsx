import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { doc, getDoc, collection, query, onSnapshot, orderBy, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../constants/firebase';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../contexts/AuthContext';
import { subscribeScreentime, updateAppLimit, updateDailyLimit } from '../../src/services/screentimeService';

function fmt(m) { const h = Math.floor(m / 60); const mm = m % 60; return h > 0 ? `${h}h ${mm}m` : `${mm}m`; }

export default function ParentScreenTime() {
  const { familyId } = useAuth();
  const [children, setChildren]     = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [screenData, setScreenData] = useState(null);
  const [requests, setRequests]     = useState([]);

  // 가족 내 아이 목록 로드
  useEffect(() => {
    if (!familyId) return;
    async function loadChildren() {
      const famDoc = await getDoc(doc(db, 'families', familyId));
      if (!famDoc.exists()) return;
      const childUids = famDoc.data().children || [];
      const list = await Promise.all(childUids.map(async (uid) => {
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
    const unsub = subscribeScreentime(familyId, child.uid, (data) => setScreenData(data));
    return () => unsub();
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
        <Text style={s.title}>Screen time</Text>
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

      <Text style={s.section}>App usage</Text>
      {appEntries.map(([key, a]) => (
        <View key={key} style={s.appCard}>
          <View style={s.appRow}>
            <View style={[s.appIcon, { backgroundColor: a.color }]}><Text style={[s.appIconText, { color: a.tc }]}>{a.code}</Text></View>
            <View style={s.appInfo}>
              <Text style={s.appName}>{a.name}</Text>
              <Text style={s.appTime}>{a.used}min{a.limit ? ` / ${a.limit}min` : ''}</Text>
            </View>
            {a.limit ? (
              <TouchableOpacity style={[s.toggle, s.toggleOn]} onPress={() => handleToggleLimit(key, a)}>
                <View style={[s.toggleThumb, s.toggleThumbOn]} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.unlimit} onPress={() => handleToggleLimit(key, a)}>
                <Text style={s.unlimitText}>No limit</Text>
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

      <Text style={[s.section, { marginTop: 20 }]}>Schedule</Text>
      <View style={s.card}>
        <View style={s.schedRow}><Text style={s.schedName}>Sleep time</Text><Text style={s.schedTime}>22:00 - 07:00</Text></View>
        <View style={[s.schedRow, { borderBottomWidth: 0 }]}><Text style={s.schedName}>Study time</Text><Text style={s.schedTime}>16:00 - 18:00</Text></View>
      </View>
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
  schedRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  schedName:   { fontSize: 13, color: Colors.textPrimary },
  schedTime:   { fontSize: 13, color: Colors.textSecondary },

  // 일일 제한 설정
  limitSection:{ marginTop: 14, borderTopWidth: 0.5, borderTopColor: Colors.border, paddingTop: 12 },
  limitLabel:  { fontSize: 13, color: Colors.textSecondary, marginBottom: 8 },
  limitRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  limitBtn:    { backgroundColor: Colors.primaryLight, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  limitBtnText:{ fontSize: 14, fontWeight: '600', color: Colors.primary },
  limitValue:  { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, minWidth: 80, textAlign: 'center' },

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
