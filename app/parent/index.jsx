import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../constants/firebase';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../contexts/AuthContext';
import { subscribeScreentime } from '../../src/services/screentimeService';

const CHILD_COLORS = [
  { color: Colors.primaryLight, textColor: Colors.primary },
  { color: '#FBEAF0', textColor: '#72243E' },
  { color: '#EAF3DE', textColor: '#27500A' },
];

function fmt(m) { const h = Math.floor(m / 60); const mm = m % 60; return h > 0 ? `${h}h ${mm}m` : `${mm}m`; }

export default function ParentHome() {
  const { familyId } = useAuth();
  const [children, setChildren] = useState([]);
  const [screenMap, setScreenMap] = useState({});

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

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>SafeKids</Text>
      {children.map((c) => {
        const sd = screenMap[c.uid];
        return (
          <TouchableOpacity key={c.uid} style={s.childCard}>
            <View style={[s.avatar, { backgroundColor: c.color }]}><Text style={[s.avatarText, { color: c.textColor }]}>{c.initials}</Text></View>
            <View style={s.childInfo}><Text style={s.childName}>{c.name}</Text><Text style={s.childLoc}>{sd ? `Screen ${fmt(sd.dailyUsage || 0)}` : 'No data'}</Text></View>
            <View style={[s.badge, { backgroundColor: Colors.safeBg }]}><Text style={[s.badgeText, { color: Colors.safe }]}>Safe</Text></View>
          </TouchableOpacity>
        );
      })}
      <View style={s.card}>
        <Text style={s.cardLabel}>Today screen time</Text>
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
                <Text style={s.usageLimit}>Limit {fmt(limitMin)}</Text>
              </View>
            );
          })}
        </View>
      </View>
      <View style={s.card}>
        <Text style={s.cardLabel}>Recent alerts</Text>
        <Text style={s.notiText}>No recent alerts</Text>
      </View>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  container:{flex:1, backgroundColor:Colors.white},
  content:{padding:20, paddingTop:60},
  title:{fontSize:22, fontWeight:'700', color:Colors.textPrimary, marginBottom:20},
  childCard:{flexDirection:'row', alignItems:'center', padding:14, backgroundColor:Colors.bg, borderRadius:12, marginBottom:8},
  avatar:{width:40, height:40, borderRadius:20, alignItems:'center', justifyContent:'center', marginRight:12},
  avatarText:{fontSize:14, fontWeight:'600'},
  childInfo:{flex:1},
  childName:{fontSize:15, fontWeight:'600', color:Colors.textPrimary},
  childLoc:{fontSize:12, color:Colors.textSecondary, marginTop:2},
  badge:{paddingHorizontal:10, paddingVertical:4, borderRadius:12},
  badgeText:{fontSize:12, fontWeight:'500'},
  card:{backgroundColor:Colors.bg, borderRadius:12, padding:14, marginTop:12},
  cardLabel:{fontSize:13, color:Colors.textSecondary, marginBottom:10},
  usageRow:{flexDirection:'row', gap:16},
  usageItem:{flex:1},
  usageName:{fontSize:12, color:Colors.textSecondary, marginBottom:4},
  usageTime:{fontSize:18, fontWeight:'600', color:Colors.textPrimary, marginBottom:6},
  bar:{height:4, backgroundColor:Colors.border, borderRadius:2},
  barFill:{height:4, borderRadius:2},
  usageLimit:{fontSize:11, color:Colors.textHint, marginTop:4},
  notiText:{fontSize:13, color:Colors.textPrimary, marginTop:4},
  notiTime:{fontSize:11, color:Colors.textHint, marginTop:3},
});