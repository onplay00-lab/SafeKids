import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { signOut } from "firebase/auth";
import { auth } from "../constants/firebase";
import { useAuth } from "../contexts/AuthContext";
import { Colors } from "../constants/Colors";

export default function Index() {
  const router = useRouter();
  const { user, role, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    async function checkAndRoute() {
      // 로그아웃 플래그가 있으면 Firebase 세션도 강제 정리
      const loggedOut = await AsyncStorage.getItem("logged_out");
      if (loggedOut === "true") {
        await AsyncStorage.removeItem("logged_out");
        if (auth.currentUser) {
          await signOut(auth);
        }
        router.replace("/login");
        return;
      }

      if (!user) {
        router.replace("/login");
      } else if (role === "parent") {
        router.replace("/parent");
      } else if (role === "child") {
        router.replace("/child");
      } else {
        router.replace("/login");
      }
    }
    checkAndRoute();
  }, [user, role, loading]);

  return (
    <View style={s.container}>
      <ActivityIndicator size="large" color="#185FA5" />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#FFFFFF" },
});