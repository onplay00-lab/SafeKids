import { useEffect, useState, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Linking, Alert, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { MapView, Marker, Circle, Polyline } from '../../constants/MapComponents';
import { collection, onSnapshot, getDoc, doc, query, orderBy } from 'firebase/firestore';
import { db, auth } from '../../constants/firebase';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../contexts/AuthContext';
import {
  subscribeGeofences, addGeofence, toggleGeofence, deleteGeofence,
} from '../../src/services/geofenceService';

// 역지오코딩: 좌표 → 주소
async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=ko&key=${process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}`
    );
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      return data.results[0].formatted_address.replace('대한민국 ', '');
    }
  } catch (e) {}
  return null;
}

export default function ParentLocation() {
  const { familyId } = useAuth();
  const [childLocations, setChildLocations] = useState([]);
  const [childProfiles, setChildProfiles] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [geofences, setGeofences] = useState([]);
  const [addresses, setAddresses] = useState({});

  // 이동 경로
  const [showHistory, setShowHistory] = useState(false);
  const [historyPoints, setHistoryPoints] = useState([]);
  // 안심존 알림 기록
  const [geoAlerts, setGeoAlerts] = useState([]);

  // 장소 추가 폼 상태
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formRadius, setFormRadius] = useState('200');
  const [formLat, setFormLat] = useState('');
  const [formLng, setFormLng] = useState('');
  const [saving, setSaving] = useState(false);
  const mapRef = useRef(null);

  // 가족 내 자녀 프로필 로드 (childNames 우선 사용)
  useEffect(() => {
    if (!familyId) return;
    async function loadProfiles() {
      const famDoc = await getDoc(doc(db, 'families', familyId));
      if (!famDoc.exists()) return;
      const data = famDoc.data();
      const childUids = data.children || [];
      const names = data.childNames || {};
      const profiles = await Promise.all(childUids.map(async (uid) => {
        if (names[uid]) return { uid, name: names[uid] };
        const userDoc = await getDoc(doc(db, 'users', uid));
        return { uid, name: userDoc.exists() ? (userDoc.data().name || userDoc.data().email?.split('@')[0]) : uid };
      }));
      setChildProfiles(profiles);
    }
    loadProfiles();
  }, [familyId]);

  // 자녀 위치 실시간 구독
  useEffect(() => {
    if (!familyId) return;
    const locRef = collection(db, 'families', familyId, 'locations');
    const unsub = onSnapshot(locRef, (snap) => {
      setChildLocations(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [familyId]);

  // 주소 변환
  useEffect(() => {
    childLocations.forEach(async (child) => {
      if (!child.latitude || addresses[child.uid]) return;
      const addr = await reverseGeocode(child.latitude, child.longitude);
      if (addr) setAddresses((prev) => ({ ...prev, [child.uid]: addr }));
    });
  }, [childLocations]);

  // 지오펜스 실시간 구독
  useEffect(() => {
    if (!familyId) return;
    return subscribeGeofences(familyId, setGeofences);
  }, [familyId]);

  // 안심존 알림 기록 구독
  useEffect(() => {
    if (!familyId) return;
    const q = query(
      collection(db, 'families', familyId, 'geofenceAlerts'),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setGeoAlerts(snap.docs.slice(0, 10).map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [familyId]);

  // 이동 경로 로드
  useEffect(() => {
    if (!familyId || !selectedChild || !showHistory) {
      setHistoryPoints([]);
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const q = query(
      collection(db, 'families', familyId, 'locationHistory', selectedChild.uid, today),
      orderBy('timestamp', 'asc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setHistoryPoints(snap.docs.map((d) => {
        const data = d.data();
        return { latitude: data.latitude, longitude: data.longitude };
      }));
    });
    return unsub;
  }, [familyId, selectedChild, showHistory]);

  // 선택된 자녀의 위치 데이터
  const selectedChild = childProfiles[selectedIdx];
  const selectedLoc = selectedChild
    ? childLocations.find((l) => l.uid === selectedChild.uid)
    : childLocations[0];

  function getChildName(uid) {
    const p = childProfiles.find((c) => c.uid === uid);
    return p ? p.name : '자녀';
  }

  function openMap(lat, lng) {
    Linking.openURL(`https://www.google.com/maps?q=${lat},${lng}`);
  }

  function useChildLocation() {
    if (!selectedLoc?.latitude) {
      Alert.alert('알림', '자녀 위치 데이터가 없습니다.');
      return;
    }
    setFormLat(String(selectedLoc.latitude?.toFixed(6) || ''));
    setFormLng(String(selectedLoc.longitude?.toFixed(6) || ''));
  }

  async function handleAddGeofence() {
    if (!formName.trim()) return Alert.alert('오류', '장소 이름을 입력해주세요.');
    const lat = parseFloat(formLat);
    const lng = parseFloat(formLng);
    if (isNaN(lat) || isNaN(lng)) return Alert.alert('오류', '올바른 위도/경도를 입력해주세요.');
    const radius = parseInt(formRadius, 10);
    if (isNaN(radius) || radius < 50) return Alert.alert('오류', '반경은 50m 이상이어야 합니다.');

    setSaving(true);
    try {
      await addGeofence(familyId, { name: formName.trim(), latitude: lat, longitude: lng, radius });
      setShowForm(false);
      setFormName(''); setFormRadius('200'); setFormLat(''); setFormLng('');
    } catch (e) {
      Alert.alert('오류', '장소 추가에 실패했습니다.');
    }
    setSaving(false);
  }

  async function handleToggle(geo) {
    try {
      await toggleGeofence(familyId, geo.id, !geo.enabled);
    } catch (e) {
      Alert.alert('오류', '변경에 실패했습니다.');
    }
  }

  function handleDelete(geo) {
    Alert.alert(`"${geo.name}" 삭제`, '이 장소를 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => deleteGeofence(familyId, geo.id) },
    ]);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.container} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>위치</Text>

        {/* 자녀 선택 탭 */}
        {childProfiles.length > 1 && (
          <View style={s.childTabs}>
            {childProfiles.map((c, i) => (
              <TouchableOpacity
                key={c.uid}
                style={[s.childTab, i === selectedIdx && s.childTabActive]}
                onPress={() => setSelectedIdx(i)}
              >
                <Text style={[s.childTabText, i === selectedIdx && s.childTabTextActive]}>
                  {c.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* 지도 영역 */}
        <View style={s.mapBox}>
          {loading ? (
            <View style={s.centerBox}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={s.loadingText}>위치 불러오는 중...</Text>
            </View>
          ) : selectedLoc?.latitude && Platform.OS === 'web' ? (
            <View style={s.centerBox}>
              <Text style={{ fontSize: 40, marginBottom: 8 }}>📍</Text>
              <Text style={s.coordText}>
                {selectedLoc.latitude?.toFixed(5)}, {selectedLoc.longitude?.toFixed(5)}
              </Text>
              <Text style={s.timeText}>
                {selectedLoc.updatedAt
                  ? new Date(selectedLoc.updatedAt.toDate()).toLocaleString('ko-KR')
                  : ''}
              </Text>
              <TouchableOpacity
                style={s.mapBtn}
                onPress={() => openMap(selectedLoc.latitude, selectedLoc.longitude)}
              >
                <Text style={s.mapBtnText}>Google Maps에서 열기</Text>
              </TouchableOpacity>
            </View>
          ) : selectedLoc?.latitude ? (
            <>
              <MapView
                ref={mapRef}
                style={StyleSheet.absoluteFill}
                initialRegion={{
                  latitude: selectedLoc.latitude,
                  longitude: selectedLoc.longitude,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                }}
                region={{
                  latitude: selectedLoc.latitude,
                  longitude: selectedLoc.longitude,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                }}
              >
                {childLocations.map((child) =>
                  child.latitude ? (
                    <Marker
                      key={child.uid}
                      coordinate={{ latitude: child.latitude, longitude: child.longitude }}
                      title={getChildName(child.uid)}
                      description={
                        child.updatedAt
                          ? new Date(child.updatedAt.toDate()).toLocaleString('ko-KR')
                          : ''
                      }
                      pinColor={child.uid === selectedChild?.uid ? 'red' : 'blue'}
                    />
                  ) : null
                )}
                {geofences.filter((g) => g.enabled).map((g) => (
                  <Circle
                    key={g.id}
                    center={{ latitude: g.latitude, longitude: g.longitude }}
                    radius={g.radius}
                    strokeColor={g.color || Colors.primary}
                    fillColor={(g.color || Colors.primary) + '20'}
                    strokeWidth={2}
                  />
                ))}
                {showHistory && historyPoints.length > 1 && (
                  <Polyline
                    coordinates={historyPoints}
                    strokeColor="#4A90D9"
                    strokeWidth={3}
                  />
                )}
              </MapView>
              <View style={s.mapOverlay}>
                <Text style={s.mapTimeText}>
                  {selectedLoc.updatedAt
                    ? new Date(selectedLoc.updatedAt.toDate()).toLocaleString('ko-KR')
                    : ''}
                </Text>
                {selectedLoc.battery >= 0 && (
                  <Text style={[s.mapTimeText, selectedLoc.battery <= 20 && { color: Colors.danger }]}>
                    {selectedLoc.charging ? '⚡' : '🔋'} {selectedLoc.battery}%
                  </Text>
                )}
              </View>
              <TouchableOpacity
                style={[s.historyBtn, showHistory && s.historyBtnActive]}
                onPress={() => setShowHistory(!showHistory)}
              >
                <Text style={[s.historyBtnText, showHistory && { color: '#fff' }]}>
                  📍 이동 경로
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={s.centerBox}>
              <Text style={{ fontSize: 40, marginBottom: 8 }}>🔍</Text>
              <Text style={s.noDataText}>자녀 위치 데이터 없음</Text>
              <Text style={s.noDataSub}>자녀 앱이 실행 중이어야 합니다</Text>
            </View>
          )}
        </View>

        {/* 선택된 자녀 주소 카드 */}
        {selectedLoc?.latitude && (
          <TouchableOpacity
            style={s.childCard}
            onPress={() => openMap(selectedLoc.latitude, selectedLoc.longitude)}
          >
            <View style={s.childHeader}>
              <Text style={s.childLabel}>📍 {getChildName(selectedLoc.uid)}</Text>
              {selectedLoc.battery >= 0 && (
                <Text style={[s.batteryText, selectedLoc.battery <= 20 && { color: Colors.danger }]}>
                  {selectedLoc.charging ? '⚡' : '🔋'} {selectedLoc.battery}%
                </Text>
              )}
            </View>
            {addresses[selectedLoc.uid] ? (
              <Text style={s.addressText}>{addresses[selectedLoc.uid]}</Text>
            ) : (
              <Text style={s.childCoord}>
                {selectedLoc.latitude?.toFixed(5)}, {selectedLoc.longitude?.toFixed(5)}
              </Text>
            )}
            <Text style={s.childTime}>
              {selectedLoc.updatedAt ? new Date(selectedLoc.updatedAt.toDate()).toLocaleString('ko-KR') : ''}
            </Text>
            <Text style={s.tapHint}>탭하여 Google Maps에서 열기</Text>
          </TouchableOpacity>
        )}

        {/* 다른 자녀들 위치 카드 */}
        {childLocations.filter((c) => c.uid !== selectedLoc?.uid && c.latitude).map((child) => (
          <TouchableOpacity
            key={child.uid}
            style={s.childCard}
            onPress={() => {
              const idx = childProfiles.findIndex((p) => p.uid === child.uid);
              if (idx >= 0) setSelectedIdx(idx);
              openMap(child.latitude, child.longitude);
            }}
          >
            <Text style={s.childLabel}>📍 {getChildName(child.uid)}</Text>
            {addresses[child.uid] ? (
              <Text style={s.addressText}>{addresses[child.uid]}</Text>
            ) : (
              <Text style={s.childCoord}>
                {child.latitude?.toFixed(5)}, {child.longitude?.toFixed(5)}
              </Text>
            )}
            <Text style={s.childTime}>
              {child.updatedAt ? new Date(child.updatedAt.toDate()).toLocaleString('ko-KR') : ''}
            </Text>
          </TouchableOpacity>
        ))}

        {/* 지오펜스 목록 */}
        <Text style={s.section}>안전 구역</Text>
        {geofences.length === 0 && (
          <Text style={s.emptyText}>등록된 안전 구역이 없습니다</Text>
        )}
        {geofences.map((g) => (
          <TouchableOpacity
            key={g.id}
            style={s.geoRow}
            onLongPress={() => handleDelete(g)}
            activeOpacity={0.7}
          >
            <View style={[s.geoDot, { backgroundColor: g.color || Colors.primary }]} />
            <View style={s.geoInfo}>
              <Text style={s.geoName}>{g.name}</Text>
              <Text style={s.geoRadius}>반경 {g.radius}m</Text>
            </View>
            <TouchableOpacity onPress={() => handleToggle(g)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <View style={[s.toggle, g.enabled && s.toggleOn]}>
                <View style={[s.toggleThumb, g.enabled && s.toggleThumbOn]} />
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
        {geofences.length > 0 && (
          <Text style={s.deleteTip}>길게 눌러서 삭제</Text>
        )}

        {/* 안심존 알림 기록 */}
        {geoAlerts.length > 0 && (
          <>
            <Text style={s.section}>안심존 알림 기록</Text>
            {geoAlerts.map((a) => (
              <View key={a.id} style={s.alertRow}>
                <Text style={s.alertIcon}>{a.type === 'entered' ? '🟢' : '🔴'}</Text>
                <View style={s.alertInfo}>
                  <Text style={s.alertText}>
                    {a.childName || '자녀'}이(가) {a.geofenceName} {a.type === 'entered' ? '진입' : '이탈'}
                  </Text>
                  <Text style={s.alertTime}>
                    {a.createdAt?.toDate ? new Date(a.createdAt.toDate()).toLocaleString('ko-KR') : ''}
                  </Text>
                </View>
              </View>
            ))}
          </>
        )}

        {/* 장소 추가 폼 */}
        {showForm ? (
          <View style={s.form}>
            <Text style={s.formTitle}>새 안전 구역 추가</Text>

            <Text style={s.label}>장소 이름</Text>
            <TextInput
              style={s.input}
              value={formName}
              onChangeText={setFormName}
              placeholder="예: 집, 학교"
              placeholderTextColor={Colors.textHint}
            />

            <Text style={s.label}>반경 (미터)</Text>
            <TextInput
              style={s.input}
              value={formRadius}
              onChangeText={setFormRadius}
              keyboardType="numeric"
              placeholder="200"
              placeholderTextColor={Colors.textHint}
            />

            <Text style={s.label}>위도 / 경도</Text>
            <View style={s.coordRow}>
              <TextInput
                style={[s.input, s.coordInput]}
                value={formLat}
                onChangeText={setFormLat}
                keyboardType="numeric"
                placeholder="위도"
                placeholderTextColor={Colors.textHint}
              />
              <TextInput
                style={[s.input, s.coordInput]}
                value={formLng}
                onChangeText={setFormLng}
                keyboardType="numeric"
                placeholder="경도"
                placeholderTextColor={Colors.textHint}
              />
            </View>

            {selectedLoc?.latitude && (
              <TouchableOpacity style={s.useLocBtn} onPress={useChildLocation}>
                <Text style={s.useLocText}>📍 자녀 현재 위치 사용</Text>
              </TouchableOpacity>
            )}

            <View style={s.formBtns}>
              <TouchableOpacity
                style={s.cancelBtn}
                onPress={() => { setShowForm(false); setFormName(''); setFormRadius('200'); setFormLat(''); setFormLng(''); }}
              >
                <Text style={s.cancelBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.saveBtn} onPress={handleAddGeofence} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>추가</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={s.addBtn} onPress={() => setShowForm(true)}>
            <Text style={s.addBtnText}>+ 안전 구역 추가</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary, marginBottom: 16 },
  childTabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  childTab: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: Colors.bg },
  childTabActive: { backgroundColor: Colors.primary },
  childTabText: { fontSize: 14, color: Colors.textSecondary },
  childTabTextActive: { color: '#fff', fontWeight: '600' },
  addressText: { fontSize: 14, fontWeight: '500', color: Colors.textPrimary, marginBottom: 2 },
  mapBox: { height: 300, borderRadius: 12, backgroundColor: Colors.bg, marginBottom: 16, overflow: 'hidden' },
  mapOverlay: { position: 'absolute', bottom: 8, left: 8, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  mapTimeText: { fontSize: 11, color: Colors.textSecondary },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  loadingText: { fontSize: 13, color: Colors.textSecondary, marginTop: 8 },
  coordText: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary, marginBottom: 4 },
  timeText: { fontSize: 12, color: Colors.textSecondary, marginBottom: 12 },
  mapBtn: { backgroundColor: Colors.primary, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 20 },
  mapBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  noDataText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  noDataSub: { fontSize: 12, color: Colors.textHint, marginTop: 4 },
  childCard: { backgroundColor: Colors.bg, borderRadius: 10, padding: 14, marginBottom: 12 },
  childLabel: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, marginBottom: 4 },
  childCoord: { fontSize: 13, color: Colors.textSecondary },
  childTime: { fontSize: 12, color: Colors.textHint, marginTop: 4 },
  tapHint: { fontSize: 11, color: Colors.primary, marginTop: 6 },
  section: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary, marginBottom: 10, marginTop: 8 },
  emptyText: { fontSize: 13, color: Colors.textHint, marginBottom: 12 },
  geoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  geoDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  geoInfo: { flex: 1 },
  geoName: { fontSize: 14, color: Colors.textPrimary },
  geoRadius: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  toggle: { width: 36, height: 20, borderRadius: 10, backgroundColor: Colors.borderMid, padding: 2 },
  toggleOn: { backgroundColor: Colors.primary },
  toggleThumb: { width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.white },
  toggleThumbOn: { transform: [{ translateX: 16 }] },
  deleteTip: { fontSize: 11, color: Colors.textHint, marginTop: 6, marginBottom: 4 },
  addBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 16, borderWidth: 0.5, borderColor: Colors.borderMid, borderRadius: 10 },
  addBtnText: { fontSize: 14, color: Colors.primary },
  form: { marginTop: 16, backgroundColor: Colors.bg, borderRadius: 12, padding: 16 },
  formTitle: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary, marginBottom: 14 },
  label: { fontSize: 12, color: Colors.textSecondary, marginBottom: 4 },
  input: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.textPrimary, marginBottom: 12 },
  coordRow: { flexDirection: 'row', gap: 8 },
  coordInput: { flex: 1 },
  useLocBtn: { backgroundColor: Colors.primaryLight, borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginBottom: 14 },
  useLocText: { fontSize: 13, color: Colors.primary, fontWeight: '500' },
  formBtns: { flexDirection: 'row', gap: 8 },
  cancelBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderRadius: 8 },
  cancelBtnText: { fontSize: 14, color: Colors.textSecondary },
  saveBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', backgroundColor: Colors.primary, borderRadius: 8 },
  saveBtnText: { fontSize: 14, color: '#fff', fontWeight: '600' },
  childHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  batteryText: { fontSize: 13, fontWeight: '600', color: Colors.safe },
  historyBtn: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  historyBtnActive: { backgroundColor: Colors.primary },
  historyBtnText: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary },
  alertRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  alertIcon: { fontSize: 16, marginRight: 10 },
  alertInfo: { flex: 1 },
  alertText: { fontSize: 13, color: Colors.textPrimary },
  alertTime: { fontSize: 11, color: Colors.textHint, marginTop: 2 },
});
