import { collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp, getDoc, doc, updateDoc } from 'firebase/firestore';
import * as Location from 'expo-location';
import { db, auth } from '../../constants/firebase';

// ============================================
// 1) SOS 전송 (아이 → 부모)
// Firestore에 저장하면 Cloud Functions가 자동으로 푸시 알림 전송
// ============================================
export async function sendSOS(familyId) {
  const user = auth.currentUser;
  if (!user || !familyId) throw new Error('Not authenticated');

  // 현재 위치 + 주소 가져오기 (실패해도 SOS는 전송)
  let locationData = null;
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status === 'granted') {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeout: 5000,
      });
      locationData = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };
      try {
        const [addr] = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        if (addr) {
          locationData.address = [addr.region, addr.city, addr.district, addr.street, addr.name]
            .filter(Boolean).join(' ');
        }
      } catch (e2) {
        console.log('주소 변환 실패:', e2);
      }
    }
  } catch (e) {
    console.log('Location unavailable during SOS:', e);
  }

  // Firestore에 저장 → Cloud Functions(onSOSCreated)가 푸시 전송
  const sosRef = collection(db, 'families', familyId, 'sos');
  const sosDoc = await addDoc(sosRef, {
    childUid: user.uid,
    location: locationData,
    createdAt: serverTimestamp(),
    resolved: false,
  });

  return sosDoc.id;
}

// ============================================
// 2) 부모: SOS 해결 처리
// ============================================
export async function resolveSOS(familyId, sosId) {
  await updateDoc(doc(db, 'families', familyId, 'sos', sosId), {
    resolved: true,
    resolvedAt: serverTimestamp(),
  });
}

// ============================================
// 3) 부모: SOS 알림 실시간 구독
// ============================================
export function subscribeSOS(familyId, callback) {
  if (!familyId) return () => {};

  const q = query(
    collection(db, 'families', familyId, 'sos'),
    orderBy('createdAt', 'desc'),
    limit(20)
  );

  return onSnapshot(q, async (snapshot) => {
    const alerts = await Promise.all(
      snapshot.docs.map(async (d) => {
        const data = d.data();
        // 자녀 이름 캐시 없이 직접 fetch (소량)
        let childName = '자녀';
        try {
          const childDoc = await getDoc(doc(db, 'users', data.childUid));
          if (childDoc.exists()) {
            childName = childDoc.data().name || childDoc.data().email?.split('@')[0] || '자녀';
          }
        } catch {}
        return {
          id: d.id,
          ...data,
          childName,
          createdAt: data.createdAt?.toDate() || new Date(),
        };
      })
    );
    callback(alerts);
  });
}
