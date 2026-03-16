import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../../constants/Colors';

const children = [
  {id:'1', name:'Junhyuk', initials:'JH', location:'Near school', status:'Safe', usedMin:135, limitMin:240, color:Colors.primaryLight, textColor:Colors.primary},
  {id:'2', name:'Seoyeon', initials:'SY', location:'Home (Wi-Fi)', status:'Safe', usedMin:220, limitMin:240, color:'#FBEAF0', textColor:'#72243E'},
];

function fmt(m) { const h=Math.floor(m/60); const mm=m%60; return h>0 ? `${h}h ${mm}m` : `${mm}m`; }

export default function ParentHome() {
  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>SafeKids</Text>
      {children.map(c => (
        <TouchableOpacity key={c.id} style={s.childCard}>
          <View style={[s.avatar, {backgroundColor:c.color}]}><Text style={[s.avatarText, {color:c.textColor}]}>{c.initials}</Text></View>
          <View style={s.childInfo}><Text style={s.childName}>{c.name}</Text><Text style={s.childLoc}>{c.location}</Text></View>
          <View style={[s.badge, {backgroundColor:Colors.safeBg}]}><Text style={[s.badgeText, {color:Colors.safe}]}>{c.status}</Text></View>
        </TouchableOpacity>
      ))}
      <View style={s.card}>
        <Text style={s.cardLabel}>Today screen time</Text>
        <View style={s.usageRow}>
          {children.map(c => {
            const pct = Math.round((c.usedMin/c.limitMin)*100);
            const warn = pct > 80;
            return (
              <View key={c.id} style={s.usageItem}>
                <Text style={s.usageName}>{c.name}</Text>
                <Text style={[s.usageTime, warn && {color:Colors.warn}]}>{fmt(c.usedMin)}</Text>
                <View style={s.bar}><View style={[s.barFill, {width:`${pct}%`, backgroundColor: warn ? '#BA7517' : Colors.primary}]}/></View>
                <Text style={s.usageLimit}>Limit {fmt(c.limitMin)}</Text>
              </View>
            );
          })}
        </View>
      </View>
      <View style={s.card}>
        <Text style={s.cardLabel}>Recent alerts</Text>
        <Text style={s.notiText}>Seoyeon requested 30min bonus</Text>
        <Text style={s.notiTime}>5 min ago</Text>
      </View>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  container:{flex:1, backgroundColor:Colors.white},
  content:{padding:20, paddingTop:60},
  title:{fontSize:22, fontWeight:'700', color:Colors.textPrimary, marginBottom:20},
  childCard:{flexDirection:'row', alignItems:'center', padding:14, backgroundColor:Colors.bg, borderRadius:12, marginBottom:8},
  avatar:{width:40, height:40, borderRadius:20, alignItems:'center', justifyContent:'center', marginRight:12},
  avatarText:{fontSize:14, fontWeight:'600'},
  childInfo:{flex:1},
  childName:{fontSize:15, fontWeight:'600', color:Colors.textPrimary},
  childLoc:{fontSize:12, color:Colors.textSecondary, marginTop:2},
  badge:{paddingHorizontal:10, paddingVertical:4, borderRadius:12},
  badgeText:{fontSize:12, fontWeight:'500'},
  card:{backgroundColor:Colors.bg, borderRadius:12, padding:14, marginTop:12},
  cardLabel:{fontSize:13, color:Colors.textSecondary, marginBottom:10},
  usageRow:{flexDirection:'row', gap:16},
  usageItem:{flex:1},
  usageName:{fontSize:12, color:Colors.textSecondary, marginBottom:4},
  usageTime:{fontSize:18, fontWeight:'600', color:Colors.textPrimary, marginBottom:6},
  bar:{height:4, backgroundColor:Colors.border, borderRadius:2},
  barFill:{height:4, borderRadius:2},
  usageLimit:{fontSize:11, color:Colors.textHint, marginTop:4},
  notiText:{fontSize:13, color:Colors.textPrimary, marginTop:4},
  notiTime:{fontSize:11, color:Colors.textHint, marginTop:3},
});