import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Linking, Alert, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { collection, onSnapshot, getDoc, doc } from 'firebase/firestore';
import { db, auth } from '../../constants/firebase';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../contexts/AuthContext';
import {
  subscribeGeofences, addGeofence, toggleGeofence, deleteGeofence,
} from '../../src/services/geofenceService';

export default function ParentLocation() {
  const { familyId } = useAuth();
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [geofences, setGeofences] = useState([]);

  // 장소 추가 폼 상태
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formRadius, setFormRadius] = useState('200');
  const [formLat, setFormLat] = useState('');
  const [formLng, setFormLng] = useState('');
  const [saving, setSaving] = useState(false);

  // 자녀 위치 실시간 구독
  useEffect(() => {
    if (!familyId) return;
    const locRef = collection(db, 'families', familyId, 'locations');
    const unsub = onSnapshot(locRef, (snap) => {
      setChildren(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [familyId]);

  // 지오펜스 실시간 구독
  useEffect(() => {
    if (!familyId) return;
    return subscribeGeofences(familyId, setGeofences);
  }, [familyId]);

  function openMap(lat, lng) {
    Linking.openURL(`https://www.google.com/maps?q=${lat},${lng}`);
  }

  function useChildLocation() {
    if (children.length === 0) {
      Alert.alert('알림', '자녀 위치 데이터가 없습니다.');
      return;
    }
    setFormLat(String(children[0].latitude?.toFixed(6) || ''));
    setFormLng(String(children[0].longitude?.toFixed(6) || ''));
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
              <Text style={{ fontSize: 40, marginBottom: 8 }}>📍</Text>
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
                <Text style={s.mapBtnText}>Google Maps에서 열기</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.centerBox}>
              <Text style={{ fontSize: 40, marginBottom: 8 }}>🔍</Text>
              <Text style={s.noDataText}>자녀 위치 데이터 없음</Text>
              <Text style={s.noDataSub}>자녀 앱이 실행 중이어야 합니다</Text>
            </View>
          )}
        </View>

        {/* 자녀 위치 카드 (여러 자녀) */}
        {children.map((child) => (
          <TouchableOpacity
            key={child.uid}
            style={s.childCard}
            onPress={() => openMap(child.latitude, child.longitude)}
          >
            <Text style={s.childLabel}>📍 자녀 위치</Text>
            <Text style={s.childCoord}>
              {child.latitude?.toFixed(5)}, {child.longitude?.toFixed(5)}
            </Text>
            <Text style={s.childTime}>
              {child.updatedAt ? new Date(child.updatedAt.toDate()).toLocaleString('ko-KR') : ''}
            </Text>
            <Text style={s.tapHint}>탭하여 지도에서 열기</Text>
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

            {children.length > 0 && (
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
  mapBox: { height: 250, borderRadius: 12, backgroundColor: Colors.bg, marginBottom: 16, overflow: 'hidden' },
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
});
