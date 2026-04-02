import { collection, query, where, orderBy, limit, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../constants/firebase';

// 부모: 행동 알림 구독
export function subscribeBehaviorAlerts(familyId, childUid, callback) {
  if (!familyId || !childUid) return () => {};
  const q = query(
    collection(db, 'families', familyId, 'behaviorAlerts'),
    where('childUid', '==', childUid),
    orderBy('createdAt', 'desc'),
    limit(20)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate() || new Date(),
    })));
  }, (err) => {
    console.error('[행동분석 구독 오류]', err);
    callback([]);
  });
}

// 부모: 알림 읽음 처리
export async function markAlertRead(familyId, alertId) {
  await updateDoc(doc(db, 'families', familyId, 'behaviorAlerts', alertId), { read: true });
}

// 알림 타입별 아이콘
export const ALERT_ICONS = {
  usageSpike: '📈',
  overuse: '📈',
  lateNight: '🌙',
  newApp: '📱',
  trendUp: '📊',
  limitBreach: '⚠️',
  patternChange: '🔄',
};

// 알림 severity 색상
export const SEVERITY_COLORS = {
  info: { bg: '#E3F2FD', text: '#1565C0' },
  warning: { bg: '#FFF3E0', text: '#E65100' },
  critical: { bg: '#FFEBEE', text: '#C62828' },
};
