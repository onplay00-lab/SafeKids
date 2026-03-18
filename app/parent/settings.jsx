import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useRouter } from 'expo-router';
import { db, auth } from '../../constants/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Colors } from '../../constants/Colors';
import { addPromise, deletePromise, subscribePromises } from '../../src/services/promiseService';

function generateCode() { return Math.random().toString(36).substring(2,8).toUpperCase(); }

const NOTIF_ITEMS = [
  { key: 'geofence',    label: '지오펜스 알림',  desc: '자녀 안전 구역 진입/이탈' },
  { key: 'sos',         label: 'SOS 알림',       desc: '자녀 긴급 신호' },
  { key: 'timeRequest', label: '시간 요청 알림', desc: '자녀의 추가 시간 요청' },
];

const DEFAULT_NOTIF = { geofence: true, sos: true, timeRequest: true };

export default function ParentSettings() {
  const router = useRouter();
  const { user, familyId, setFamilyId } = useAuth();
  const [inviteCode, setInviteCode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notifSettings, setNotifSettings] = useState(DEFAULT_NOTIF);
  const [notifLoading, setNotifLoading] = useState(false);
  const [promises, setPromises] = useState([]);
  const [newPromiseText, setNewPromiseText] = useState('');
  const [showAddInput, setShowAddInput] = useState(false);

  // 약속 목록 구독
  useEffect(() => {
    if (!familyId) return;
    return subscribePromises(familyId, setPromises);
  }, [familyId]);

  async function handleAddPromise() {
    const text = newPromiseText.trim();
    if (!text || !familyId) return;
    await addPromise(familyId, text);
    setNewPromiseText('');
    setShowAddInput(false);
  }

  function handleDeletePromise(p) {
    Alert.alert('약속 삭제', `"${p.text}" 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => deletePromise(familyId, p.id) },
    ]);
  }

  // 알림 설정 로드
  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists() && snap.data().notificationSettings) {
          setNotifSettings({ ...DEFAULT_NOTIF, ...snap.data().notificationSettings });
        }
      } catch (e) {
        console.error('알림 설정 로드 실패:', e);
      }
    })();
  }, [user?.uid]);

  async function handleToggleNotif(key) {
    if (notifLoading) return;
    const newSettings = { ...notifSettings, [key]: !notifSettings[key] };
    setNotifSettings(newSettings);
    setNotifLoading(true);
    try {
      await setDoc(
        doc(db, 'users', user.uid),
        { notificationSettings: newSettings },
        { merge: true }
      );
    } catch (e) {
      console.error('알림 설정 저장 실패:', e);
      // 실패 시 되돌리기
      setNotifSettings(notifSettings);
    } finally {
      setNotifLoading(false);
    }
  }

  async function handleShowInviteCode() {
    if (!user) return;
    setLoading(true);
    try {
      if (familyId) {
        const famDoc = await getDoc(doc(db, 'families', familyId));
        if (famDoc.exists() && famDoc.data().inviteCode) {
          setInviteCode(famDoc.data().inviteCode);
        } else {
          const code = generateCode();
          await updateDoc(doc(db, 'families', familyId), { inviteCode: code });
          setInviteCode(code);
        }
      } else {
        const code = generateCode();
        const newFamilyId = user.uid;
        await setDoc(doc(db, 'families', newFamilyId), {
          parentId: user.uid,
          inviteCode: code,
          children: [],
          createdAt: new Date().toISOString(),
        });
        await updateDoc(doc(db, 'users', user.uid), { familyId: newFamilyId });
        setFamilyId(newFamilyId);
        setInviteCode(code);
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to get invite code');
    }
    setLoading(false);
  }

  async function handleLogout() {
    await signOut(auth);
    router.replace('/login');
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>Settings</Text>
      <View style={s.profile}>
        <View style={s.profileAvatar}><Text style={s.profileAvatarText}>P</Text></View>
        <Text style={s.profileName}>Parent account</Text>
        <Text style={s.profileEmail}>{user?.email || ''}</Text>
      </View>

      <Text style={s.section}>Invite code</Text>
      {inviteCode ? (
        <View style={s.codeBox}>
          <Text style={s.codeLabel}>Share this code with your child</Text>
          <Text style={s.codeText}>{inviteCode}</Text>
          <Text style={s.codeHint}>Child enters this on Family Connect screen</Text>
        </View>
      ) : (
        <TouchableOpacity style={s.addBtn} onPress={handleShowInviteCode} disabled={loading}>
          {loading ? <ActivityIndicator color={Colors.primary} /> : <Text style={s.addBtnText}>+ Add child (invite code)</Text>}
        </TouchableOpacity>
      )}

      <Text style={[s.section, {marginTop:24}]}>Family promise</Text>
      <View style={s.card}>
        {promises.length === 0 && !showAddInput && (
          <Text style={s.emptyHint}>아직 약속이 없어요. 추가해보세요!</Text>
        )}
        {promises.map((p) => (
          <TouchableOpacity key={p.id} style={s.promiseRow} onLongPress={() => handleDeletePromise(p)}>
            <Text style={s.promiseText}>{p.text}</Text>
            <Text style={s.promiseDelete}>×</Text>
          </TouchableOpacity>
        ))}
        {showAddInput ? (
          <View style={s.addRow}>
            <TextInput
              style={s.addInput}
              placeholder="새 약속 입력"
              placeholderTextColor={Colors.textHint}
              value={newPromiseText}
              onChangeText={setNewPromiseText}
              onSubmitEditing={handleAddPromise}
              autoFocus
            />
            <TouchableOpacity style={s.addSaveBtn} onPress={handleAddPromise}>
              <Text style={s.addSaveBtnText}>추가</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setShowAddInput(false); setNewPromiseText(''); }}>
              <Text style={s.addCancelText}>취소</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={s.addPromiseBtn} onPress={() => setShowAddInput(true)}>
            <Text style={s.addPromiseBtnText}>+ 약속 추가</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={[s.section, {marginTop:24}]}>알림 설정</Text>
      <View style={s.card}>
        {NOTIF_ITEMS.map(({ key, label, desc }, i) => {
          const isOn = notifSettings[key];
          return (
            <TouchableOpacity
              key={key}
              style={[s.settingRow, i < NOTIF_ITEMS.length - 1 && s.settingRowBorder]}
              onPress={() => handleToggleNotif(key)}
              activeOpacity={0.7}
            >
              <View style={s.settingInfo}>
                <Text style={s.settingName}>{label}</Text>
                <Text style={s.settingDesc}>{desc}</Text>
              </View>
              <View style={[s.toggle, isOn && s.toggleOn]}>
                <View style={[s.toggleThumb, isOn && s.toggleThumbOn]} />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
        <Text style={s.logoutText}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container:        { flex: 1, backgroundColor: Colors.white },
  content:          { padding: 20, paddingTop: 60, paddingBottom: 40 },
  title:            { fontSize: 22, fontWeight: '700', color: Colors.textPrimary, marginBottom: 20 },
  profile:          { alignItems: 'center', marginBottom: 24 },
  profileAvatar:    { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  profileAvatarText:{ fontSize: 20, fontWeight: '600', color: Colors.primary },
  profileName:      { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  profileEmail:     { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  section:          { fontSize: 15, fontWeight: '600', color: Colors.textPrimary, marginBottom: 10 },
  addBtn:           { alignItems: 'center', paddingVertical: 14, borderWidth: 1, borderColor: Colors.primaryMid, borderRadius: 10, backgroundColor: Colors.primaryLight },
  addBtnText:       { fontSize: 14, fontWeight: '500', color: Colors.primary },
  codeBox:          { alignItems: 'center', backgroundColor: Colors.primaryLight, borderRadius: 14, padding: 24 },
  codeLabel:        { fontSize: 13, color: Colors.textSecondary, marginBottom: 8 },
  codeText:         { fontSize: 36, fontWeight: '700', color: Colors.primary, letterSpacing: 6, marginBottom: 8 },
  codeHint:         { fontSize: 12, color: Colors.textHint },
  card:             { backgroundColor: Colors.bg, borderRadius: 12, padding: 14 },
  emptyHint:        { fontSize: 13, color: Colors.textHint, textAlign: 'center', paddingVertical: 8 },
  promiseRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  promiseText:      { fontSize: 14, color: Colors.textPrimary, flex: 1 },
  promiseDelete:    { fontSize: 20, color: Colors.textHint, paddingLeft: 12 },
  addRow:           { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  addInput:         { flex: 1, backgroundColor: Colors.white, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: Colors.textPrimary, borderWidth: 1, borderColor: Colors.border },
  addSaveBtn:       { backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  addSaveBtnText:   { fontSize: 13, fontWeight: '600', color: Colors.white },
  addCancelText:    { fontSize: 13, color: Colors.textSecondary },
  addPromiseBtn:    { marginTop: 10, alignItems: 'center', paddingVertical: 8 },
  addPromiseBtnText:{ fontSize: 13, fontWeight: '500', color: Colors.primary },
  settingRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  settingRowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  settingInfo:      { flex: 1, marginRight: 12 },
  settingName:      { fontSize: 14, fontWeight: '500', color: Colors.textPrimary },
  settingDesc:      { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  toggle:           { width: 44, height: 24, borderRadius: 12, backgroundColor: Colors.borderMid, padding: 2 },
  toggleOn:         { backgroundColor: Colors.primary },
  toggleThumb:      { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.white },
  toggleThumbOn:    { transform: [{ translateX: 20 }] },
  logoutBtn:        { alignItems: 'center', paddingVertical: 14, marginTop: 32, borderWidth: 1, borderColor: Colors.border, borderRadius: 10 },
  logoutText:       { fontSize: 14, color: Colors.danger },
});
