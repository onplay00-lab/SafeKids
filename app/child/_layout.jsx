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
      <View style={{minWidth:32, height:24, borderRadius:6, paddingHorizontal:6, backgroundColor: focused ? Colors.coralLight : Colors.bgCard, alignItems:'center', justifyContent:'center'}}>
        <Text style={{fontSize:10, fontWeight:'600', color: focused ? Colors.coral : Colors.textHint}} numberOfLines={1}>{label}</Text>
      </View>
    </View>
  );
}

export default function ChildLayout() {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 8);
  const { user } = useAuth();

  // 로그인 시 푸시 토큰 등록 (SOS 수신용은 부모지만, 아이도 향후 알림 수신 위해 등록)
  useEffect(() => {
    if (user?.uid) {
      registerPushToken(user.uid);
    }
  }, [user?.uid]);

  return (
    <Tabs screenOptions={{
      headerShown:false,
      tabBarStyle:{borderTopWidth:0.5, borderTopColor:Colors.border, backgroundColor:Colors.white, height: 52 + bottomPadding, paddingBottom: bottomPadding, paddingTop:6},
      tabBarActiveTintColor:Colors.coral,
      tabBarInactiveTintColor:Colors.textHint,
      tabBarLabelStyle:{fontSize:11, marginTop:2},
    }}>
      <Tabs.Screen name="index" options={{title:'Home', tabBarIcon:({focused}) => <TabIcon label="Home" focused={focused}/>}} />
      <Tabs.Screen name="promise" options={{title:'Promise', tabBarIcon:({focused}) => <TabIcon label="Promise" focused={focused}/>}} />
      <Tabs.Screen name="sos" options={{title:'SOS', tabBarIcon:({focused}) => <TabIcon label="SOS" focused={focused}/>}} />
    </Tabs>
  );
}
