import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { Colors } from '../../constants/Colors';

export default function ChildSOS() {
  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>Emergency</Text>
      <Text style={s.subtitle}>Press and hold when in danger</Text>
      <View style={s.sosArea}>
        <TouchableOpacity style={s.sosBtn} onLongPress={() => Alert.alert('SOS Sent', 'Alert sent to parents!')} delayLongPress={3000}>
          <Text style={s.sosText}>SOS</Text>
        </TouchableOpacity>
        <Text style={s.sosHint}>Hold 3 seconds to send{'\n'}alert to parents</Text>
      </View>
      <View style={s.infoCard}>
        <Text style={s.infoTitle}>When SOS is sent</Text>
        {['Push notification to parents', 'Current location sent', 'Sound alarm on parent phone'].map(t => (
          <View key={t} style={s.infoRow}><View style={s.infoCheck}><Text style={s.checkMark}>V</Text></View><Text style={s.infoText}>{t}</Text></View>
        ))}
      </View>
      <Text style={s.locLabel}>Parent location</Text>
      <View style={s.parentCard}>
        <View style={s.parentAvatar}><Text style={s.parentAvatarText}>P</Text></View>
        <View style={s.parentInfo}><Text style={s.parentName}>Dad</Text><Text style={s.parentLoc}>Near office | 15min ago</Text></View>
      </View>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  container:{flex:1, backgroundColor:Colors.white},
  content:{padding:20, paddingTop:60, paddingBottom:40},
  title:{fontSize:22, fontWeight:'700', color:Colors.textPrimary, marginBottom:4},
  subtitle:{fontSize:14, color:Colors.textSecondary, textAlign:'center', marginBottom:24, marginTop:4},
  sosArea:{alignItems:'center', marginBottom:28},
  sosBtn:{width:120, height:120, borderRadius:60, backgroundColor:Colors.dangerBg, borderWidth:3, borderColor:'#F09595', alignItems:'center', justifyContent:'center', marginBottom:16},
  sosText:{fontSize:28, fontWeight:'700', color:Colors.danger},
  sosHint:{fontSize:13, color:Colors.textSecondary, textAlign:'center', lineHeight:20},
  infoCard:{backgroundColor:Colors.bg, borderRadius:12, padding:16, marginBottom:20},
  infoTitle:{fontSize:14, fontWeight:'500', color:Colors.textPrimary, marginBottom:10},
  infoRow:{flexDirection:'row', alignItems:'center', marginBottom:8},
  infoCheck:{width:18, height:18, borderRadius:9, backgroundColor:Colors.primaryLight, alignItems:'center', justifyContent:'center', marginRight:10},
  checkMark:{fontSize:11, color:Colors.primary, fontWeight:'600'},
  infoText:{fontSize:13, color:Colors.textPrimary},
  locLabel:{fontSize:13, color:Colors.textSecondary, textAlign:'center', marginBottom:10},
  parentCard:{flexDirection:'row', alignItems:'center', padding:14, backgroundColor:Colors.bg, borderRadius:12},
  parentAvatar:{width:36, height:36, borderRadius:18, backgroundColor:Colors.primaryLight, alignItems:'center', justifyContent:'center', marginRight:12},
  parentAvatarText:{fontSize:14, fontWeight:'600', color:Colors.primary},
  parentInfo:{flex:1},
  parentName:{fontSize:14, fontWeight:'500', color:Colors.textPrimary},
  parentLoc:{fontSize:12, color:Colors.textSecondary, marginTop:2},
});