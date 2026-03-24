import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { doc, setDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../constants/firebase";
import { useAuth } from "../contexts/AuthContext";

function generateCode() { return Math.random().toString(36).substring(2,8).toUpperCase(); }

export default function FamilyConnect() {
  const router = useRouter();
  const { user, role, setFamilyId } = useAuth();
  const [code, setCode] = useState("");
  const [generatedCode, setGeneratedCode] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    try {
      const inviteCode = generateCode();
      const familyId = user.uid;
      await setDoc(doc(db, "families", familyId), { parentId: user.uid, inviteCode, children: [], createdAt: new Date().toISOString() });
      await updateDoc(doc(db, "users", user.uid), { familyId });
      setGeneratedCode(inviteCode);
      setFamilyId(familyId);
    } catch (e) { Alert.alert("오류", "코드 생성에 실패했습니다"); }
    setLoading(false);
  }

  async function handleJoin() {
    if (!code || code.length < 6) { Alert.alert("오류", "6자리 코드를 입력하세요"); return; }
    setLoading(true);
    try {
      const q = query(collection(db, "families"), where("inviteCode", "==", code.toUpperCase()));
      const snap = await getDocs(q);
      if (snap.empty) { Alert.alert("오류", "유효하지 않은 코드입니다"); setLoading(false); return; }
      const fDoc = snap.docs[0];
      const fData = fDoc.data();
      const familyId = fDoc.id;
      await updateDoc(doc(db, "families", familyId), { children: [...(fData.children||[]), user.uid] });
      await updateDoc(doc(db, "users", user.uid), { familyId });
      setFamilyId(familyId);
      Alert.alert("연결 완료!", "가족이 성공적으로 연결되었습니다.");
      router.replace("/child");
    } catch (e) { Alert.alert("오류", "연결에 실패했습니다"); }
    setLoading(false);
  }

  return (
    <View style={s.container}>
      <View style={s.logoArea}>
        <View style={[s.logoCircle, role==="child" && {backgroundColor:"#FAECE7"}]}>
          <Text style={[s.logoText, role==="child" && {color:"#993C1D"}]}>{role==="parent"?"P":"C"}</Text>
        </View>
        <Text style={s.title}>가족 연결</Text>
      </View>
      {role === "parent" ? (
        <View>
          <Text style={s.desc}>코드를 생성하여 자녀에게 공유하세요.</Text>
          {generatedCode ? (
            <View style={s.codeBox}>
              <Text style={s.codeLabel}>초대 코드</Text>
              <Text style={s.codeText}>{generatedCode}</Text>
              <Text style={s.codeHint}>이 코드를 자녀에게 알려주세요</Text>
              <TouchableOpacity style={s.mainBtn} onPress={() => router.replace("/parent")}>
                <Text style={s.mainBtnText}>홈으로 이동</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={s.mainBtn} onPress={handleGenerate} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff"/> : <Text style={s.mainBtnText}>코드 생성</Text>}
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View>
          <Text style={s.desc}>부모님에게 받은 코드를 입력하세요.</Text>
          <TextInput style={s.codeInput} placeholder="ABC123" value={code} onChangeText={t=>setCode(t.toUpperCase())} maxLength={6} autoCapitalize="characters" placeholderTextColor="#9B9B9B"/>
          <TouchableOpacity style={[s.mainBtn,{backgroundColor:"#993C1D"}]} onPress={handleJoin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff"/> : <Text style={s.mainBtnText}>연결하기</Text>}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container:{flex:1,backgroundColor:"#fff",paddingHorizontal:24,justifyContent:"center"},
  logoArea:{alignItems:"center",marginBottom:32},
  logoCircle:{width:56,height:56,borderRadius:28,backgroundColor:"#E6F1FB",alignItems:"center",justifyContent:"center",marginBottom:12},
  logoText:{fontSize:20,fontWeight:"600",color:"#185FA5"},
  title:{fontSize:22,fontWeight:"700",color:"#1A1A1A"},
  desc:{fontSize:14,color:"#6B6B6B",textAlign:"center",lineHeight:22,marginBottom:24},
  codeBox:{alignItems:"center",backgroundColor:"#F7F7F5",borderRadius:14,padding:24},
  codeLabel:{fontSize:13,color:"#6B6B6B",marginBottom:8},
  codeText:{fontSize:36,fontWeight:"700",color:"#185FA5",letterSpacing:6,marginBottom:8},
  codeHint:{fontSize:13,color:"#9B9B9B",marginBottom:20},
  codeInput:{height:56,borderWidth:1.5,borderColor:"rgba(0,0,0,0.15)",borderRadius:12,textAlign:"center",fontSize:24,fontWeight:"600",letterSpacing:6,color:"#1A1A1A",marginBottom:16,backgroundColor:"#F7F7F5"},
  mainBtn:{backgroundColor:"#185FA5",borderRadius:10,paddingVertical:14,alignItems:"center",marginTop:8},
  mainBtnText:{color:"#fff",fontSize:16,fontWeight:"600"},
});