import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../constants/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { subscribeScreenTime } from '../../src/services/screentimeService';
import { Colors } from '../../constants/Colors';

function fmt(m) { const h = Math.floor(m / 60); const mm = m % 60; return h > 0 ? `${h}h ${mm}m` : `${mm}m`; }

export default function ParentHome() {
  const { familyId } = useAuth();
  const [children, setChildren] = useState([]);

  useEffect(() => {
    if (!familyId) return;
    // Listen to family doc for live children list
    const unsub = onSnapshot(doc(db, 'families', familyId), async (famSnap) => {
      if (!famSnap.exists()) return;
      const childIds = famSnap.data().children || [];
      const kids = [];
      for (const cid of childIds) {
        const userDoc = await getDoc(doc(db, 'users', cid));
        if (userDoc.exists()) {
          const d = userDoc.data();
          kids.push({ uid: cid, name: d.name || d.email || 'Child', email: d.email });
        }
      }
      setChildren(kids);
    });
    return unsub;
  }, [familyId]);

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>SafeKids</Text>

      {children.length === 0 ? (
        <View style={s.emptyCard}>
          <Text style={s.emptyText}>No children connected</Text>
          <Text style={s.emptyHint}>Go to Settings to invite a child</Text>
        </View>
      ) : (
        children.map(c => <ChildCard key={c.uid} child={c} familyId={familyId} />)
      )}
    </ScrollView>
  );
}

function ChildCard({ child, familyId }) {
  const [screenData, setScreenData] = useState({ usedMinutes: 0, dailyLimit: 240 });
  const [locData, setLocData] = useState(null);

  useEffect(() => {
    const unsub = subscribeScreenTime(familyId, child.uid, setScreenData);
    return unsub;
  }, [familyId, child.uid]);

  useEffect(() => {
    const locRef = doc(db, 'families', familyId, 'locations', child.uid);
    const unsub = onSnapshot(locRef, (snap) => {
      if (snap.exists()) setLocData(snap.data());
    });
    return unsub;
  }, [familyId, child.uid]);

  const pct = screenData.dailyLimit > 0 ? Math.min(100, Math.round((screenData.usedMinutes / screenData.dailyLimit) * 100)) : 0;
  const warn = pct > 80;
  const locationText = locData ? `${locData.latitude.toFixed(4)}, ${locData.longitude.toFixed(4)}` : 'Location unknown';

  return (
    <View style={s.childCard}>
      <View style={s.childHeader}>
        <View style={s.avatar}><Text style={s.avatarText}>{child.name.charAt(0).toUpperCase()}</Text></View>
        <View style={s.childInfo}>
          <Text style={s.childName}>{child.name}</Text>
          <Text style={s.childLoc}>{locationText}</Text>
        </View>
        <View style={[s.badge, { backgroundColor: locData ? Colors.safeBg : Colors.bg }]}>
          <Text style={[s.badgeText, { color: locData ? Colors.safe : Colors.textHint }]}>{locData ? 'Online' : 'Offline'}</Text>
        </View>
      </View>
      <View style={s.stRow}>
        <Text style={s.stLabel}>Screen time</Text>
        <Text style={[s.stVal, warn && { color: Colors.warn }]}>{fmt(screenData.usedMinutes)} / {fmt(screenData.dailyLimit)}</Text>
      </View>
      <View style={s.bar}><View style={[s.barFill, { width: `${pct}%`, backgroundColor: warn ? '#BA7517' : Colors.primary }]} /></View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  content: { padding: 20, paddingTop: 60 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary, marginBottom: 20 },
  emptyCard: { backgroundColor: Colors.bg, borderRadius: 12, padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary, marginBottom: 4 },
  emptyHint: { fontSize: 13, color: Colors.textSecondary },
  childCard: { backgroundColor: Colors.bg, borderRadius: 12, padding: 14, marginBottom: 10 },
  childHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  childInfo: { flex: 1 },
  childName: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  childLoc: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 12, fontWeight: '500' },
  stRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  stLabel: { fontSize: 13, color: Colors.textSecondary },
  stVal: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  bar: { height: 4, backgroundColor: Colors.border, borderRadius: 2 },
  barFill: { height: 4, borderRadius: 2 },
});
