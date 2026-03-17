import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../contexts/AuthContext';
import { registerPushToken } from '../../src/services/notificationService';

function TabIcon({ label, focused }) {
  return (
    <View style={{alignItems:'center', paddingTop:4}}>
      <View style={{width:24, height:24, borderRadius:6, backgroundColor: focused ? Colors.primaryLight : Colors.bgCard, alignItems:'center', justifyContent:'center'}}>
        <Text style={{fontSize:10, fontWeight:'600', color: focused ? Colors.primary : Colors.textHint}}>{label.charAt(0)}</Text>
      </View>
    </View>
  );
}

export default function ParentLayout() {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 8);
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
      tabBarLabelStyle: {fontSize:11, marginTop:2},
    }}>
      <Tabs.Screen name="index" options={{title:'Home', tabBarIcon:({focused}) => <TabIcon label="Home" focused={focused}/>}} />
      <Tabs.Screen name="location" options={{title:'Location', tabBarIcon:({focused}) => <TabIcon label="Location" focused={focused}/>}} />
      <Tabs.Screen name="screentime" options={{title:'Time', tabBarIcon:({focused}) => <TabIcon label="Time" focused={focused}/>}} />
      <Tabs.Screen name="settings" options={{title:'Settings', tabBarIcon:({focused}) => <TabIcon label="Settings" focused={focused}/>}} />
    </Tabs>
  );
}
