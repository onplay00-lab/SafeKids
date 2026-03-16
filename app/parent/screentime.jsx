import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, Keyboard } from 'react-native';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../constants/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { subscribeScreenTime, setDailyLimit } from '../../src/services/screentimeService';
import { Colors } from '../../constants/Colors';

function fmt(m) { const h = Math.floor(m / 60); const mm = m % 60; return h > 0 ? `${h}h ${mm}m` : `${mm}m`; }

export default function ParentScreenTime() {
  const { familyId } = useAuth();
  const [children, setChildren] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [screenData, setScreenData] = useState({ usedMinutes: 0, dailyLimit: 240 });
  const [editing, setEditing] = useState(false);
  const [inputHours, setInputHours] = useState('');
  const [inputMinutes, setInputMinutes] = useState('');

  // Load children list from family
  useEffect(() => {
    if (!familyId) return;
    async function loadChildren() {
      const famDoc = await getDoc(doc(db, 'families', familyId));
      if (!famDoc.exists()) return;
      const childIds = famDoc.data().children || [];
      const kids = [];
      for (const cid of childIds) {
        const userDoc = await getDoc(doc(db, 'users', cid));
        if (userDoc.exists()) {
          const d = userDoc.data();
          kids.push({ uid: cid, name: d.name || d.email || 'Child', email: d.email });
        }
      }
      setChildren(kids);
    }
    loadChildren();
  }, [familyId]);

  // Subscribe to selected child's screen time
  useEffect(() => {
    if (!familyId || children.length === 0) return;
    const child = children[selectedIdx];
    if (!child) return;
    const unsub = subscribeScreenTime(familyId, child.uid, (data) => {
      setScreenData(data);
    });
    return unsub;
  }, [familyId, children, selectedIdx]);

  const pct = screenData.dailyLimit > 0 ? Math.min(100, Math.round((screenData.usedMinutes / screenData.dailyLimit) * 100)) : 0;
  const warn = pct > 80;
  const remaining = Math.max(0, screenData.dailyLimit - screenData.usedMinutes);

  function handleStartEdit() {
    const h = Math.floor(screenData.dailyLimit / 60);
    const m = screenData.dailyLimit % 60;
    setInputHours(String(h));
    setInputMinutes(String(m));
    setEditing(true);
  }

  function handleSaveLimit() {
    const h = Math.min(23, Math.max(0, parseInt(inputHours, 10) || 0));
    const m = Math.min(59, Math.max(0, parseInt(inputMinutes, 10) || 0));
    const total = h * 60 + m;
    if (total <= 0) {
      Alert.alert('Invalid', 'Limit must be at least 1 minute.');
      return;
    }
    if (total > 1440) {
      Alert.alert('Invalid', 'Limit cannot exceed 24 hours.');
      return;
    }
    const child = children[selectedIdx];
    if (child) setDailyLimit(familyId, child.uid, total);
    setEditing(false);
    Keyboard.dismiss();
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>Screen time</Text>

      {children.length === 0 ? (
        <View style={s.emptyCard}>
          <Text style={s.emptyText}>No children connected yet.</Text>
          <Text style={s.emptyHint}>Go to Settings to generate an invite code.</Text>
        </View>
      ) : (
        <>
          {/* Child tabs */}
          <View style={s.tabs}>
            {children.map((c, i) => (
              <TouchableOpacity key={c.uid} style={i === selectedIdx ? s.tabActive : s.tab} onPress={() => setSelectedIdx(i)}>
                <Text style={i === selectedIdx ? s.tabActiveText : s.tabText}>{c.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Today usage */}
          <View style={s.card}>
            <View style={s.row}>
              <Text style={s.cardLabel}>Today</Text>
              <Text style={[s.cardVal, warn && { color: Colors.warn }]}>{fmt(screenData.usedMinutes)} / {fmt(screenData.dailyLimit)}</Text>
            </View>
            <View style={s.barBig}><View style={[s.barFillBig, { width: `${pct}%`, backgroundColor: warn ? '#BA7517' : Colors.primary }]} /></View>
            <Text style={s.remaining}>Remaining: {fmt(remaining)}</Text>
          </View>

          {/* Limit setting */}
          <Text style={s.section}>Daily limit</Text>
          {editing ? (
            <View style={s.limitCard}>
              <View style={s.inputRow}>
                <View style={s.inputGroup}>
                  <TextInput style={s.limitInput} value={inputHours} onChangeText={setInputHours} keyboardType="number-pad" maxLength={2} placeholder="0" />
                  <Text style={s.inputLabel}>hours</Text>
                </View>
                <Text style={s.inputColon}>:</Text>
                <View style={s.inputGroup}>
                  <TextInput style={s.limitInput} value={inputMinutes} onChangeText={setInputMinutes} keyboardType="number-pad" maxLength={2} placeholder="0" />
                  <Text style={s.inputLabel}>min</Text>
                </View>
              </View>
              <View style={s.btnRow}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setEditing(false)}><Text style={s.cancelBtnText}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity style={s.saveBtn} onPress={handleSaveLimit}><Text style={s.saveBtnText}>Save</Text></TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={s.limitCard} onPress={handleStartEdit}>
              <Text style={s.limitVal}>{fmt(screenData.dailyLimit)}</Text>
              <Text style={s.limitHint}>Tap to change</Text>
            </TouchableOpacity>
          )}

          {/* Info */}
          <View style={[s.card, { marginTop: 16 }]}>
            <Text style={s.infoText}>Screen time tracks how long the SafeKids app is active on the child's device. Per-app usage tracking requires a development build.</Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary, marginBottom: 16 },
  tabs: { flexDirection: 'row', gap: 6, marginBottom: 16 },
  tab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, backgroundColor: Colors.bg },
  tabActive: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, backgroundColor: Colors.primaryLight },
  tabText: { fontSize: 13, color: Colors.textSecondary },
  tabActiveText: { fontSize: 13, color: Colors.primary, fontWeight: '500' },
  card: { backgroundColor: Colors.bg, borderRadius: 12, padding: 14, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardLabel: { fontSize: 13, color: Colors.textSecondary },
  cardVal: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  barBig: { height: 6, backgroundColor: Colors.border, borderRadius: 3 },
  barFillBig: { height: 6, backgroundColor: Colors.primary, borderRadius: 3 },
  remaining: { fontSize: 12, color: Colors.textHint, marginTop: 6, textAlign: 'right' },
  section: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary, marginTop: 16, marginBottom: 10 },
  limitCard: { backgroundColor: Colors.primaryLight, borderRadius: 12, padding: 20, alignItems: 'center' },
  limitVal: { fontSize: 28, fontWeight: '700', color: Colors.primary },
  limitHint: { fontSize: 12, color: Colors.textHint, marginTop: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  inputGroup: { alignItems: 'center' },
  limitInput: { width: 64, height: 48, fontSize: 24, fontWeight: '700', color: Colors.primary, textAlign: 'center', backgroundColor: Colors.white, borderRadius: 10, borderWidth: 1, borderColor: Colors.primaryMid },
  inputLabel: { fontSize: 12, color: Colors.textHint, marginTop: 4 },
  inputColon: { fontSize: 24, fontWeight: '700', color: Colors.primary, marginBottom: 16 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: Colors.borderMid, alignItems: 'center' },
  cancelBtnText: { fontSize: 14, color: Colors.textSecondary },
  saveBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: Colors.primary, alignItems: 'center' },
  saveBtnText: { fontSize: 14, fontWeight: '600', color: Colors.white },
  emptyCard: { backgroundColor: Colors.bg, borderRadius: 12, padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary, marginBottom: 4 },
  emptyHint: { fontSize: 13, color: Colors.textSecondary },
  infoText: { fontSize: 12, color: Colors.textHint, lineHeight: 18 },
});
