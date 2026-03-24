import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../constants/firebase';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../contexts/AuthContext';
import { subscribeScreentime } from '../../src/services/screentimeService';
import { subscribeSOS } from '../../src/services/sosService';

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

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>SafeKids</Text>

      {/* SOS 배너: 최근 미해결 SOS가 있으면 표시 */}
      {sosAlerts.filter(a => !a.resolved).slice(0, 1).map(a => (
        <View key={a.id} style={s.sosBanner}>
          <Text style={s.sosBannerText}>🚨 {a.childName} SOS 알림 · {timeAgo(a.createdAt)}</Text>
        </View>
      ))}

      {children.map((c) => {
        const sd = screenMap[c.uid];
        const hasSOS = sosAlerts.some(a => a.childUid === c.uid && !a.resolved);
        return (
          <TouchableOpacity key={c.uid} style={s.childCard}>
            <View style={[s.avatar, { backgroundColor: c.color }]}><Text style={[s.avatarText, { color: c.textColor }]}>{c.initials}</Text></View>
            <View style={s.childInfo}><Text style={s.childName}>{c.name}</Text><Text style={s.childLoc}>{sd ? `사용 ${fmt(sd.dailyUsage || 0)}` : '데이터 없음'}</Text></View>
            <View style={[s.badge, { backgroundColor: hasSOS ? Colors.dangerBg : Colors.safeBg }]}>
              <Text style={[s.badgeText, { color: hasSOS ? Colors.danger : Colors.safe }]}>
                {hasSOS ? 'SOS!' : '안전'}
              </Text>
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
        <Text style={s.cardLabel}>최근 알림</Text>
        {sosAlerts.length === 0 ? (
          <Text style={s.notiText}>알림 없음</Text>
        ) : (
          sosAlerts.slice(0, 5).map(a => (
            <View key={a.id} style={s.alertRow}>
              <Text style={s.alertIcon}>🚨</Text>
              <View style={s.alertInfo}>
                <Text style={s.alertText}>{a.childName} SOS</Text>
                <Text style={s.alertTime}>{timeAgo(a.createdAt)}</Text>
              </View>
              {!a.resolved && <View style={s.alertDot} />}
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  content: { padding: 20, paddingTop: 60 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary, marginBottom: 20 },
  sosBanner: { backgroundColor: Colors.dangerBg, borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#F09595' },
  sosBannerText: { fontSize: 14, fontWeight: '600', color: Colors.danger },
  childCard: { flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: Colors.bg, borderRadius: 12, marginBottom: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { fontSize: 14, fontWeight: '600' },
  childInfo: { flex: 1 },
  childName: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  childLoc: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
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
});
