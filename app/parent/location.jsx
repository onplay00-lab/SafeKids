import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../../constants/Colors';

const geos = [
  {id:'1', name:'Home', radius:'200m', color:'#1D9E75', on:true},
  {id:'2', name:'School', radius:'300m', color:'#185FA5', on:true},
  {id:'3', name:'Piano class', radius:'150m', color:'#BA7517', on:false},
];

export default function ParentLocation() {
  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>Location</Text>
      <View style={s.mapBox}>
        <Text style={s.mapHint}>Map will appear here{'\n'}(react-native-maps)</Text>
      </View>
      <Text style={s.section}>Geofence</Text>
      {geos.map(g => (
        <View key={g.id} style={s.geoRow}>
          <View style={[s.geoDot, {backgroundColor:g.color}]}/>
          <View style={s.geoInfo}><Text style={s.geoName}>{g.name}</Text><Text style={s.geoRadius}>Radius {g.radius}</Text></View>
          <View style={[s.toggle, g.on && s.toggleOn]}><View style={[s.toggleThumb, g.on && s.toggleThumbOn]}/></View>
        </View>
      ))}
      <TouchableOpacity style={s.addBtn}><Text style={s.addBtnText}>+ Add place</Text></TouchableOpacity>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  container:{flex:1, backgroundColor:Colors.white},
  content:{padding:20, paddingTop:60},
  title:{fontSize:22, fontWeight:'700', color:Colors.textPrimary, marginBottom:16},
  mapBox:{height:200, backgroundColor:Colors.bg, borderRadius:12, borderWidth:0.5, borderColor:Colors.border, alignItems:'center', justifyContent:'center', marginBottom:20},
  mapHint:{fontSize:12, color:Colors.textHint, textAlign:'center'},
  section:{fontSize:15, fontWeight:'600', color:Colors.textPrimary, marginBottom:10},
  geoRow:{flexDirection:'row', alignItems:'center', paddingVertical:12, borderBottomWidth:0.5, borderBottomColor:Colors.border},
  geoDot:{width:10, height:10, borderRadius:5, marginRight:12},
  geoInfo:{flex:1},
  geoName:{fontSize:14, color:Colors.textPrimary},
  geoRadius:{fontSize:12, color:Colors.textSecondary, marginTop:2},
  toggle:{width:36, height:20, borderRadius:10, backgroundColor:Colors.borderMid, padding:2},
  toggleOn:{backgroundColor:Colors.primary},
  toggleThumb:{width:16, height:16, borderRadius:8, backgroundColor:Colors.white},
  toggleThumbOn:{transform:[{translateX:16}]},
  addBtn:{alignItems:'center', paddingVertical:12, marginTop:16, borderWidth:0.5, borderColor:Colors.borderMid, borderRadius:10},
  addBtnText:{fontSize:14, color:Colors.primary},
});