import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';

function TabIcon({ label, focused }) {
  return (
    <View style={{alignItems:'center', paddingTop:4}}>
      <View style={{width:24, height:24, borderRadius:6, backgroundColor: focused ? Colors.coralLight : Colors.bgCard, alignItems:'center', justifyContent:'center'}}>
        <Text style={{fontSize:10, fontWeight:'600', color: focused ? Colors.coral : Colors.textHint}}>{label.charAt(0)}</Text>
      </View>
    </View>
  );
}

export default function ChildLayout() {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 8);

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
