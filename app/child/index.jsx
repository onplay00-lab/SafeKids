import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../../constants/Colors';
import { startLocationTracking } from '../../src/services/locationService';

export default function ChildHome() {
  const [locStatus, setLocStatus] = useState('위치 확인 중...');

  useEffect(() => {
    async function initLocation() {
      try {
        const result = await startLocationTracking();
        if (result === 'active') {
          setLocStatus('📍 위치 추적 활성화됨');
        } else if (result === 'foreground-only') {
          setLocStatus('📍 앱 사용 중에만 위치 확인');
        } else {
          setLocStatus('⚠️ 위치 권한이 필요합니다');
        }
      } catch (e) {
        console.error(e);
        setLocStatus('⚠️ 위치 서비스 오류');
      }
    }
    initLocation();
  }, []);

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>SafeKids</Text>

      {/* 위치 상태 표시 */}
      <View style={s.locBar}>
        <Text style={s.locText}>{locStatus}</Text>
      </View>

      <View style={s.timerArea}>
        <View style={[s.timerRing, {borderColor:Colors.primaryLight}]}>
          <Text style={s.timerVal}>1h 45m</Text>
          <Text style={s.timerLabel}>Remaining</Text>
        </View>
        <Text style={s.timerSub}>Today 2h 15m used / Limit 4h</Text>
      </View>
      <View style={s.card}>
        <View style={s.appRow}><Text style={s.appLabel}>YouTube</Text><Text style={s.appVal}>58min / 1h</Text></View>
        <View style={s.bar}><View style={[s.barFill, {width:'97%', backgroundColor:'#BA7517'}]}/></View>
        <View style={[s.appRow, {marginTop:12}]}><Text style={s.appLabel}>Game</Text><Text style={s.appVal}>42min / 1h</Text></View>
        <View style={s.bar}><View style={[s.barFill, {width:'70%', backgroundColor:Colors.primary}]}/></View>
      </View>
      <View style={s.bonusCard}>
        <Text style={s.bonusTitle}>Need more time?</Text>
        <Text style={s.bonusDesc}>Write a reason and request from parents</Text>
        <TouchableOpacity style={s.bonusBtn}><Text style={s.bonusBtnText}>Request bonus time</Text></TouchableOpacity>
      </View>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  container:{flex:1, backgroundColor:Colors.white},
  content:{padding:20, paddingTop:60},
  title:{fontSize:22, fontWeight:'700', color:Colors.textPrimary, marginBottom:16},
  locBar:{backgroundColor:'#E8F5E9', borderRadius:8, padding:10, marginBottom:16, alignItems:'center'},
  locText:{fontSize:13, color:'#2E7D32'},
  timerArea:{alignItems:'center', marginBottom:20},
  timerRing:{width:140, height:140, borderRadius:70, borderWidth:8, alignItems:'center', justifyContent:'center', marginBottom:10},
  timerVal:{fontSize:24, fontWeight:'700', color:Colors.textPrimary},
  timerLabel:{fontSize:12, color:Colors.textSecondary, marginTop:2},
  timerSub:{fontSize:13, color:Colors.textSecondary},
  card:{backgroundColor:Colors.bg, borderRadius:12, padding:14, marginBottom:12},
  appRow:{flexDirection:'row', justifyContent:'space-between'},
  appLabel:{fontSize:13, color:Colors.textSecondary},
  appVal:{fontSize:13, color:Colors.textPrimary},
  bar:{height:4, backgroundColor:Colors.border, borderRadius:2, marginTop:6},
  barFill:{height:4, borderRadius:2},
  bonusCard:{backgroundColor:Colors.bg, borderRadius:12, padding:16},
  bonusTitle:{fontSize:15, fontWeight:'600', color:Colors.textPrimary, marginBottom:4},
  bonusDesc:{fontSize:13, color:Colors.textSecondary, marginBottom:12},
  bonusBtn:{backgroundColor:Colors.primaryLight, borderRadius:10, paddingVertical:12, alignItems:'center'},
  bonusBtnText:{fontSize:14, fontWeight:'500', color:Colors.primary},
});
