import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { signOut } from 'firebase/auth';
import { useRouter } from 'expo-router';
import { auth } from '../../constants/firebase';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../contexts/AuthContext';
import { sendSOS } from '../../src/services/sosService';

export default function ChildSOS() {
  const router = useRouter();
  const { familyId } = useAuth();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleLogout() {
    await signOut(auth);
    router.replace('/login');
  }

  async function handleSOS() {
    if (sending) return;
    setSending(true);
    try {
      await sendSOS(familyId);
      setSent(true);
      Alert.alert('SOS 전송 완료', '부모님께 알림이 전송되었습니다!');
      // 30초 후 재전송 가능
      setTimeout(() => setSent(false), 30000);
    } catch (e) {
      console.error('SOS failed:', e);
      Alert.alert('오류', 'SOS 전송에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setSending(false);
    }
  }

  function confirmSOS() {
    Alert.alert(
      '🚨 SOS 전송',
      '부모님께 긴급 알림을 보내시겠습니까?\n현재 위치도 함께 전송됩니다.',
      [
        { text: '취소', style: 'cancel' },
        { text: '전송', style: 'destructive', onPress: handleSOS },
      ]
    );
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>긴급 알림</Text>
      <Text style={s.subtitle}>3초 길게 눌러서 부모님께 알림 전송</Text>

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
            <Text style={[s.sosText, { color: Colors.safe }]}>전송됨</Text>
          ) : (
            <Text style={s.sosText}>SOS</Text>
          )}
        </TouchableOpacity>
        <Text style={s.sosHint}>
          {sent
            ? '✓ 부모님께 전송되었습니다\n30초 후 재전송 가능'
            : '3초 길게 눌러서\n부모님께 알림 전송'}
        </Text>
      </View>

      <View style={s.infoCard}>
        <Text style={s.infoTitle}>SOS 전송 시</Text>
        {[
          '부모님 폰에 푸시 알림 전송',
          '현재 위치 정보 전송',
          '부모 앱에 알림 기록 저장',
        ].map((t) => (
          <View key={t} style={s.infoRow}>
            <View style={s.infoCheck}><Text style={s.checkMark}>✓</Text></View>
            <Text style={s.infoText}>{t}</Text>
          </View>
        ))}
      </View>

      <Text style={s.emergencyLabel}>긴급 신고</Text>
      <View style={s.callRow}>
        <TouchableOpacity style={s.callBtn} onPress={() => Linking.openURL('tel:112')}>
          <Text style={s.callNum}>112</Text>
          <Text style={s.callDesc}>경찰</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.callBtn} onPress={() => Linking.openURL('tel:119')}>
          <Text style={s.callNum}>119</Text>
          <Text style={s.callDesc}>소방/구급</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
        <Text style={s.logoutText}>로그아웃</Text>
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
});
