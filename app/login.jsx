import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db } from "../constants/firebase";
import { Colors } from "../constants/Colors";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [selectedRole, setSelectedRole] = useState("parent");
  const [loading, setLoading] = useState(false);

  async function handleAuth() {
    if (!email || !password) { Alert.alert("Error", "Enter email and password"); return; }
    setLoading(true);
    try {
      let cred;
      if (isSignUp) {
        cred = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, "users", cred.user.uid), { email, role: selectedRole, familyId: null, createdAt: new Date().toISOString() });
      } else {
        cred = await signInWithEmailAndPassword(auth, email, password);
      }
      const userDoc = await getDoc(doc(db, "users", cred.user.uid));
      if (userDoc.exists()) {
        const r = userDoc.data().role;
        const fid = userDoc.data().familyId;
        if (!fid) { router.replace("/connect"); }
        else { router.replace(r === "parent" ? "/parent" : "/child"); }
      }
    } catch (error) {
      let msg = "Something went wrong";
      if (error.code === "auth/email-already-in-use") msg = "Email already registered";
      if (error.code === "auth/invalid-email") msg = "Invalid email";
      if (error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") msg = "Wrong password";
      if (error.code === "auth/user-not-found") msg = "No account found";
      if (error.code === "auth/weak-password") msg = "Password needs 6+ characters";
      Alert.alert("Error", msg);
    }
    setLoading(false);
  }

  return (
    <View style={s.container}>
      <View style={s.logoArea}>
        <View style={s.logoCircle}><Text style={s.logoText}>SK</Text></View>
        <Text style={s.appName}>SafeKids</Text>
      </View>
      <Text style={s.heading}>{isSignUp ? "Sign up" : "Sign in"}</Text>
      <TextInput style={s.input} placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholderTextColor="#9B9B9B" />
      <TextInput style={s.input} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry placeholderTextColor="#9B9B9B" />
      {isSignUp && (
        <View style={s.roleArea}>
          <Text style={s.roleLabel}>I am a:</Text>
          <View style={s.roleBtns}>
            <TouchableOpacity style={[s.roleBtn, selectedRole==="parent" && s.roleBtnActive]} onPress={() => setSelectedRole("parent")}>
              <Text style={[s.roleBtnText, selectedRole==="parent" && {color:"#185FA5",fontWeight:"500"}]}>Parent</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.roleBtn, selectedRole==="child" && s.roleBtnActiveChild]} onPress={() => setSelectedRole("child")}>
              <Text style={[s.roleBtnText, selectedRole==="child" && {color:"#993C1D",fontWeight:"500"}]}>Child</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      <TouchableOpacity style={s.mainBtn} onPress={handleAuth} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.mainBtnText}>{isSignUp ? "Sign up" : "Sign in"}</Text>}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)} style={s.switchBtn}>
        <Text style={s.switchText}>{isSignUp ? "Already have account? Sign in" : "No account? Sign up"}</Text>
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