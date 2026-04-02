import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { signOut } from 'firebase/auth';
import { useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { auth, db } from '../../constants/firebase';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../contexts/AuthContext';
import { sendSOS } from '../../src/services/sosService';

export default function ChildSOS() {
  const router = useRouter();
  const { t } = useTranslation();
  const { familyId } = useAuth();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [contacts, setContacts] = useState([]);

  useEffect(() => {
    if (!familyId) return;
    getDoc(doc(db, 'families', familyId)).then((snap) => {
      if (snap.exists()) setContacts(snap.data().emergencyContacts || []);
    });
  }, [familyId]);

  async function handleLogout() {
    await AsyncStorage.multiRemove([
      'login_autoLogin',
      'login_savedPassword',
    ]);
    await AsyncStorage.setItem('logged_out', 'true');
    await signOut(auth);
    router.replace('/login');
  }

  async function handleSOS() {
    if (sending) return;
    setSending(true);
    try {
      await sendSOS(familyId);
      setSent(true);
      Alert.alert(t('child.sos.sentTitle'), t('child.sos.sentMessage'));
      setTimeout(() => setSent(false), 30000);
    } catch (e) {
      console.error('SOS failed:', e);
      Alert.alert(t('common.error'), t('child.sos.failedMessage'));
    } finally {
      setSending(false);
    }
  }

  function confirmSOS() {
    Alert.alert(
      t('child.sos.confirmTitle'),
      t('child.sos.confirmMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.send'), style: 'destructive', onPress: handleSOS },
      ]
    );
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>{t('child.sos.title')}</Text>
      <Text style={s.subtitle}>{t('child.sos.subtitle')}</Text>

      <View style={s.sosArea}>
        <TouchableOpacity
          style={[s.sosBtn, sent && s.sosBtnSent, sending && s.sosBtnDisabled]}
          onLongPress={confirmSOS}
          delayLongPress={3000}
          disabled={sending || sent}
        >
          {sending ? (
            <ActivityIndicator size="large" color={Colors.danger} />
          ) : sent ? (
            <Text style={[s.sosText, { color: Colors.safe }]}>{t('child.sos.sent')}</Text>
          ) : (
            <Text style={s.sosText}>SOS</Text>
          )}
        </TouchableOpacity>
        <Text style={s.sosHint}>
          {sent ? t('child.sos.sentHint') : t('child.sos.hint')}
        </Text>
      </View>

      <View style={s.infoCard}>
        <Text style={s.infoTitle}>{t('child.sos.infoTitle')}</Text>
        {[t('child.sos.info1'), t('child.sos.info2'), t('child.sos.info3')].map((txt) => (
          <View key={txt} style={s.infoRow}>
            <View style={s.infoCheck}><Text style={s.checkMark}>✓</Text></View>
            <Text style={s.infoText}>{txt}</Text>
          </View>
        ))}
      </View>

      <Text style={s.emergencyLabel}>{t('child.sos.emergency')}</Text>
      <View style={s.callRow}>
        <TouchableOpacity style={s.callBtn} onPress={() => Linking.openURL('tel:112')}>
          <Text style={s.callNum}>112</Text>
          <Text style={s.callDesc}>{t('child.sos.police')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.callBtn} onPress={() => Linking.openURL('tel:119')}>
          <Text style={s.callNum}>119</Text>
          <Text style={s.callDesc}>{t('child.sos.fireEms')}</Text>
        </TouchableOpacity>
      </View>

      {contacts.length > 0 && (
        <>
          <Text style={[s.emergencyLabel, { marginTop: 20 }]}>{t('child.sos.familyContacts')}</Text>
          <View style={s.contactList}>
            {contacts.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={s.contactBtn}
                onPress={() => Linking.openURL(`tel:${c.phone}`)}
              >
                <Text style={s.contactName}>{c.name}</Text>
                <Text style={s.contactPhone}>📞 {c.phone}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
        <Text style={s.logoutText}>{t('child.sos.logout')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginBottom: 24, marginTop: 4 },
  sosArea: { alignItems: 'center', marginBottom: 28 },
  sosBtn: { width: 140, height: 140, borderRadius: 70, backgroundColor: Colors.dangerBg, borderWidth: 3, borderColor: '#F09595', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  sosBtnSent: { backgroundColor: Colors.safeBg, borderColor: '#97C459' },
  sosBtnDisabled: { opacity: 0.6 },
  sosText: { fontSize: 28, fontWeight: '700', color: Colors.danger },
  sosHint: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  infoCard: { backgroundColor: Colors.bg, borderRadius: 12, padding: 16, marginBottom: 20 },
  infoTitle: { fontSize: 14, fontWeight: '500', color: Colors.textPrimary, marginBottom: 10 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  infoCheck: { width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  checkMark: { fontSize: 11, color: Colors.primary, fontWeight: '600' },
  infoText: { fontSize: 13, color: Colors.textPrimary },
  emergencyLabel: { fontSize: 13, color: Colors.textSecondary, marginBottom: 10 },
  callRow: { flexDirection: 'row', gap: 12 },
  callBtn: { flex: 1, backgroundColor: Colors.dangerBg, borderRadius: 12, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#F09595' },
  callNum: { fontSize: 22, fontWeight: '700', color: Colors.danger },
  callDesc: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  logoutBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 32, borderWidth: 1, borderColor: Colors.border, borderRadius: 10 },
  logoutText: { fontSize: 14, color: Colors.danger },
  contactList: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  contactBtn: { flex: 1, minWidth: '45%', backgroundColor: Colors.primaryLight, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.primary },
  contactName: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  contactPhone: { fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
});
