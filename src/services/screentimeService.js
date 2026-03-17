import { AppState, Platform } from 'react-native';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../constants/firebase';
import {
  checkPermission,
  requestPermission,
  getUsageStats,
} from '../../modules/expo-usage-stats/index';

// ============================================
// 기본 앱 목록 + 패키지 이름 매핑
// ============================================
const DEFAULT_APPS = {
  youtube: { name: 'YouTube',       code: 'YT', color: '#FCEBEB', tc: '#791F1F', limit: 60 },
  game:    { name: 'Game (Roblox)', code: 'GE', color: '#FAEEDA', tc: '#633806', limit: 60 },
  edu:     { name: 'EduApp',        code: 'ED', color: '#EAF3DE', tc: '#27500A', limit: null },
};

// Android 패키지 이름 → 앱 키 매핑
const PACKAGE_MAP = {
  // YouTube
  'com.google.android.youtube':      'youtube',
  'com.google.android.youtubekids':  'youtube',
  // 게임
  'com.roblox.client':               'game',
  'com.mojang.minecraftpe':          'game',
  'com.supercell.clashroyale':       'game',
  'com.supercell.clashofclans':      'game',
  'com.brawlstars':                  'game',
  'com.kiloo.subwaysurf':            'game',
  'com.outfit7.tomrun':              'game',
};

const DEFAULT_DAILY_LIMIT = 240; // 분

// ============================================
// 내부 상태 (AppState 폴백용)
// ============================================
let foregroundStartTime = null;
let isAppActive = true;
let flushInterval = null;
let appStateSub = null;
let usingNative = false; // 네이티브 모듈 사용 여부

// ============================================
// 날짜 문자열 (YYYY-MM-DD)
// ============================================
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function startOfTodayMs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
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
// 2) 네이티브 UsageStats로 Firestore 동기화
// ============================================
async function syncFromNative() {
  const user = auth.currentUser;
  if (!user) return;
  const familyId = await getFamilyId();
  if (!familyId) return;

  const ref = getRef(familyId, user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data();
  if (data.date !== todayStr()) {
    await initScreentime();
    return;
  }

  // 오늘 00:00 ~ 지금 사이의 모든 앱 사용량 조회
  const rawStats = await getUsageStats(startOfTodayMs(), Date.now());

  // 앱별 집계 (ms → 초)
  const appSeconds = {};
  let totalSeconds = 0;

  for (const stat of rawStats) {
    const sec = Math.floor(stat.totalTimeInForeground / 1000);
    totalSeconds += sec;

    const key = PACKAGE_MAP[stat.packageName];
    if (key) {
      appSeconds[key] = (appSeconds[key] || 0) + sec;
    }
  }

  // 앱별 데이터 업데이트
  const apps = { ...(data.apps || {}) };
  for (const [key] of Object.entries(DEFAULT_APPS)) {
    const sec = appSeconds[key] || 0;
    apps[key] = {
      ...apps[key],
      usedSeconds: sec,
      used: Math.floor(sec / 60),
    };
  }

  try {
    await setDoc(ref, {
      dailyUsageSeconds: totalSeconds,
      dailyUsage: Math.floor(totalSeconds / 60),
      apps,
      lastActiveAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    console.error('screentimeService: syncFromNative 실패', e);
  }
}

// ============================================
// 3) AppState 폴백: 경과 시간 저장
// ============================================
async function flushElapsedTime() {
  if (!foregroundStartTime) return;

  const now = Date.now();
  const elapsedSec = Math.floor((now - foregroundStartTime) / 1000);
  foregroundStartTime = now;

  if (elapsedSec < 1) return;

  const user = auth.currentUser;
  if (!user) return;
  const familyId = await getFamilyId();
  if (!familyId) return;

  const ref = getRef(familyId, user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data();
  if (data.date !== todayStr()) { await initScreentime(); return; }

  const newSeconds = (data.dailyUsageSeconds || 0) + elapsedSec;

  try {
    await setDoc(ref, {
      dailyUsageSeconds: newSeconds,
      dailyUsage: Math.floor(newSeconds / 60),
      lastActiveAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    console.error('screentimeService: flushElapsedTime 실패', e);
  }
}

// ============================================
// 4) 사용시간 추적 시작
// ============================================
export async function startUsageTracking() {
  if (flushInterval) return;

  // Android이면 네이티브 모듈 우선 시도
  if (Platform.OS === 'android') {
    try {
      const hasPermission = await checkPermission();
      if (hasPermission) {
        usingNative = true;
        // 즉시 한 번 동기화
        await syncFromNative();
        // 60초마다 실제 사용량 동기화
        flushInterval = setInterval(() => {
          syncFromNative().catch(console.error);
        }, 60000);
        console.log('[Screentime] 네이티브 UsageStats 모드');
        return 'native';
      }
    } catch (e) {
      console.warn('[Screentime] 네이티브 모듈 오류, 폴백:', e);
    }
  }

  // 폴백: AppState 기반 시간 측정
  usingNative = false;
  foregroundStartTime = Date.now();
  isAppActive = true;

  appStateSub = AppState.addEventListener('change', async (nextState) => {
    if (nextState === 'active') {
      isAppActive = true;
      foregroundStartTime = Date.now();
    } else if (nextState === 'background' || nextState === 'inactive') {
      await flushElapsedTime();
      isAppActive = false;
      foregroundStartTime = null;
    }
  });

  flushInterval = setInterval(async () => {
    if (isAppActive && foregroundStartTime) {
      await flushElapsedTime();
    }
  }, 30000);

  console.log('[Screentime] AppState 폴백 모드');
  return 'fallback';
}

// ============================================
// 5) 사용시간 추적 중지
// ============================================
export async function stopUsageTracking() {
  if (!usingNative && isAppActive && foregroundStartTime) {
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
// 6) 권한 확인 / 요청 (외부 노출)
// ============================================
export async function checkUsagePermission() {
  if (Platform.OS !== 'android') return false;
  try { return await checkPermission(); } catch { return false; }
}

export async function requestUsagePermission() {
  if (Platform.OS !== 'android') return;
  try { await requestPermission(); } catch {}
}

// ============================================
// 7) 실시간 구독 - 부모용
// ============================================
export function subscribeScreentime(familyId, childUid, callback) {
  return onSnapshot(getRef(familyId, childUid), (snap) => {
    callback(snap.exists() ? snap.data() : null);
  });
}

// ============================================
// 8) 실시간 구독 - 아이용
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
// 9) 부모: 일일 제한시간 변경
// ============================================
export async function updateDailyLimit(familyId, childUid, limit) {
  await setDoc(getRef(familyId, childUid), { dailyLimit: limit, updatedAt: serverTimestamp() }, { merge: true });
}

// ============================================
// 10) 부모: 앱별 제한시간 변경
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

export { DEFAULT_APPS, PACKAGE_MAP };
