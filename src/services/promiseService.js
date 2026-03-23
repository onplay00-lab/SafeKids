import {
  collection, doc, addDoc, deleteDoc, query, where, getDocs,
  onSnapshot, orderBy, serverTimestamp, setDoc,
} from 'firebase/firestore';
import { db } from '../../constants/firebase';

// ============================================
// 1) 약속 CRUD
// ============================================

export async function addPromise(familyId, text) {
  await addDoc(collection(db, 'families', familyId, 'promises'), {
    text,
    enabled: true,
    createdAt: serverTimestamp(),
  });
}

export async function deletePromise(familyId, promiseId) {
  await deleteDoc(doc(db, 'families', familyId, 'promises', promiseId));
}

// ============================================
// 2) 약속 목록 실시간 구독
// ============================================

export function subscribePromises(familyId, callback) {
  const q = query(
    collection(db, 'families', familyId, 'promises'),
    orderBy('createdAt', 'asc'),
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

// ============================================
// 3) 체크 토글
// ============================================

function getCheckId(promiseId, childUid, date) {
  return `${promiseId}_${childUid}_${date}`;
}

export async function toggleCheck(familyId, promiseId, childUid, date, currentlyChecked) {
  const checkId = getCheckId(promiseId, childUid, date);
  const ref = doc(db, 'families', familyId, 'promiseChecks', checkId);

  if (currentlyChecked) {
    await deleteDoc(ref);
  } else {
    await setDoc(ref, {
      promiseId,
      childUid,
      date,
      checked: true,
      checkedAt: serverTimestamp(),
    });
  }
}

// ============================================
// 4) 오늘 체크 현황 구독 (자녀용)
// ============================================

export function subscribeTodayChecks(familyId, childUid, callback) {
  const today = todayStr();
  const q = query(
    collection(db, 'families', familyId, 'promiseChecks'),
    where('childUid', '==', childUid),
    where('date', '==', today),
  );
  return onSnapshot(q, (snap) => {
    const checkedMap = {};
    snap.docs.forEach((d) => {
      const data = d.data();
      if (data.checked) checkedMap[data.promiseId] = true;
    });
    callback(checkedMap);
  });
}

// ============================================
// 5) 주간 체크 현황 (자녀용)
// ============================================

export function subscribeWeeklyChecks(familyId, childUid, callback) {
  const { start, end, dates } = getWeekRange();
  const q = query(
    collection(db, 'families', familyId, 'promiseChecks'),
    where('childUid', '==', childUid),
    where('date', '>=', start),
    where('date', '<=', end),
  );
  return onSnapshot(q, (snap) => {
    // date → Set of checked promiseIds
    const byDate = {};
    dates.forEach((d) => { byDate[d] = new Set(); });
    snap.docs.forEach((d) => {
      const data = d.data();
      if (data.checked && byDate[data.date]) {
        byDate[data.date].add(data.promiseId);
      }
    });
    callback({ byDate, dates });
  });
}

// ============================================
// helpers
// ============================================

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekRange() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(formatDate(d));
  }
  return { start: dates[0], end: dates[6], dates };
}
