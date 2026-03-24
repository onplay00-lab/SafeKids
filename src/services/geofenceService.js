import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, getDocs, getDoc, serverTimestamp, setDoc,
} from 'firebase/firestore';
import { db } from '../../constants/firebase';

// 지오펜스 색상 팔레트
const GEO_COLORS = ['#1D9E75', '#185FA5', '#BA7517', '#8B3FC8', '#C83F3F'];

// ============================================
// 거리 계산 (Haversine, 단위: 미터)
// ============================================
export function calcDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ============================================
// 1) 지오펜스 실시간 구독
// ============================================
export function subscribeGeofences(familyId, callback) {
  if (!familyId) return () => {};
  const ref = collection(db, 'families', familyId, 'geofences');
  return onSnapshot(ref, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(list);
  });
}

// ============================================
// 2) 지오펜스 추가
// ============================================
export async function addGeofence(familyId, { name, latitude, longitude, radius }) {
  const ref = collection(db, 'families', familyId, 'geofences');
  const snap = await getDocs(ref);
  const color = GEO_COLORS[snap.size % GEO_COLORS.length];

  return addDoc(ref, {
    name,
    latitude,
    longitude,
    radius: Number(radius),
    enabled: true,
    color,
    createdAt: serverTimestamp(),
  });
}

// ============================================
// 3) 지오펜스 토글 (활성/비활성)
// ============================================
export async function toggleGeofence(familyId, geofenceId, enabled) {
  await updateDoc(doc(db, 'families', familyId, 'geofences', geofenceId), { enabled });
}

// ============================================
// 4) 지오펜스 삭제
// ============================================
export async function deleteGeofence(familyId, geofenceId) {
  await deleteDoc(doc(db, 'families', familyId, 'geofences', geofenceId));
}

// ============================================
// 5) 위치 업데이트마다 진입/이탈 체크 (아이 앱 호출)
// ============================================
export async function checkGeofences(familyId, childUid, latitude, longitude) {
  if (!familyId || !childUid) return;

  // 활성화된 지오펜스 목록
  const geofencesSnap = await getDocs(collection(db, 'families', familyId, 'geofences'));
  const geofences = geofencesSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((g) => g.enabled);

  if (geofences.length === 0) return;

  // 이전 상태 로드
  const statusRef = doc(db, 'families', familyId, 'geofenceStatus', childUid);
  const statusSnap = await getDoc(statusRef);
  const prevStatus = statusSnap.exists() ? statusSnap.data() : {};

  const newStatus = {};
  const alerts = [];

  for (const geo of geofences) {
    const dist = calcDistance(latitude, longitude, geo.latitude, geo.longitude);
    const isInside = dist <= geo.radius;
    newStatus[geo.id] = isInside ? 'inside' : 'outside';

    const prev = prevStatus[geo.id];

    // 처음 체크거나 상태 변화 시 알림
    if (prev === 'inside' && !isInside) {
      alerts.push({ geo, type: 'exit' });
    } else if (prev === 'outside' && isInside) {
      alerts.push({ geo, type: 'enter' });
    }
  }

  // 상태 저장
  await setDoc(statusRef, newStatus, { merge: true });

  // 진입/이탈 발생 시 Firestore에 저장 → Cloud Functions(onGeofenceAlert)가 푸시 전송
  if (alerts.length > 0) {
    let childName = '자녀';
    const childDoc = await getDoc(doc(db, 'users', childUid));
    if (childDoc.exists()) {
      childName = childDoc.data().name || childDoc.data().email?.split('@')[0] || '자녀';
    }

    for (const { geo, type } of alerts) {
      await addDoc(collection(db, 'families', familyId, 'geofenceAlerts'), {
        childUid,
        childName,
        geofenceId: geo.id,
        geofenceName: geo.name,
        type,
        createdAt: serverTimestamp(),
      });
    }
  }
}
