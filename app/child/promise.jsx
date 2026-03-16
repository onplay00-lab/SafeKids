import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Colors } from '../../constants/Colors';

const promises = [
  {id:'1', text:'Use phone up to 4h a day', sub:'Today 2h 15m used', done:true},
  {id:'2', text:'No phone after 10 PM', sub:'3 days in a row!', done:true},
  {id:'3', text:'No phone during meals', sub:'Not checked yet', done:false},
];
const days = [{d:'Mon',st:'done'},{d:'Tue',st:'done'},{d:'Wed',st:'done'},{d:'Thu',st:'partial'},{d:'Fri',st:'future'},{d:'Sat',st:'future'},{d:'Sun',st:'future'}];

export default function ChildPromise() {
  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>Family promise</Text>
      <Text style={s.subtitle}>Rules we made together</Text>
      {promises.map(p => (
        <View key={p.id} style={s.promiseRow}>
          <View style={[s.check, p.done && s.checkDone]}>{p.done && <View style={s.checkMark}/>}</View>
          <View style={s.promiseInfo}><Text style={s.promiseText}>{p.text}</Text><Text style={s.promiseSub}>{p.sub}</Text></View>
        </View>
      ))}
      <View style={s.weekCard}>
        <Text style={s.weekTitle}>This week</Text>
        <View style={s.weekRow}>
          {days.map(d => (
            <View key={d.d} style={[s.dayCircle, d.st==='done' && s.dayDone, d.st==='partial' && s.dayPartial]}>
              <Text style={[s.dayText, d.st==='done' && s.dayTextDone, d.st==='partial' && s.dayTextPartial]}>{d.d}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={s.locCard}>
        <View style={s.locDot}/><View style={s.locInfo}><Text style={s.locTitle}>Location sharing ON</Text><Text style={s.locDesc}>Parents can see your location</Text></View>
      </View>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  container:{flex:1, backgroundColor:Colors.white},
  content:{padding:20, paddingTop:60, paddingBottom:40},
  title:{fontSize:22, fontWeight:'700', color:Colors.textPrimary, marginBottom:4},
  subtitle:{fontSize:13, color:Colors.textSecondary, marginBottom:20},
  promiseRow:{flexDirection:'row', alignItems:'center', paddingVertical:14, borderBottomWidth:0.5, borderBottomColor:Colors.border},
  check:{width:22, height:22, borderRadius:11, borderWidth:1.5, borderColor:Colors.borderMid, marginRight:12, alignItems:'center', justifyContent:'center'},
  checkDone:{backgroundColor:Colors.safeBg, borderColor:'#97C459'},
  checkMark:{width:8, height:5, borderLeftWidth:1.5, borderBottomWidth:1.5, borderColor:Colors.safe, transform:[{rotate:'-45deg'}], marginTop:-1},
  promiseInfo:{flex:1},
  promiseText:{fontSize:14, color:Colors.textPrimary},
  promiseSub:{fontSize:12, color:Colors.textSecondary, marginTop:2},
  weekCard:{backgroundColor:Colors.bg, borderRadius:12, padding:14, marginTop:20},
  weekTitle:{fontSize:14, fontWeight:'500', color:Colors.textPrimary, marginBottom:12},
  weekRow:{flexDirection:'row', justifyContent:'center', gap:8},
  dayCircle:{width:32, height:32, borderRadius:16, backgroundColor:Colors.bgCard, alignItems:'center', justifyContent:'center'},
  dayDone:{backgroundColor:Colors.safeBg},
  dayPartial:{backgroundColor:Colors.warnBg},
  dayText:{fontSize:12, color:Colors.textHint},
  dayTextDone:{color:Colors.safe},
  dayTextPartial:{color:Colors.warn},
  locCard:{flexDirection:'row', alignItems:'center', padding:14, backgroundColor:Colors.bg, borderRadius:12, marginTop:16},
  locDot:{width:10, height:10, borderRadius:5, backgroundColor:Colors.primary, marginRight:12},
  locInfo:{flex:1},
  locTitle:{fontSize:13, color:Colors.textPrimary},
  locDesc:{fontSize:12, color:Colors.textSecondary, marginTop:2},
});