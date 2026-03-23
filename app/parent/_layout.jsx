import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../contexts/AuthContext';
import { registerPushToken } from '../../src/services/notificationService';

function TabIcon({ icon }) {
  return (
    <View style={{alignItems:'center', justifyContent:'center', width:28, height:28}}>
      <Text style={{fontSize:18}}>{icon}</Text>
    </View>
  );
}

export default function ParentLayout() {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 24);
  const { user } = useAuth();

  // 로그인 시 푸시 토큰 등록 (SOS 알림 수신)
  useEffect(() => {
    if (user?.uid) {
      registerPushToken(user.uid);
    }
  }, [user?.uid]);

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: {borderTopWidth:0.5, borderTopColor:Colors.border, backgroundColor:Colors.white, height: 52 + bottomPadding, paddingBottom: bottomPadding, paddingTop:6},
      tabBarActiveTintColor: Colors.primary,
      tabBarInactiveTintColor: Colors.textHint,
      tabBarLabelStyle: {fontSize:11, marginTop:0},
    }}>
      <Tabs.Screen name="index" options={{title:'홈', tabBarIcon:({focused}) => <TabIcon icon="🏠" focused={focused}/>}} />
      <Tabs.Screen name="location" options={{title:'위치', tabBarIcon:({focused}) => <TabIcon icon="📍" focused={focused}/>}} />
      <Tabs.Screen name="screentime" options={{title:'시간', tabBarIcon:({focused}) => <TabIcon icon="⏰" focused={focused}/>}} />
      <Tabs.Screen name="settings" options={{title:'설정', tabBarIcon:({focused}) => <TabIcon icon="⚙️" focused={focused}/>}} />
    </Tabs>
  );
}
