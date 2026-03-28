import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, ActivityIndicator, Linking } from 'react-native';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, auth } from '../../constants/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Colors } from '../../constants/Colors';
import { addPromise, deletePromise, subscribePromises } from '../../src/services/promiseService';

function generateCode() { return Math.random().toString(36).substring(2,8).toUpperCase(); }

// 자녀 이름 Firestore에 저장
async function saveChildName(familyId, childUid, name) {
  await updateDoc(doc(db, 'families', familyId), {
    [`childNames.${childUid}`]: name,
  });
}

const NOTIF_ITEMS = [
  { key: 'geofence',    label: '지오펜스 알림',  desc: '자녀 안전 구역 진입/이탈' },
  { key: 'sos',         label: 'SOS 알림',       desc: '자녀 긴급 신호' },
  { key: 'timeRequest', label: '시간 요청 알림', desc: '자녀의 추가 시간 요청' },
  { key: 'battery',     label: '저배터리 알림',  desc: '자녀 기기 배터리 20% 이하' },
];

const DEFAULT_NOTIF = { geofence: true, sos: true, timeRequest: true, battery: true };

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
  const [childList, setChildList] = useState([]);
  const [childNames, setChildNames] = useState({});
  const [editingChild, setEditingChild] = useState(null);
  const [editName, setEditName] = useState('');
  const [contacts, setContacts] = useState([]);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [showAddContact, setShowAddContact] = useState(false);

  // 자녀 목록 및 이름 로드
  useEffect(() => {
    if (!familyId) return;
    async function load() {
      const famDoc = await getDoc(doc(db, 'families', familyId));
      if (!famDoc.exists()) return;
      const data = famDoc.data();
      const childUids = data.children || [];
      const names = data.childNames || {};
      setChildNames(names);
      const list = await Promise.all(childUids.map(async (uid) => {
        const userDoc = await getDoc(doc(db, 'users', uid));
        const email = userDoc.exists() ? userDoc.data().email : '';
        return { uid, email, defaultName: email?.split('@')[0] || uid };
      }));
      setChildList(list);
    }
    load();
  }, [familyId]);

  async function handleSaveChildName(uid) {
    const name = editName.trim();
    if (!name) return;
    await saveChildName(familyId, uid, name);
    setChildNames((prev) => ({ ...prev, [uid]: name }));
    setEditingChild(null);
    setEditName('');
  }

  // 약속 목록 구독
  useEffect(() => {
    if (!familyId) return;
    return subscribePromises(familyId, setPromises);
  }, [familyId]);

  // 긴급연락처 로드
  useEffect(() => {
    if (!familyId) return;
    getDoc(doc(db, 'families', familyId)).then((snap) => {
      if (snap.exists()) setContacts(snap.data().emergencyContacts || []);
    });
  }, [familyId]);

  async function handleAddContact() {
    const name = newContactName.trim();
    const phone = newContactPhone.trim().replace(/[^0-9]/g, '');
    if (!name || !phone) { Alert.alert('이름과 전화번호를 입력해주세요'); return; }
    const updated = [...contacts, { name, phone, id: Date.now().toString() }];
    setContacts(updated);
    await updateDoc(doc(db, 'families', familyId), { emergencyContacts: updated });
    setNewContactName('');
    setNewContactPhone('');
    setShowAddContact(false);
  }

  async function handleDeleteContact(id) {
    const updated = contacts.filter((c) => c.id !== id);
    setContacts(updated);
    await updateDoc(doc(db, 'families', familyId), { emergencyContacts: updated });
  }

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
      Alert.alert('오류', '초대 코드 생성에 실패했습니다');
    }
    setLoading(false);
  }

  async function handleLogout() {
    try {
      await AsyncStorage.multiRemove([
        'login_autoLogin',
        'login_savedPassword',
      ]);
      await AsyncStorage.setItem('logged_out', 'true');
      await signOut(auth);
      router.replace('/login');
    } catch (e) {
      Alert.alert('오류', '로그아웃에 실패했습니다');
    }
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>설정</Text>
      <View style={s.profile}>
        <View style={s.profileAvatar}><Text style={s.profileAvatarText}>P</Text></View>
        <Text style={s.profileName}>부모 계정</Text>
        <Text style={s.profileEmail}>{user?.email || ''}</Text>
      </View>

      <Text style={s.section}>초대 코드</Text>
      {inviteCode ? (
        <View style={s.codeBox}>
          <Text style={s.codeLabel}>이 코드를 자녀에게 알려주세요</Text>
          <Text style={s.codeText}>{inviteCode}</Text>
          <Text style={s.codeHint}>자녀가 가족 연결 화면에서 이 코드를 입력합니다</Text>
        </View>
      ) : (
        <TouchableOpacity style={s.addBtn} onPress={handleShowInviteCode} disabled={loading}>
          {loading ? <ActivityIndicator color={Colors.primary} /> : <Text style={s.addBtnText}>+ 자녀 추가 (초대 코드)</Text>}
        </TouchableOpacity>
      )}

      {/* 자녀 관리 */}
      {childList.length > 0 && (
        <>
          <Text style={[s.section, {marginTop:24}]}>자녀 관리</Text>
          <View style={s.card}>
            {childList.map((child, i) => (
              <View key={child.uid} style={[s.childRow, i < childList.length - 1 && s.settingRowBorder]}>
                {editingChild === child.uid ? (
                  <View style={s.editRow}>
                    <TextInput
                      style={s.editInput}
                      value={editName}
                      onChangeText={setEditName}
                      placeholder="이름 입력"
                      placeholderTextColor={Colors.textHint}
                      autoFocus
                      onSubmitEditing={() => handleSaveChildName(child.uid)}
                    />
                    <TouchableOpacity style={s.editSaveBtn} onPress={() => handleSaveChildName(child.uid)}>
                      <Text style={s.editSaveBtnText}>저장</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { setEditingChild(null); setEditName(''); }}>
                      <Text style={s.addCancelText}>취소</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={s.childInfo}
                    onPress={() => { setEditingChild(child.uid); setEditName(childNames[child.uid] || child.defaultName); }}
                  >
                    <Text style={s.childName}>{childNames[child.uid] || child.defaultName}</Text>
                    <Text style={s.childEmail}>{child.email}</Text>
                    <Text style={s.childEditHint}>탭하여 이름 변경</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        </>
      )}

      <Text style={[s.section, {marginTop:24}]}>가족 약속</Text>
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

      {/* 긴급연락처 */}
      <Text style={[s.section, {marginTop:24}]}>긴급연락처</Text>
      <View style={s.card}>
        {contacts.length === 0 && !showAddContact && (
          <Text style={s.emptyHint}>긴급 시 자녀가 바로 전화할 수 있는 연락처를 추가하세요</Text>
        )}
        {contacts.map((c, i) => (
          <View key={c.id} style={[s.contactRow, i < contacts.length - 1 && s.settingRowBorder]}>
            <View style={s.contactInfo}>
              <Text style={s.contactName}>{c.name}</Text>
              <Text style={s.contactPhone}>{c.phone}</Text>
            </View>
            <TouchableOpacity onPress={() => Linking.openURL(`tel:${c.phone}`)}>
              <Text style={s.contactCall}>📞</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.contactDelBtn} onPress={() => handleDeleteContact(c.id)}>
              <Text style={s.contactDelText}>×</Text>
            </TouchableOpacity>
          </View>
        ))}
        {showAddContact ? (
          <View style={s.addContactForm}>
            <TextInput
              style={s.addInput}
              placeholder="이름 (예: 엄마)"
              placeholderTextColor={Colors.textHint}
              value={newContactName}
              onChangeText={setNewContactName}
              autoFocus
            />
            <TextInput
              style={[s.addInput, { marginTop: 8 }]}
              placeholder="전화번호 (예: 01012345678)"
              placeholderTextColor={Colors.textHint}
              value={newContactPhone}
              onChangeText={setNewContactPhone}
              keyboardType="phone-pad"
            />
            <View style={s.addRow}>
              <TouchableOpacity style={s.addSaveBtn} onPress={handleAddContact}>
                <Text style={s.addSaveBtnText}>추가</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowAddContact(false); setNewContactName(''); setNewContactPhone(''); }}>
                <Text style={s.addCancelText}>취소</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={s.addPromiseBtn} onPress={() => setShowAddContact(true)}>
            <Text style={s.addPromiseBtnText}>+ 연락처 추가</Text>
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
        <Text style={s.logoutText}>로그아웃</Text>
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
  childRow:         { paddingVertical: 12 },
  childInfo:        { },
  childName:        { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  childEmail:       { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  childEditHint:    { fontSize: 11, color: Colors.primary, marginTop: 4 },
  editRow:          { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editInput:        { flex: 1, backgroundColor: Colors.white, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: Colors.textPrimary, borderWidth: 1, borderColor: Colors.border },
  editSaveBtn:      { backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  editSaveBtnText:  { fontSize: 13, fontWeight: '600', color: Colors.white },
  logoutBtn:        { alignItems: 'center', paddingVertical: 14, marginTop: 32, borderWidth: 1, borderColor: Colors.border, borderRadius: 10 },
  logoutText:       { fontSize: 14, color: Colors.danger },
  contactRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  contactInfo:      { flex: 1 },
  contactName:      { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  contactPhone:     { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  contactCall:      { fontSize: 22, marginHorizontal: 10 },
  contactDelBtn:    { padding: 4 },
  contactDelText:   { fontSize: 20, color: Colors.textHint },
  addContactForm:   { marginTop: 8 },
});
