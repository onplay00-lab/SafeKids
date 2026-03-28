import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { doc, getDoc, onSnapshot, collection, query, orderBy, limit, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../constants/firebase';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../contexts/AuthContext';
import { subscribeScreentime } from '../../src/services/screentimeService';
import { subscribeSOS, resolveSOS } from '../../src/services/sosService';

const CHILD_COLORS = [
  { color: Colors.primaryLight, textColor: Colors.primary },
  { color: '#FBEAF0', textColor: '#72243E' },
  { color: '#EAF3DE', textColor: '#27500A' },
];

function fmt(m) { const h = Math.floor(m / 60); const mm = m % 60; return h > 0 ? `${h}시간 ${mm}분` : `${mm}분`; }

function timeAgo(date) {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

export default function ParentHome() {
  const { familyId } = useAuth();
  const [children, setChildren] = useState([]);
  const [screenMap, setScreenMap] = useState({});
  const [sosAlerts, setSosAlerts] = useState([]);
  const [locationMap, setLocationMap] = useState({});
  const [presenceMap, setPresenceMap] = useState({});
  const [geoAlerts, setGeoAlerts] = useState([]);
  const [timeRequests, setTimeRequests] = useState([]);
  const [showAllAlerts, setShowAllAlerts] = useState(false);

  // 가족 내 아이 목록 로드
  useEffect(() => {
    if (!familyId) return;
    async function loadChildren() {
      const famDoc = await getDoc(doc(db, 'families', familyId));
      if (!famDoc.exists()) return;
      const childUids = famDoc.data().children || [];
      const list = await Promise.all(childUids.map(async (uid, i) => {
        const userDoc = await getDoc(doc(db, 'users', uid));
        const name = userDoc.exists() ? (userDoc.data().name || userDoc.data().email?.split('@')[0]) : uid;
        const initials = name.substring(0, 2).toUpperCase();
        const colors = CHILD_COLORS[i % CHILD_COLORS.length];
        return { uid, name, initials, ...colors };
      }));
      setChildren(list);
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
      })
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
    });
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
    });
    return unsub;
  }, [familyId]);

  async function handleLoudSignal(child) {
    Alert.alert(
      '📢 큰소리 신호',
      `${child.name}에게 큰소리 알림을 보낼까요?\n무음 모드에서도 소리가 울립니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '보내기', onPress: async () => {
            try {
              await addDoc(collection(db, 'families', familyId, 'loudSignals'), {
                childUid: child.uid,
                message: '부모님이 연락을 원해요!',
                createdAt: serverTimestamp(),
              });
              Alert.alert('전송 완료', `${child.name}에게 큰소리 신호를 보냈습니다.`);
            } catch (e) { Alert.alert('오류', '전송에 실패했습니다'); }
          }
        },
      ]
    );
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>SafeKids</Text>

      {/* SOS 배너: 최근 미해결 SOS가 있으면 표시 */}
      {sosAlerts.filter(a => !a.resolved).slice(0, 1).map(a => (
        <View key={a.id} style={s.sosBanner}>
          <View style={{ flex: 1 }}>
            <Text style={s.sosBannerText}>🚨 {a.childName} SOS 알림 · {timeAgo(a.createdAt)}</Text>
          </View>
          <TouchableOpacity style={s.sosBannerBtn} onPress={() => resolveSOS(familyId, a.id)}>
            <Text style={s.sosBannerBtnText}>확인 완료</Text>
          </TouchableOpacity>
        </View>
      ))}

      {children.map((c) => {
        const sd = screenMap[c.uid];
        const loc = locationMap[c.uid];
        const presence = presenceMap[c.uid];
        const hasSOS = sosAlerts.some(a => a.childUid === c.uid && !a.resolved);
        const battery = loc?.battery ?? -1;
        const charging = loc?.charging ?? false;
        const lowBattery = battery >= 0 && battery <= 20 && !charging;
        const isOnline = presence?.isOnline === true;
        const lastSeen = presence?.lastSeen?.toDate?.();
        return (
          <TouchableOpacity key={c.uid} style={s.childCard}>
            <View style={s.avatarWrap}>
              <View style={[s.avatar, { backgroundColor: c.color }]}><Text style={[s.avatarText, { color: c.textColor }]}>{c.initials}</Text></View>
              <View style={[s.onlineDot, { backgroundColor: isOnline ? Colors.safe : Colors.border }]} />
            </View>
            <View style={s.childInfo}>
              <View style={s.childNameRow}>
                <Text style={s.childName}>{c.name}</Text>
                <Text style={[s.onlineText, { color: isOnline ? Colors.safe : Colors.textHint }]}>
                  {isOnline ? '온라인' : lastSeen ? timeAgo(lastSeen) : '오프라인'}
                </Text>
              </View>
              <View style={s.childSubRow}>
                <Text style={s.childLoc}>{sd ? `사용 ${fmt(sd.dailyUsage || 0)}` : '데이터 없음'}</Text>
                {battery >= 0 && (
                  <Text style={[s.batteryText, lowBattery && s.batteryLow]}>
                    {charging ? '⚡' : '🔋'}{battery}%
                  </Text>
                )}
              </View>
            </View>
            <View style={s.cardActions}>
              <TouchableOpacity style={s.loudBtn} onPress={() => handleLoudSignal(c)}>
                <Text style={s.loudBtnText}>📢</Text>
              </TouchableOpacity>
              <View style={[s.badge, { backgroundColor: hasSOS ? Colors.dangerBg : lowBattery ? '#FFF3E0' : Colors.safeBg }]}>
                <Text style={[s.badgeText, { color: hasSOS ? Colors.danger : lowBattery ? '#E65100' : Colors.safe }]}>
                  {hasSOS ? 'SOS!' : lowBattery ? '저전력' : '안전'}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      })}

      <View style={s.card}>
        <Text style={s.cardLabel}>오늘 사용 시간</Text>
        <View style={s.usageRow}>
          {children.map((c) => {
            const sd = screenMap[c.uid];
            const usedMin = sd?.dailyUsage || 0;
            const limitMin = sd?.dailyLimit || 240;
            const pct = limitMin > 0 ? Math.round((usedMin / limitMin) * 100) : 0;
            const warn = pct > 80;
            return (
              <View key={c.uid} style={s.usageItem}>
                <Text style={s.usageName}>{c.name}</Text>
                <Text style={[s.usageTime, warn && { color: Colors.warn }]}>{fmt(usedMin)}</Text>
                <View style={s.bar}><View style={[s.barFill, { width: `${Math.min(100, pct)}%`, backgroundColor: warn ? '#BA7517' : Colors.primary }]} /></View>
                <Text style={s.usageLimit}>제한 {fmt(limitMin)}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={s.card}>
        <TouchableOpacity style={s.alertHeader} onPress={() => setShowAllAlerts(!showAllAlerts)}>
          <Text style={s.cardLabel}>알림 이력</Text>
          <Text style={s.alertToggle}>{showAllAlerts ? '접기' : '전체 보기'}</Text>
        </TouchableOpacity>
        {(() => {
          const allAlerts = [
            ...sosAlerts.map(a => ({ ...a, type: 'sos' })),
            ...geoAlerts,
            ...timeRequests,
          ].sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0));
          const displayed = showAllAlerts ? allAlerts : allAlerts.slice(0, 5);
          if (allAlerts.length === 0) return <Text style={s.notiText}>알림 없음</Text>;
          return displayed.map(a => {
            const icon = a.type === 'sos' ? '🚨' : a.type === 'geo' ? (a.alertType === 'enter' ? '📍' : '🚶') : '⏰';
            const text = a.type === 'sos'
              ? `${a.childName} SOS`
              : a.type === 'geo'
              ? `${a.childName} ${a.geofenceName} ${a.alertType === 'enter' ? '도착' : '이탈'}`
              : `${a.childName} +${a.extraMinutes}분 요청`;
            const statusText = a.type === 'sos'
              ? (a.resolved ? ' · 확인됨' : '')
              : a.type === 'time'
              ? (a.status === 'approved' ? ' · 승인' : a.status === 'rejected' ? ' · 거절' : ' · 대기중')
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
                    <Text style={s.resolveBtnText}>확인</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          });
        })()}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  content: { padding: 20, paddingTop: 60 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary, marginBottom: 20 },
  sosBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.dangerBg, borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#F09595' },
  sosBannerText: { fontSize: 14, fontWeight: '600', color: Colors.danger },
  sosBannerBtn: { backgroundColor: Colors.danger, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginLeft: 10 },
  sosBannerBtnText: { fontSize: 12, fontWeight: '600', color: Colors.white },
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
});
