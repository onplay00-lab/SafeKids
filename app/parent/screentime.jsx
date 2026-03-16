import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Colors } from '../../constants/Colors';

const apps = [
  {id:'1', name:'YouTube', code:'YT', used:58, limit:60, color:'#FCEBEB', tc:'#791F1F'},
  {id:'2', name:'Game (Roblox)', code:'GE', used:42, limit:60, color:'#FAEEDA', tc:'#633806'},
  {id:'3', name:'EduApp', code:'ED', used:35, limit:null, color:'#EAF3DE', tc:'#27500A'},
];

export default function ParentScreenTime() {
  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.headerRow}>
        <Text style={s.title}>Screen time</Text>
        <View style={s.tabs}><View style={s.tabActive}><Text style={s.tabActiveText}>Junhyuk</Text></View><View style={s.tab}><Text style={s.tabText}>Seoyeon</Text></View></View>
      </View>
      <View style={s.card}>
        <View style={s.row}><Text style={s.cardLabel}>Today</Text><Text style={s.cardVal}>2h 15m / 4h</Text></View>
        <View style={s.barBig}><View style={[s.barFillBig, {width:'56%'}]}/></View>
      </View>
      <Text style={s.section}>App usage</Text>
      {apps.map(a => (
        <View key={a.id} style={s.appRow}>
          <View style={[s.appIcon, {backgroundColor:a.color}]}><Text style={[s.appIconText, {color:a.tc}]}>{a.code}</Text></View>
          <View style={s.appInfo}><Text style={s.appName}>{a.name}</Text><Text style={s.appTime}>{a.used}min{a.limit ? ` / limit ${a.limit}min` : ''}</Text></View>
          {a.limit ? <View style={[s.toggle, s.toggleOn]}><View style={[s.toggleThumb, s.toggleThumbOn]}/></View>
            : <View style={s.unlimit}><Text style={s.unlimitText}>No limit</Text></View>}
        </View>
      ))}
      <Text style={[s.section, {marginTop:20}]}>Schedule</Text>
      <View style={s.card}>
        <View style={s.schedRow}><Text style={s.schedName}>Sleep time</Text><Text style={s.schedTime}>22:00 - 07:00</Text></View>
        <View style={[s.schedRow, {borderBottomWidth:0}]}><Text style={s.schedName}>Study time</Text><Text style={s.schedTime}>16:00 - 18:00</Text></View>
      </View>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  container:{flex:1, backgroundColor:Colors.white},
  content:{padding:20, paddingTop:60, paddingBottom:40},
  title:{fontSize:22, fontWeight:'700', color:Colors.textPrimary},
  headerRow:{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:16},
  tabs:{flexDirection:'row', gap:6},
  tab:{paddingHorizontal:14, paddingVertical:6, borderRadius:14, backgroundColor:Colors.bg},
  tabActive:{paddingHorizontal:14, paddingVertical:6, borderRadius:14, backgroundColor:Colors.primaryLight},
  tabText:{fontSize:13, color:Colors.textSecondary},
  tabActiveText:{fontSize:13, color:Colors.primary, fontWeight:'500'},
  card:{backgroundColor:Colors.bg, borderRadius:12, padding:14, marginBottom:8},
  cardLabel:{fontSize:13, color:Colors.textSecondary},
  cardVal:{fontSize:15, fontWeight:'600', color:Colors.textPrimary},
  row:{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:10},
  barBig:{height:6, backgroundColor:Colors.border, borderRadius:3},
  barFillBig:{height:6, backgroundColor:Colors.primary, borderRadius:3},
  section:{fontSize:15, fontWeight:'600', color:Colors.textPrimary, marginTop:12, marginBottom:10},
  appRow:{flexDirection:'row', alignItems:'center', paddingVertical:12, borderBottomWidth:0.5, borderBottomColor:Colors.border},
  appIcon:{width:32, height:32, borderRadius:8, alignItems:'center', justifyContent:'center', marginRight:12},
  appIconText:{fontSize:11, fontWeight:'600'},
  appInfo:{flex:1},
  appName:{fontSize:14, color:Colors.textPrimary},
  appTime:{fontSize:12, color:Colors.textSecondary, marginTop:2},
  toggle:{width:36, height:20, borderRadius:10, backgroundColor:Colors.borderMid, padding:2},
  toggleOn:{backgroundColor:Colors.primary},
  toggleThumb:{width:16, height:16, borderRadius:8, backgroundColor:Colors.white},
  toggleThumbOn:{transform:[{translateX:16}]},
  unlimit:{backgroundColor:Colors.safeBg, paddingHorizontal:8, paddingVertical:3, borderRadius:8},
  unlimitText:{fontSize:11, color:Colors.safe, fontWeight:'500'},
  schedRow:{flexDirection:'row', justifyContent:'space-between', paddingVertical:8, borderBottomWidth:0.5, borderBottomColor:Colors.border},
  schedName:{fontSize:13, color:Colors.textPrimary},
  schedTime:{fontSize:13, color:Colors.textSecondary},
});