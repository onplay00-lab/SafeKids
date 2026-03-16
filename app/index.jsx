import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../contexts/AuthContext";
import { Colors } from "../constants/Colors";

export default function Index() {
  const router = useRouter();
  const { user, role, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    } else if (role === "parent") {
      router.replace("/parent");
    } else if (role === "child") {
      router.replace("/child");
    } else {
      router.replace("/login");
    }
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