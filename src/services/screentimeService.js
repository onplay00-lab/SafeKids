import { AppState } from 'react-native';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../constants/firebase';

// ============================================
// 기본 앱 목록
// ============================================
const DEFAULT_APPS = {
  youtube: { name: 'YouTube',      code: 'YT', color: '#FCEBEB', tc: '#791F1F', limit: 60 },
  game:    { name: 'Game (Roblox)', code: 'GE', color: '#FAEEDA', tc: '#633806', limit: 60 },
  edu:     { name: 'EduApp',        code: 'ED', color: '#EAF3DE', tc: '#27500A', limit: null },
};

const DEFAULT_DAILY_LIMIT = 240; // 분

// ============================================
// 내부 상태
// ============================================
let foregroundStartTime = null; // Date.now()
let isAppActive = true;
let currentAppKey = null;       // 아이가 선택한 현재 앱
let flushInterval = null;
let appStateSub = null;

// ============================================
// 날짜 문자열 (YYYY-MM-DD)
// ============================================
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

async function getFamilyId() {
  const user = auth.currentUser;
  if (!user) return null;
  const snap = await getDoc(doc(db, 'users', user.uid));
  return snap.exists() ? (snap.data().familyId || null) : null;
}

function getRef(familyId, childUid) {
  return doc(db, 'families', familyId, 'screentime', childUid);
}

// ============================================
// 경과 시간 Firestore에 저장
// ============================================
async function flushElapsedTime() {
  if (!foregroundStartTime) return;

  const now = Date.now();
  const elapsedSec = Math.floor((now - foregroundStartTime) / 1000);
  foregroundStartTime = now; // 다음 flush 기준점 리셋

  if (elapsedSec < 1) return;

  const user = auth.currentUser;
  if (!user) return;
  const familyId = await getFamilyId();
  if (!familyId) return;

  const ref = getRef(familyId, user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data();
  if (data.date !== todayStr()) {
    // 날짜 변경 → 재초기화
    await initScreentime();
    foregroundStartTime = Date.now();
    return;
  }

  const newSeconds = (data.dailyUsageSeconds || 0) + elapsedSec;

  // 앱별 사용시간 업데이트
  const apps = { ...(data.apps || {}) };
  if (currentAppKey && apps[currentAppKey]) {
    const prevAppSec = apps[currentAppKey].usedSeconds || 0;
    const newAppSec = prevAppSec + elapsedSec;
    apps[currentAppKey] = {
      ...apps[currentAppKey],
      usedSeconds: newAppSec,
      used: Math.floor(newAppSec / 60),
    };
  }

  try {
    await setDoc(ref, {
      dailyUsageSeconds: newSeconds,
      dailyUsage: Math.floor(newSeconds / 60),
      apps,
      lastActiveAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    console.error('screentimeService: flush 실패', e);
  }
}

// ============================================
// 1) 오늘 스크린타임 초기화
// ============================================
export async function initScreentime() {
  const user = auth.currentUser;
  if (!user) return;
  const familyId = await getFamilyId();
  if (!familyId) return;

  const ref = getRef(familyId, user.uid);
  const snap = await getDoc(ref);
  const today = todayStr();

  if (!snap.exists() || snap.data().date !== today) {
    const prevData = snap.exists() ? snap.data() : {};
    const prevApps = prevData.apps || {};

    const apps = {};
    for (const [key, def] of Object.entries(DEFAULT_APPS)) {
      apps[key] = {
        ...def,
        used: 0,
        usedSeconds: 0,
        limit: prevApps[key]?.limit !== undefined ? prevApps[key].limit : def.limit,
      };
    }

    await setDoc(ref, {
      dailyUsage: 0,
      dailyUsageSeconds: 0,
      dailyLimit: prevData.dailyLimit || DEFAULT_DAILY_LIMIT,
      date: today,
      apps,
      lastActiveAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

// ============================================
// 2) 사용시간 추적 시작
// ============================================
export async function startUsageTracking() {
  if (flushInterval) return; // 이미 시작됨

  foregroundStartTime = Date.now();
  isAppActive = true;

  // AppState 변화 감지
  appStateSub = AppState.addEventListener('change', async (nextState) => {
    if (nextState === 'active') {
      // 포그라운드 복귀
      isAppActive = true;
      foregroundStartTime = Date.now();
    } else if (nextState === 'background' || nextState === 'inactive') {
      // 백그라운드 전환 → 즉시 저장
      await flushElapsedTime();
      isAppActive = false;
      foregroundStartTime = null;
    }
  });

  // 30초마다 저장 (앱 강제 종료 시 최대 30초 손실)
  flushInterval = setInterval(async () => {
    if (isAppActive && foregroundStartTime) {
      await flushElapsedTime();
    }
  }, 30000);
}

// ============================================
// 3) 사용시간 추적 중지
// ============================================
export async function stopUsageTracking() {
  // 남은 시간 즉시 저장
  if (isAppActive && foregroundStartTime) {
    await flushElapsedTime();
  }

  if (flushInterval) {
    clearInterval(flushInterval);
    flushInterval = null;
  }
  if (appStateSub) {
    appStateSub.remove();
    appStateSub = null;
  }
  foregroundStartTime = null;
}

// ============================================
// 4) 현재 사용 앱 변경 (아이가 직접 선택)
// ============================================
export async function setActiveApp(appKey) {
  // 이전 앱 시간 먼저 flush
  if (isAppActive && foregroundStartTime) {
    await flushElapsedTime();
  }
  currentAppKey = appKey || null;
}

// ============================================
// 5) 실시간 구독 - 부모용
// ============================================
export function subscribeScreentime(familyId, childUid, callback) {
  return onSnapshot(getRef(familyId, childUid), (snap) => {
    callback(snap.exists() ? snap.data() : null);
  });
}

// ============================================
// 6) 실시간 구독 - 아이용
// ============================================
export function subscribeMyScreentime(callback) {
  const user = auth.currentUser;
  if (!user) return () => {};

  let unsubscribe = () => {};
  getFamilyId().then((familyId) => {
    if (!familyId) return;
    unsubscribe = onSnapshot(getRef(familyId, user.uid), (snap) => {
      callback(snap.exists() ? snap.data() : null);
    });
  });
  return () => unsubscribe();
}

// ============================================
// 7) 부모: 일일 제한시간 변경
// ============================================
export async function updateDailyLimit(familyId, childUid, limit) {
  await setDoc(getRef(familyId, childUid), { dailyLimit: limit, updatedAt: serverTimestamp() }, { merge: true });
}

// ============================================
// 8) 부모: 앱별 제한시간 변경
// ============================================
export async function updateAppLimit(familyId, childUid, appKey, limit) {
  const ref = getRef(familyId, childUid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const apps = { ...snap.data().apps };
  if (apps[appKey]) {
    apps[appKey] = { ...apps[appKey], limit };
    await setDoc(ref, { apps, updatedAt: serverTimestamp() }, { merge: true });
  }
}

export { DEFAULT_APPS };
