import { collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp, getDoc, doc } from 'firebase/firestore';
import * as Location from 'expo-location';
import { db, auth } from '../../constants/firebase';
import { sendPushNotification } from './notificationService';

// ============================================
// 1) SOS 전송 (아이 → 부모)
// ============================================
export async function sendSOS(familyId) {
  const user = auth.currentUser;
  if (!user || !familyId) throw new Error('Not authenticated');

  // 현재 위치 가져오기 (실패해도 SOS는 전송)
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
    }
  } catch (e) {
    console.log('Location unavailable during SOS:', e);
  }

  // Firestore families/{familyId}/sos 컬렉션에 저장
  const sosRef = collection(db, 'families', familyId, 'sos');
  const sosDoc = await addDoc(sosRef, {
    childUid: user.uid,
    location: locationData,
    createdAt: serverTimestamp(),
    resolved: false,
  });

  // 부모 푸시 토큰 가져와서 알림 전송
  const famDoc = await getDoc(doc(db, 'families', familyId));
  if (famDoc.exists()) {
    const parentId = famDoc.data().parentId;
    if (parentId) {
      const parentDoc = await getDoc(doc(db, 'users', parentId));
      if (parentDoc.exists()) {
        const parentToken = parentDoc.data().pushToken;
        const childName = (await getDoc(doc(db, 'users', user.uid))).data()?.name || '자녀';
        await sendPushNotification({
          token: parentToken,
          title: '🚨 SOS 알림',
          body: `${childName}이(가) 위험 신호를 보냈습니다!`,
          data: { type: 'sos', sosId: sosDoc.id, familyId },
        });
      }
    }
  }

  return sosDoc.id;
}

// ============================================
// 2) 부모: SOS 알림 실시간 구독
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
