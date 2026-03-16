import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useRouter } from 'expo-router';
import { db, auth } from '../../constants/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Colors } from '../../constants/Colors';

function generateCode() { return Math.random().toString(36).substring(2,8).toUpperCase(); }

export default function ParentSettings() {
  const router = useRouter();
  const { user, familyId, setFamilyId } = useAuth();
  const [inviteCode, setInviteCode] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleShowInviteCode() {
    if (!user) return;
    setLoading(true);
    try {
      if (familyId) {
        // 기존 family의 코드 가져오기
        const famDoc = await getDoc(doc(db, 'families', familyId));
        if (famDoc.exists() && famDoc.data().inviteCode) {
          setInviteCode(famDoc.data().inviteCode);
        } else {
          // 코드가 없으면 새로 생성
          const code = generateCode();
          await updateDoc(doc(db, 'families', familyId), { inviteCode: code });
          setInviteCode(code);
        }
      } else {
        // family가 없으면 새로 생성
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
        <Text style={s.promise}>Use phone up to 4 hours a day</Text>
        <Text style={s.promise}>No phone after 10 PM</Text>
        <Text style={s.promise}>Education apps are unlimited</Text>
      </View>

      <Text style={[s.section, {marginTop:24}]}>Notifications</Text>
      <View style={s.card}>
        {['Geofence alerts', 'Time limit alerts', 'Weekly report'].map(t => (
          <View key={t} style={s.settingRow}><Text style={s.settingName}>{t}</Text><View style={[s.toggle, s.toggleOn]}><View style={[s.toggleThumb, s.toggleThumbOn]}/></View></View>
        ))}
      </View>

      <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
        <Text style={s.logoutText}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  container:{flex:1, backgroundColor:Colors.white},
  content:{padding:20, paddingTop:60, paddingBottom:40},
  title:{fontSize:22, fontWeight:'700', color:Colors.textPrimary, marginBottom:20},
  profile:{alignItems:'center', marginBottom:24},
  profileAvatar:{width:56, height:56, borderRadius:28, backgroundColor:Colors.primaryLight, alignItems:'center', justifyContent:'center', marginBottom:8},
  profileAvatarText:{fontSize:20, fontWeight:'600', color:Colors.primary},
  profileName:{fontSize:16, fontWeight:'600', color:Colors.textPrimary},
  profileEmail:{fontSize:13, color:Colors.textSecondary, marginTop:2},
  section:{fontSize:15, fontWeight:'600', color:Colors.textPrimary, marginBottom:10},
  addBtn:{alignItems:'center', paddingVertical:14, borderWidth:1, borderColor:Colors.primaryMid, borderRadius:10, backgroundColor:Colors.primaryLight},
  addBtnText:{fontSize:14, fontWeight:'500', color:Colors.primary},
  codeBox:{alignItems:'center', backgroundColor:Colors.primaryLight, borderRadius:14, padding:24},
  codeLabel:{fontSize:13, color:Colors.textSecondary, marginBottom:8},
  codeText:{fontSize:36, fontWeight:'700', color:Colors.primary, letterSpacing:6, marginBottom:8},
  codeHint:{fontSize:12, color:Colors.textHint},
  card:{backgroundColor:Colors.bg, borderRadius:12, padding:14},
  promise:{fontSize:13, color:Colors.textPrimary, paddingVertical:4},
  settingRow:{flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:10, borderBottomWidth:0.5, borderBottomColor:Colors.border},
  settingName:{fontSize:13, color:Colors.textPrimary},
  toggle:{width:36, height:20, borderRadius:10, backgroundColor:Colors.borderMid, padding:2},
  toggleOn:{backgroundColor:Colors.primary},
  toggleThumb:{width:16, height:16, borderRadius:8, backgroundColor:Colors.white},
  toggleThumbOn:{transform:[{translateX:16}]},
  logoutBtn:{alignItems:'center', paddingVertical:14, marginTop:32, borderWidth:1, borderColor:Colors.border, borderRadius:10},
  logoutText:{fontSize:14, color:Colors.danger},
});
