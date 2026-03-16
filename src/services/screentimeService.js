import { AppState } from 'react-native';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp, increment } from 'firebase/firestore';
import { db, auth } from '../../constants/firebase';

// ============================================
// 기본 앱 목록 (초기화 시 사용)
// ============================================
const DEFAULT_APPS = {
  youtube: { used: 0, limit: 60, name: 'YouTube', code: 'YT', color: '#FCEBEB', tc: '#791F1F' },
  game:    { used: 0, limit: 60, name: 'Game (Roblox)', code: 'GE', color: '#FAEEDA', tc: '#633806' },
  edu:     { used: 0, limit: null, name: 'EduApp', code: 'ED', color: '#EAF3DE', tc: '#27500A' },
};

const DEFAULT_DAILY_LIMIT = 240; // 4시간

let trackingInterval = null;
let appStateSubscription = null;
let isAppActive = true;

// ============================================
// 오늘 날짜 문자열 (YYYY-MM-DD)
// ============================================
function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ============================================
// 현재 유저의 familyId 가져오기
// ============================================
async function getFamilyId() {
  const user = auth.currentUser;
  if (!user) return null;
  const userDoc = await getDoc(doc(db, 'users', user.uid));
  if (!userDoc.exists()) return null;
  return userDoc.data().familyId || null;
}

// ============================================
// 스크린타임 문서 레퍼런스
// ============================================
function getScreentimeRef(familyId, childUid) {
  return doc(db, 'families', familyId, 'screentime', childUid);
}

// ============================================
// 1) 오늘 스크린타임 초기화 (아이 앱 시작 시)
// ============================================
export async function initScreentime() {
  const user = auth.currentUser;
  if (!user) return;

  const familyId = await getFamilyId();
  if (!familyId) return;

  const ref = getScreentimeRef(familyId, user.uid);
  const snap = await getDoc(ref);
  const today = getTodayString();

  if (!snap.exists() || snap.data().date !== today) {
    // 이전 제한시간 유지, 사용량만 리셋
    const prevData = snap.exists() ? snap.data() : {};
    const prevApps = prevData.apps || {};

    const apps = {};
    for (const [key, def] of Object.entries(DEFAULT_APPS)) {
      apps[key] = {
        ...def,
        used: 0,
        limit: prevApps[key]?.limit !== undefined ? prevApps[key].limit : def.limit,
      };
    }

    await setDoc(ref, {
      dailyUsage: 0,
      dailyLimit: prevData.dailyLimit || DEFAULT_DAILY_LIMIT,
      date: today,
      apps,
      lastActiveAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

// ============================================
// 2) 사용시간 추적 시작 (1분마다 기록)
// ============================================
export async function startUsageTracking() {
  if (trackingInterval) return;

  // AppState 감지
  appStateSubscription = AppState.addEventListener('change', (state) => {
    isAppActive = state === 'active';
  });

  trackingInterval = setInterval(async () => {
    if (!isAppActive) return;

    const user = auth.currentUser;
    if (!user) return;

    const familyId = await getFamilyId();
    if (!familyId) return;

    const ref = getScreentimeRef(familyId, user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;

    const data = snap.data();
    if (data.date !== getTodayString()) return;

    // 앱별 사용시간 시뮬레이션: 활성 앱 중 하나에 1분 추가
    const apps = { ...data.apps };
    const activeAppKeys = Object.keys(apps);
    if (activeAppKeys.length > 0) {
      const randomKey = activeAppKeys[Math.floor(Math.random() * activeAppKeys.length)];
      apps[randomKey] = { ...apps[randomKey], used: (apps[randomKey].used || 0) + 1 };
    }

    try {
      await setDoc(ref, {
        dailyUsage: (data.dailyUsage || 0) + 1,
        apps,
        lastActiveAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      console.error('Failed to update screentime:', e);
    }
  }, 60000); // 1분마다
}

// ============================================
// 3) 사용시간 추적 중지
// ============================================
export function stopUsageTracking() {
  if (trackingInterval) {
    clearInterval(trackingInterval);
    trackingInterval = null;
  }
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
}

// ============================================
// 4) 실시간 구독 - 부모용 (특정 아이)
// ============================================
export function subscribeScreentime(familyId, childUid, callback) {
  const ref = getScreentimeRef(familyId, childUid);
  return onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      callback(snap.data());
    } else {
      callback(null);
    }
  });
}

// ============================================
// 5) 실시간 구독 - 아이용 (자기 자신)
// ============================================
export function subscribeMyScreentime(callback) {
  const user = auth.currentUser;
  if (!user) return () => {};

  let unsubscribe = () => {};

  getFamilyId().then((familyId) => {
    if (!familyId) return;
    const ref = getScreentimeRef(familyId, user.uid);
    unsubscribe = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        callback(snap.data());
      } else {
        callback(null);
      }
    });
  });

  return () => unsubscribe();
}

// ============================================
// 6) 부모: 일일 제한시간 변경
// ============================================
export async function updateDailyLimit(familyId, childUid, limit) {
  const ref = getScreentimeRef(familyId, childUid);
  await setDoc(ref, { dailyLimit: limit, updatedAt: serverTimestamp() }, { merge: true });
}

// ============================================
// 7) 부모: 앱별 제한시간 변경
// ============================================
export async function updateAppLimit(familyId, childUid, appKey, limit) {
  const ref = getScreentimeRef(familyId, childUid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const apps = { ...snap.data().apps };
  if (apps[appKey]) {
    apps[appKey] = { ...apps[appKey], limit };
    await setDoc(ref, { apps, updatedAt: serverTimestamp() }, { merge: true });
  }
}
