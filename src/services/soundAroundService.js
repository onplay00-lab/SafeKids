import { collection, addDoc, doc, updateDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../constants/firebase';

// 부모: 주변소리 요청 생성
export async function requestSoundAround(familyId, childUid, durationSec = 30) {
  return addDoc(collection(db, 'families', familyId, 'soundRequests'), {
    childUid,
    status: 'pending',
    durationSec,
    createdAt: serverTimestamp(),
    completedAt: null,
    audioBase64: null,
    audioDuration: null,
  });
}

// 자녀: 대기 중인 요청 구독
export function subscribePendingSoundRequest(familyId, childUid, callback) {
  if (!familyId || !childUid) return () => {};
  const q = query(
    collection(db, 'families', familyId, 'soundRequests'),
    where('childUid', '==', childUid),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc'),
    limit(1)
  );
  return onSnapshot(q, (snap) => {
    if (!snap.empty) {
      const d = snap.docs[0];
      callback({ id: d.id, ...d.data() });
    } else {
      callback(null);
    }
  }, (err) => {
    console.error('[SoundAround 구독 오류]', err);
    callback(null);
  });
}

// 자녀: 요청 상태 업데이트
export async function updateSoundRequest(familyId, requestId, data) {
  await updateDoc(doc(db, 'families', familyId, 'soundRequests', requestId), data);
}

// 부모: 최근 요청 상태 구독 (녹음 완료 감지)
export function subscribeLatestSoundRequest(familyId, childUid, callback) {
  if (!familyId || !childUid) return () => {};
  const q = query(
    collection(db, 'families', familyId, 'soundRequests'),
    where('childUid', '==', childUid),
    orderBy('createdAt', 'desc'),
    limit(1)
  );
  return onSnapshot(q, (snap) => {
    if (!snap.empty) {
      const d = snap.docs[0];
      callback({ id: d.id, ...d.data() });
    } else {
      callback(null);
    }
  }, (err) => {
    console.error('[SoundAround 부모 구독 오류]', err);
    callback(null);
  });
}
