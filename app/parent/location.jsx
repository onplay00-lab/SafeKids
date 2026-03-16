import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, Linking } from 'react-native';
import { collection, onSnapshot, getDoc, doc } from 'firebase/firestore';
import { db, auth } from '../../constants/firebase';
import { Colors } from '../../constants/Colors';

const geos = [
  {id:'1', name:'Home', radius:'200m', color:'#1D9E75', on:true},
  {id:'2', name:'School', radius:'300m', color:'#185FA5', on:true},
  {id:'3', name:'Piano class', radius:'150m', color:'#BA7517', on:false},
];

export default function ParentLocation() {
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [familyId, setFamilyId] = useState(null);

  // 1) familyId 가져오기
  useEffect(() => {
    async function loadFamily() {
      try {
        const user = auth.currentUser;
        if (!user) {
          setLoading(false);
          return;
        }
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          setFamilyId(userDoc.data().familyId);
        }
      } catch (e) {
        console.error('Failed to load family:', e);
      }
      setLoading(false);
    }
    loadFamily();
  }, []);

  // 2) 자녀 위치 실시간 구독
  useEffect(() => {
    if (!familyId) return;

    const locRef = collection(db, 'families', familyId, 'locations');
    const unsubscribe = onSnapshot(locRef, (snapshot) => {
      const locs = snapshot.docs.map((d) => ({
        uid: d.id,
        ...d.data(),
      }));
      setChildren(locs);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [familyId]);

  // 지도 열기 (구글맵 링크)
  function openMap(lat, lng) {
    const url = `https://www.google.com/maps?q=${lat},${lng}`;
    Linking.openURL(url);
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>Location</Text>

      {/* 위치 표시 영역 */}
      <View style={s.mapBox}>
        {loading ? (
          <View style={s.centerBox}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={s.loadingText}>위치 불러오는 중...</Text>
          </View>
        ) : children.length > 0 ? (
          <View style={s.centerBox}>
            <Text style={{fontSize:40, marginBottom:8}}>📍</Text>
            <Text style={s.coordText}>
              {children[0].latitude?.toFixed(5)}, {children[0].longitude?.toFixed(5)}
            </Text>
            <Text style={s.timeText}>
              {children[0].updatedAt
                ? new Date(children[0].updatedAt.toDate()).toLocaleString('ko-KR')
                : ''}
            </Text>
            <TouchableOpacity
              style={s.mapBtn}
              onPress={() => openMap(children[0].latitude, children[0].longitude)}
            >
              <Text style={s.mapBtnText}>Open in Google Maps</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.centerBox}>
            <Text style={{fontSize:40, marginBottom:8}}>🔍</Text>
            <Text style={s.noDataText}>No child location data yet</Text>
            <Text style={s.noDataSub}>Child app needs to be running</Text>
          </View>
        )}
      </View>

      {/* 자녀 위치 카드 (여러 자녀일 경우) */}
      {children.map((child) => (
        <TouchableOpacity
          key={child.uid}
          style={s.childCard}
          onPress={() => openMap(child.latitude, child.longitude)}
        >
          <Text style={s.childLabel}>📍 Child Location</Text>
          <Text style={s.childCoord}>
            {child.latitude?.toFixed(5)}, {child.longitude?.toFixed(5)}
          </Text>
          <Text style={s.childTime}>
            {child.updatedAt
              ? new Date(child.updatedAt.toDate()).toLocaleString('ko-KR')
              : ''}
          </Text>
          <Text style={s.tapHint}>Tap to open map</Text>
        </TouchableOpacity>
      ))}

      <Text style={s.section}>Geofence</Text>
      {geos.map(g => (
        <View key={g.id} style={s.geoRow}>
          <View style={[s.geoDot, {backgroundColor:g.color}]}/>
          <View style={s.geoInfo}>
            <Text style={s.geoName}>{g.name}</Text>
            <Text style={s.geoRadius}>Radius {g.radius}</Text>
          </View>
          <View style={[s.toggle, g.on && s.toggleOn]}>
            <View style={[s.toggleThumb, g.on && s.toggleThumbOn]}/>
          </View>
        </View>
      ))}
      <TouchableOpacity style={s.addBtn}>
        <Text style={s.addBtnText}>+ Add place</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container:{flex:1, backgroundColor:Colors.white},
  content:{padding:20, paddingTop:60},
  title:{fontSize:22, fontWeight:'700', color:Colors.textPrimary, marginBottom:16},
  mapBox:{height:250, borderRadius:12, backgroundColor:Colors.bg, marginBottom:16, overflow:'hidden'},
  centerBox:{flex:1, alignItems:'center', justifyContent:'center', padding:20},
  loadingText:{fontSize:13, color:Colors.textSecondary, marginTop:8},
  coordText:{fontSize:15, fontWeight:'600', color:Colors.textPrimary, marginBottom:4},
  timeText:{fontSize:12, color:Colors.textSecondary, marginBottom:12},
  mapBtn:{backgroundColor:Colors.primary, borderRadius:8, paddingVertical:10, paddingHorizontal:20},
  mapBtnText:{color:'#fff', fontSize:14, fontWeight:'600'},
  noDataText:{fontSize:14, fontWeight:'600', color:Colors.textSecondary},
  noDataSub:{fontSize:12, color:Colors.textHint, marginTop:4},
  childCard:{backgroundColor:Colors.bg, borderRadius:10, padding:14, marginBottom:12},
  childLabel:{fontSize:14, fontWeight:'600', color:Colors.textPrimary, marginBottom:4},
  childCoord:{fontSize:13, color:Colors.textSecondary},
  childTime:{fontSize:12, color:Colors.textHint, marginTop:4},
  tapHint:{fontSize:11, color:Colors.primary, marginTop:6},
  section:{fontSize:15, fontWeight:'600', color:Colors.textPrimary, marginBottom:10, marginTop:8},
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
