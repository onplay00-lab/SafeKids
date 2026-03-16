import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../../constants/Colors';

export default function ParentSettings() {
  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>Settings</Text>
      <View style={s.profile}>
        <View style={s.profileAvatar}><Text style={s.profileAvatarText}>P</Text></View>
        <Text style={s.profileName}>Parent account</Text>
        <Text style={s.profileEmail}>parent@email.com</Text>
      </View>
      <Text style={s.section}>Connected children</Text>
      <View style={s.item}><View style={[s.sm, {backgroundColor:Colors.primaryLight}]}><Text style={[s.smText, {color:Colors.primary}]}>JH</Text></View><View style={s.itemInfo}><Text style={s.itemName}>Junhyuk</Text><Text style={s.itemSub}>Galaxy A25 | Connected</Text></View></View>
      <View style={s.item}><View style={[s.sm, {backgroundColor:'#FBEAF0'}]}><Text style={[s.smText, {color:'#72243E'}]}>SY</Text></View><View style={s.itemInfo}><Text style={s.itemName}>Seoyeon</Text><Text style={s.itemSub}>iPhone SE | Connected</Text></View></View>
      <TouchableOpacity style={s.addBtn}><Text style={s.addBtnText}>+ Add child (invite code)</Text></TouchableOpacity>
      <Text style={[s.section, {marginTop:24}]}>Family promise</Text>
      <View style={s.card}>
        <Text style={s.promise}>Use phone up to 4 hours a day</Text>
        <Text style={s.promise}>No phone after 10 PM</Text>
        <Text style={s.promise}>Education apps are unlimited</Text>
      </View>
      <Text style={[s.section, {marginTop:24}]}>Notifications</Text>
      <View style={s.card}>
        {['Geofence alerts', 'Time limit alerts', 'Weekly report'].map(t => (
          <View key={t} style={s.settingRow}><Text style={s.settingName}>{t}</Text><View style={[s.toggle, s.toggleOn]}><View style={[s.toggleThumb, s.toggleThumbOn]}/></View></View>
        ))}
      </View>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  container:{flex:1, backgroundColor:Colors.white},
  content:{padding:20, paddingTop:60, paddingBottom:40},
  title:{fontSize:22, fontWeight:'700', color:Colors.textPrimary, marginBottom:20},
  profile:{alignItems:'center', marginBottom:24},
  profileAvatar:{width:56, height:56, borderRadius:28, backgroundColor:Colors.primaryLight, alignItems:'center', justifyContent:'center', marginBottom:8},
  profileAvatarText:{fontSize:20, fontWeight:'600', color:Colors.primary},
  profileName:{fontSize:16, fontWeight:'600', color:Colors.textPrimary},
  profileEmail:{fontSize:13, color:Colors.textSecondary, marginTop:2},
  section:{fontSize:15, fontWeight:'600', color:Colors.textPrimary, marginBottom:10},
  item:{flexDirection:'row', alignItems:'center', padding:12, backgroundColor:Colors.bg, borderRadius:10, marginBottom:8},
  sm:{width:32, height:32, borderRadius:16, alignItems:'center', justifyContent:'center', marginRight:10},
  smText:{fontSize:12, fontWeight:'600'},
  itemInfo:{flex:1},
  itemName:{fontSize:14, fontWeight:'500', color:Colors.textPrimary},
  itemSub:{fontSize:12, color:Colors.textSecondary, marginTop:2},
  addBtn:{alignItems:'center', paddingVertical:12, borderWidth:0.5, borderColor:Colors.borderMid, borderRadius:10, marginTop:8},
  addBtnText:{fontSize:14, color:Colors.primary},
  card:{backgroundColor:Colors.bg, borderRadius:12, padding:14},
  promise:{fontSize:13, color:Colors.textPrimary, paddingVertical:4},
  settingRow:{flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:10, borderBottomWidth:0.5, borderBottomColor:Colors.border},
  settingName:{fontSize:13, color:Colors.textPrimary},
  toggle:{width:36, height:20, borderRadius:10, backgroundColor:Colors.borderMid, padding:2},
  toggleOn:{backgroundColor:Colors.primary},
  toggleThumb:{width:16, height:16, borderRadius:8, backgroundColor:Colors.white},
  toggleThumbOn:{transform:[{translateX:16}]},
});