import { doc, addDoc, collection, query, where, orderBy, limit, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../../constants/firebase';

export const EMOTIONS = [
  { id: 'happy', emoji: '😊', label: '행복해', color: '#E8F5E9', textColor: '#2E7D32' },
  { id: 'excited', emoji: '🤩', label: '신나', color: '#FFF8E1', textColor: '#F57F17' },
  { id: 'calm', emoji: '😌', label: '평온해', color: '#E3F2FD', textColor: '#1565C0' },
  { id: 'tired', emoji: '😩', label: '피곤해', color: '#F3E5F5', textColor: '#7B1FA2' },
  { id: 'sad', emoji: '😢', label: '슬퍼', color: '#E8EAF6', textColor: '#283593' },
  { id: 'angry', emoji: '😤', label: '화나', color: '#FFEBEE', textColor: '#C62828' },
  { id: 'scared', emoji: '😰', label: '무서워', color: '#FFF3E0', textColor: '#E65100' },
  { id: 'bored', emoji: '😐', label: '심심해', color: '#EFEBE9', textColor: '#4E342E' },
];

// 자녀: 감정 체크인 저장
export async function saveEmotionCheck(familyId, childUid, childName, emotionId) {
  const emotion = EMOTIONS.find(e => e.id === emotionId);
  if (!emotion) return;

  await addDoc(collection(db, 'families', familyId, 'emotionChecks'), {
    childUid,
    childName,
    emotionId,
    emoji: emotion.emoji,
    label: emotion.label,
    date: new Date().toISOString().split('T')[0],
    createdAt: serverTimestamp(),
  });
}

// 부모: 특정 자녀의 최근 감정 구독
export function subscribeLatestEmotion(familyId, childUid, callback) {
  const q = query(
    collection(db, 'families', familyId, 'emotionChecks'),
    where('childUid', '==', childUid),
    orderBy('createdAt', 'desc'),
    limit(1)
  );
  return onSnapshot(q, (snap) => {
    if (!snap.empty) {
      callback({ id: snap.docs[0].id, ...snap.docs[0].data() });
    } else {
      callback(null);
    }
  });
}

// 부모: 모든 자녀의 최근 감정 구독
export function subscribeAllEmotions(familyId, callback) {
  const q = query(
    collection(db, 'families', familyId, 'emotionChecks'),
    orderBy('createdAt', 'desc'),
    limit(20)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}
