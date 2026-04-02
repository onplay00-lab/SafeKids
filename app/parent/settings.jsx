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
import { useTranslation } from 'react-i18next';
import i18next from '../../src/i18n';

function generateCode() { return Math.random().toString(36).substring(2,8).toUpperCase(); }

// 자녀 이름 Firestore에 저장 (families + users 양쪽 동기화)
async function saveChildName(familyId, childUid, name) {
  await Promise.all([
    updateDoc(doc(db, 'families', familyId), {
      [`childNames.${childUid}`]: name,
    }),
    updateDoc(doc(db, 'users', childUid), { name }),
  ]);
}

const NOTIF_KEYS = [
  { key: 'geofence',    labelKey: 'parent.settings.notifGeofence',  descKey: 'parent.settings.notifGeofenceDesc' },
  { key: 'sos',         labelKey: 'parent.settings.notifSOS',       descKey: 'parent.settings.notifSOSDesc' },
  { key: 'timeRequest', labelKey: 'parent.settings.notifTimeRequest', descKey: 'parent.settings.notifTimeRequestDesc' },
  { key: 'battery',     labelKey: 'parent.settings.notifBattery',  descKey: 'parent.settings.notifBatteryDesc' },
];

const DEFAULT_NOTIF = { geofence: true, sos: true, timeRequest: true, battery: true };

export default function ParentSettings() {
  const router = useRouter();
  const { t } = useTranslation();
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
  const [parentList, setParentList] = useState([]);

  // 자녀 + 부모 목록 로드
  useEffect(() => {
    if (!familyId) return;
    async function load() {
      const famDoc = await getDoc(doc(db, 'families', familyId));
      if (!famDoc.exists()) return;
      const data = famDoc.data();
      // 자녀 목록
      const childUids = data.children || [];
      const names = data.childNames || {};
      setChildNames(names);
      const list = await Promise.all(childUids.map(async (uid) => {
        const userDoc = await getDoc(doc(db, 'users', uid));
        const email = userDoc.exists() ? userDoc.data().email : '';
        return { uid, email, defaultName: email?.split('@')[0] || uid };
      }));
      setChildList(list);
      // 부모 목록 (parentIds 배열 또는 레거시 parentId)
      const parentIds = data.parentIds || (data.parentId ? [data.parentId] : []);
      const parents = await Promise.all(parentIds.map(async (uid) => {
        const userDoc = await getDoc(doc(db, 'users', uid));
        const email = userDoc.exists() ? userDoc.data().email : '';
        return { uid, email, isMe: uid === user.uid };
      }));
      setParentList(parents);
    }
    load();
  }, [familyId]);

  async function handleSaveChildName(uid) {
    const name = editName.trim();
    if (!name) return;
    try {
      await saveChildName(familyId, uid, name);
    } catch (e) {
      // users doc 업데이트 실패해도 families childNames는 성공했을 수 있으므로 계속 진행
      console.warn('saveChildName partial fail:', e);
    }
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
    if (!name || !phone) { Alert.alert(t('parent.settings.namePhoneRequired')); return; }
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
    Alert.alert(t('parent.settings.deletePromise'), t('parent.settings.deletePromiseMsg', { text: p.text }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deletePromise(familyId, p.id) },
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
          parentIds: [user.uid],
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
      Alert.alert(t('common.error'), t('parent.settings.inviteCodeFailed'));
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
      Alert.alert(t('common.error'), t('parent.settings.logoutFailed'));
    }
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>{t('parent.settings.title')}</Text>
      <View style={s.profile}>
        <View style={s.profileAvatar}><Text style={s.profileAvatarText}>P</Text></View>
        <Text style={s.profileName}>{t('parent.settings.parentAccount')}</Text>
        <Text style={s.profileEmail}>{user?.email || ''}</Text>
      </View>

      <Text style={s.section}>{t('parent.settings.inviteCode')}</Text>
      {inviteCode ? (
        <View style={s.codeBox}>
          <Text style={s.codeLabel}>{t('parent.settings.shareCode')}</Text>
          <Text style={s.codeText}>{inviteCode}</Text>
          <Text style={s.codeHint}>{t('parent.settings.codeHint')}</Text>
          <Text style={s.codeHintParent}>{t('parent.settings.codeHintParent')}</Text>
        </View>
      ) : (
        <TouchableOpacity style={s.addBtn} onPress={handleShowInviteCode} disabled={loading}>
          {loading ? <ActivityIndicator color={Colors.primary} /> : <Text style={s.addBtnText}>{t('parent.settings.addMember')}</Text>}
        </TouchableOpacity>
      )}

      {/* 부모 목록 */}
      {parentList.length > 0 && (
        <>
          <Text style={[s.section, {marginTop:24}]}>{t('parent.settings.parentAccounts')}</Text>
          <View style={s.card}>
            {parentList.map((p, i) => (
              <View key={p.uid} style={[s.childRow, i < parentList.length - 1 && s.settingRowBorder]}>
                <View style={s.childInfo}>
                  <Text style={s.childName}>{p.email?.split('@')[0] || t('common.parent')}{p.isMe ? ` ${t('parent.settings.me')}` : ''}</Text>
                  <Text style={s.childEmail}>{p.email}</Text>
                </View>
              </View>
            ))}
          </View>
          {parentList.length === 1 && (
            <Text style={s.parentAddHint}>{t('parent.settings.parentAddHint')}</Text>
          )}
        </>
      )}

      {/* 자녀 관리 */}
      {childList.length > 0 && (
        <>
          <Text style={[s.section, {marginTop:24}]}>{t('parent.settings.childManagement')}</Text>
          <View style={s.card}>
            {childList.map((child, i) => (
              <View key={child.uid} style={[s.childRow, i < childList.length - 1 && s.settingRowBorder]}>
                {editingChild === child.uid ? (
                  <View style={s.editRow}>
                    <TextInput
                      style={s.editInput}
                      value={editName}
                      onChangeText={setEditName}
                      placeholder={t('parent.settings.enterName')}
                      placeholderTextColor={Colors.textHint}
                      autoFocus
                      onSubmitEditing={() => handleSaveChildName(child.uid)}
                    />
                    <TouchableOpacity style={s.editSaveBtn} onPress={() => handleSaveChildName(child.uid)}>
                      <Text style={s.editSaveBtnText}>{t('common.save')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { setEditingChild(null); setEditName(''); }}>
                      <Text style={s.addCancelText}>{t('common.cancel')}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={s.childInfo}
                    onPress={() => { setEditingChild(child.uid); setEditName(childNames[child.uid] || child.defaultName); }}
                  >
                    <Text style={s.childName}>{childNames[child.uid] || child.defaultName}</Text>
                    <Text style={s.childEmail}>{child.email}</Text>
                    <Text style={s.childEditHint}>{t('parent.settings.tapToChangeName')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        </>
      )}

      <Text style={[s.section, {marginTop:24}]}>{t('parent.settings.familyPromise')}</Text>
      <View style={s.card}>
        {promises.length === 0 && !showAddInput && (
          <Text style={s.emptyHint}>{t('parent.settings.noPromises')}</Text>
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
              placeholder={t('parent.settings.newPromise')}
              placeholderTextColor={Colors.textHint}
              value={newPromiseText}
              onChangeText={setNewPromiseText}
              onSubmitEditing={handleAddPromise}
              autoFocus
            />
            <TouchableOpacity style={s.addSaveBtn} onPress={handleAddPromise}>
              <Text style={s.addSaveBtnText}>{t('common.add')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setShowAddInput(false); setNewPromiseText(''); }}>
              <Text style={s.addCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={s.addPromiseBtn} onPress={() => setShowAddInput(true)}>
            <Text style={s.addPromiseBtnText}>{t('parent.settings.addPromise')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 긴급연락처 */}
      <Text style={[s.section, {marginTop:24}]}>{t('parent.settings.emergencyContacts')}</Text>
      <View style={s.card}>
        {contacts.length === 0 && !showAddContact && (
          <Text style={s.emptyHint}>{t('parent.settings.emergencyContactsHint')}</Text>
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
              placeholder={t('parent.settings.namePlaceholder')}
              placeholderTextColor={Colors.textHint}
              value={newContactName}
              onChangeText={setNewContactName}
              autoFocus
            />
            <TextInput
              style={[s.addInput, { marginTop: 8 }]}
              placeholder={t('parent.settings.phonePlaceholder')}
              placeholderTextColor={Colors.textHint}
              value={newContactPhone}
              onChangeText={setNewContactPhone}
              keyboardType="phone-pad"
            />
            <View style={s.addRow}>
              <TouchableOpacity style={s.addSaveBtn} onPress={handleAddContact}>
                <Text style={s.addSaveBtnText}>{t('common.add')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowAddContact(false); setNewContactName(''); setNewContactPhone(''); }}>
                <Text style={s.addCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={s.addPromiseBtn} onPress={() => setShowAddContact(true)}>
            <Text style={s.addPromiseBtnText}>{t('parent.settings.addContact')}</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={[s.section, {marginTop:24}]}>{t('parent.settings.language')}</Text>
      <View style={s.card}>
        <View style={s.langRow}>
          <TouchableOpacity
            style={[s.langBtn, i18next.language === 'ko' && s.langBtnActive]}
            onPress={async () => {
              await i18next.changeLanguage('ko');
              await AsyncStorage.setItem('user_language', 'ko');
              if (user?.uid) {
                try { await updateDoc(doc(db, 'users', user.uid), { language: 'ko' }); } catch (e) {}
              }
            }}
          >
            <Text style={[s.langBtnText, i18next.language === 'ko' && s.langBtnTextActive]}>{t('parent.settings.korean')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.langBtn, i18next.language === 'en' && s.langBtnActive]}
            onPress={async () => {
              await i18next.changeLanguage('en');
              await AsyncStorage.setItem('user_language', 'en');
              if (user?.uid) {
                try { await updateDoc(doc(db, 'users', user.uid), { language: 'en' }); } catch (e) {}
              }
            }}
          >
            <Text style={[s.langBtnText, i18next.language === 'en' && s.langBtnTextActive]}>{t('parent.settings.english')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={[s.section, {marginTop:24}]}>{t('parent.settings.notifSettings')}</Text>
      <View style={s.card}>
        {NOTIF_KEYS.map(({ key, labelKey, descKey }, i) => {
          const isOn = notifSettings[key];
          return (
            <TouchableOpacity
              key={key}
              style={[s.settingRow, i < NOTIF_KEYS.length - 1 && s.settingRowBorder]}
              onPress={() => handleToggleNotif(key)}
              activeOpacity={0.7}
            >
              <View style={s.settingInfo}>
                <Text style={s.settingName}>{t(labelKey)}</Text>
                <Text style={s.settingDesc}>{t(descKey)}</Text>
              </View>
              <View style={[s.toggle, isOn && s.toggleOn]}>
                <View style={[s.toggleThumb, isOn && s.toggleThumbOn]} />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
        <Text style={s.logoutText}>{t('parent.settings.logout')}</Text>
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
  codeHintParent:   { fontSize: 12, color: Colors.primary, marginTop: 6, fontWeight: '500' },
  parentAddHint:    { fontSize: 12, color: Colors.textHint, marginTop: 8, textAlign: 'center' },
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
  langRow:          { flexDirection: 'row', gap: 10 },
  langBtn:          { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', backgroundColor: Colors.white },
  langBtnActive:    { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  langBtnText:      { fontSize: 14, color: Colors.textSecondary },
  langBtnTextActive:{ fontSize: 14, color: Colors.primary, fontWeight: '600' },
});
