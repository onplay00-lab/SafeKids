import { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { auth, db } from "../constants/firebase";
import { Colors } from "../constants/Colors";

const STORAGE_KEYS = {
  SAVE_EMAIL: "login_saveEmail",
  SAVED_EMAIL: "login_savedEmail",
  AUTO_LOGIN: "login_autoLogin",
  SAVED_PASSWORD: "login_savedPassword",
};

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [selectedRole, setSelectedRole] = useState("parent");
  const [loading, setLoading] = useState(false);
  const [saveEmail, setSaveEmail] = useState(false);
  const [autoLogin, setAutoLogin] = useState(false);
  const [initializing, setInitializing] = useState(true);

  // 저장된 설정 로드
  useEffect(() => {
    async function loadSaved() {
      try {
        const [savedSaveEmail, savedEmail, savedAutoLogin, savedPassword] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.SAVE_EMAIL),
          AsyncStorage.getItem(STORAGE_KEYS.SAVED_EMAIL),
          AsyncStorage.getItem(STORAGE_KEYS.AUTO_LOGIN),
          AsyncStorage.getItem(STORAGE_KEYS.SAVED_PASSWORD),
        ]);

        if (savedSaveEmail === "true" && savedEmail) {
          setSaveEmail(true);
          setEmail(savedEmail);
        }

        if (savedAutoLogin === "true" && savedEmail && savedPassword) {
          setAutoLogin(true);
          setSaveEmail(true);
          setEmail(savedEmail);
          setPassword(savedPassword);
          // 자동 로그인 실행
          await doLogin(savedEmail, savedPassword);
        }
      } catch (e) {
        console.log("저장된 로그인 정보 로드 실패:", e);
      }
      setInitializing(false);
    }
    loadSaved();
  }, []);

  async function doLogin(loginEmail, loginPassword) {
    try {
      const cred = await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      const userDoc = await getDoc(doc(db, "users", cred.user.uid));
      if (userDoc.exists()) {
        const r = userDoc.data().role;
        const fid = userDoc.data().familyId;
        if (!fid) { router.replace("/connect"); }
        else { router.replace(r === "parent" ? "/parent" : "/child"); }
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  // 체크박스 토글
  async function toggleSaveEmail() {
    const next = !saveEmail;
    setSaveEmail(next);
    if (!next) {
      setAutoLogin(false);
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.SAVE_EMAIL, STORAGE_KEYS.SAVED_EMAIL,
        STORAGE_KEYS.AUTO_LOGIN, STORAGE_KEYS.SAVED_PASSWORD,
      ]);
    }
  }

  async function toggleAutoLogin() {
    const next = !autoLogin;
    setAutoLogin(next);
    if (next) setSaveEmail(true);
    if (!next) {
      await AsyncStorage.multiRemove([STORAGE_KEYS.AUTO_LOGIN, STORAGE_KEYS.SAVED_PASSWORD]);
    }
  }

  async function handleAuth() {
    if (!email || !password) { Alert.alert("Error", "이메일과 비밀번호를 입력하세요"); return; }
    setLoading(true);
    try {
      let cred;
      if (isSignUp) {
        cred = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, "users", cred.user.uid), { email, role: selectedRole, familyId: null, createdAt: new Date().toISOString() });
      } else {
        cred = await signInWithEmailAndPassword(auth, email, password);
      }

      // 로그인 정보 저장
      if (saveEmail) {
        await AsyncStorage.setItem(STORAGE_KEYS.SAVE_EMAIL, "true");
        await AsyncStorage.setItem(STORAGE_KEYS.SAVED_EMAIL, email);
      }
      if (autoLogin) {
        await AsyncStorage.setItem(STORAGE_KEYS.AUTO_LOGIN, "true");
        await AsyncStorage.setItem(STORAGE_KEYS.SAVED_PASSWORD, password);
      }

      const userDoc = await getDoc(doc(db, "users", cred.user.uid));
      if (userDoc.exists()) {
        const r = userDoc.data().role;
        const fid = userDoc.data().familyId;
        if (!fid) { router.replace("/connect"); }
        else { router.replace(r === "parent" ? "/parent" : "/child"); }
      }
    } catch (error) {
      let msg = "오류가 발생했습니다";
      if (error.code === "auth/email-already-in-use") msg = "이미 등록된 이메일입니다";
      if (error.code === "auth/invalid-email") msg = "유효하지 않은 이메일입니다";
      if (error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") msg = "비밀번호가 틀렸습니다";
      if (error.code === "auth/user-not-found") msg = "등록되지 않은 계정입니다";
      if (error.code === "auth/weak-password") msg = "비밀번호는 6자 이상이어야 합니다";
      Alert.alert("오류", msg);
    }
    setLoading(false);
  }

  if (initializing) {
    return (
      <View style={[s.container, { alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#185FA5" />
        <Text style={{ marginTop: 12, color: "#6B6B6B" }}>로그인 중...</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.logoArea}>
        <View style={s.logoCircle}><Text style={s.logoText}>SK</Text></View>
        <Text style={s.appName}>SafeKids</Text>
      </View>
      <Text style={s.heading}>{isSignUp ? "회원가입" : "로그인"}</Text>
      <TextInput style={s.input} placeholder="이메일" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholderTextColor="#9B9B9B" />
      <TextInput style={s.input} placeholder="비밀번호" value={password} onChangeText={setPassword} secureTextEntry placeholderTextColor="#9B9B9B" />

      {!isSignUp && (
        <View style={s.checkArea}>
          <TouchableOpacity style={s.checkRow} onPress={toggleSaveEmail}>
            <View style={[s.checkbox, saveEmail && s.checkboxOn]}>
              {saveEmail && <Text style={s.checkmark}>✓</Text>}
            </View>
            <Text style={s.checkLabel}>아이디 저장</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.checkRow} onPress={toggleAutoLogin}>
            <View style={[s.checkbox, autoLogin && s.checkboxOn]}>
              {autoLogin && <Text style={s.checkmark}>✓</Text>}
            </View>
            <Text style={s.checkLabel}>자동 로그인</Text>
          </TouchableOpacity>
        </View>
      )}

      {isSignUp && (
        <View style={s.roleArea}>
          <Text style={s.roleLabel}>역할 선택:</Text>
          <View style={s.roleBtns}>
            <TouchableOpacity style={[s.roleBtn, selectedRole==="parent" && s.roleBtnActive]} onPress={() => setSelectedRole("parent")}>
              <Text style={[s.roleBtnText, selectedRole==="parent" && {color:"#185FA5",fontWeight:"500"}]}>부모</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.roleBtn, selectedRole==="child" && s.roleBtnActiveChild]} onPress={() => setSelectedRole("child")}>
              <Text style={[s.roleBtnText, selectedRole==="child" && {color:"#993C1D",fontWeight:"500"}]}>자녀</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      <TouchableOpacity style={s.mainBtn} onPress={handleAuth} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.mainBtnText}>{isSignUp ? "회원가입" : "로그인"}</Text>}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)} style={s.switchBtn}>
        <Text style={s.switchText}>{isSignUp ? "이미 계정이 있으신가요? 로그인" : "계정이 없으신가요? 회원가입"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container:{flex:1,backgroundColor:"#fff",paddingHorizontal:24,justifyContent:"center"},
  logoArea:{alignItems:"center",marginBottom:36},
  logoCircle:{width:64,height:64,borderRadius:32,backgroundColor:"#E6F1FB",alignItems:"center",justifyContent:"center",marginBottom:12},
  logoText:{fontSize:22,fontWeight:"600",color:"#185FA5"},
  appName:{fontSize:24,fontWeight:"700",color:"#1A1A1A"},
  heading:{fontSize:18,fontWeight:"600",color:"#1A1A1A",marginBottom:16},
  input:{height:48,borderWidth:1,borderColor:"rgba(0,0,0,0.08)",borderRadius:10,paddingHorizontal:14,fontSize:15,color:"#1A1A1A",marginBottom:12,backgroundColor:"#F7F7F5"},
  checkArea:{flexDirection:"row",gap:20,marginBottom:12},
  checkRow:{flexDirection:"row",alignItems:"center",gap:8},
  checkbox:{width:22,height:22,borderRadius:4,borderWidth:1.5,borderColor:"#C0C0C0",alignItems:"center",justifyContent:"center"},
  checkboxOn:{borderColor:"#185FA5",backgroundColor:"#185FA5"},
  checkmark:{color:"#fff",fontSize:14,fontWeight:"700"},
  checkLabel:{fontSize:14,color:"#4A4A4A"},
  roleArea:{marginBottom:16},
  roleLabel:{fontSize:14,color:"#6B6B6B",marginBottom:8},
  roleBtns:{flexDirection:"row",gap:10},
  roleBtn:{flex:1,paddingVertical:12,borderRadius:10,borderWidth:1,borderColor:"rgba(0,0,0,0.08)",alignItems:"center"},
  roleBtnActive:{borderColor:"#85B7EB",backgroundColor:"#E6F1FB"},
  roleBtnActiveChild:{borderColor:"#F0997B",backgroundColor:"#FAECE7"},
  roleBtnText:{fontSize:14,color:"#6B6B6B"},
  mainBtn:{backgroundColor:"#185FA5",borderRadius:10,paddingVertical:14,alignItems:"center",marginTop:8},
  mainBtnText:{color:"#fff",fontSize:16,fontWeight:"600"},
  switchBtn:{alignItems:"center",marginTop:16},
  switchText:{fontSize:14,color:"#185FA5"},
});
