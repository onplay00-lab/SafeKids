import { collection, query, orderBy, limit, getDocs, where } from 'firebase/firestore';
import { db } from '../../constants/firebase';

// 스크린타임 일별 히스토리 조회
export async function fetchDailyHistory(familyId, childUid, days = 7) {
  const q = query(
    collection(db, 'families', familyId, 'screentimeHistory', childUid, 'daily'),
    orderBy('date', 'desc'),
    limit(days)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).reverse();
}

// 감정 히스토리 조회
export async function fetchEmotionHistory(familyId, childUid, days = 14) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const q = query(
    collection(db, 'families', familyId, 'emotionChecks'),
    where('childUid', '==', childUid),
    orderBy('createdAt', 'desc'),
    limit(days)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({
    id: d.id,
    ...d.data(),
    createdAt: d.data().createdAt?.toDate() || new Date(),
  })).reverse();
}

// 통계 계산
export function computeStats(historyData) {
  if (!historyData || historyData.length === 0) {
    return { avg: 0, max: 0, min: 0, total: 0, daysOverLimit: 0, trend: 'stable' };
  }

  const usages = historyData.map(d => d.totalUsage || d.dailyUsage || 0);
  const limits = historyData.map(d => d.dailyLimit || 240);
  const total = usages.reduce((a, b) => a + b, 0);
  const avg = Math.round(total / usages.length);
  const max = Math.max(...usages);
  const min = Math.min(...usages);
  const daysOverLimit = usages.filter((u, i) => u > limits[i]).length;

  // 트렌드 계산 (최근 3일 vs 이전 3일)
  let trend = 'stable';
  if (usages.length >= 6) {
    const recent = usages.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const older = usages.slice(-6, -3).reduce((a, b) => a + b, 0) / 3;
    if (recent > older * 1.2) trend = 'up';
    else if (recent < older * 0.8) trend = 'down';
  }

  // 앱 카테고리 분류
  const appUsage = {};
  historyData.forEach(d => {
    (d.allAppsUsage || []).forEach(app => {
      const cat = categorizeApp(app.packageName || app.name);
      appUsage[cat] = (appUsage[cat] || 0) + (app.usedMinutes || 0);
    });
  });

  // 가장 많이 사용한 앱
  let mostUsedApp = null;
  let mostUsedMin = 0;
  historyData.forEach(d => {
    (d.allAppsUsage || []).forEach(app => {
      const mins = app.usedMinutes || 0;
      if (mins > mostUsedMin) {
        mostUsedMin = mins;
        mostUsedApp = app.name || app.packageName;
      }
    });
  });

  return { avg, max, min, total, daysOverLimit, trend, appUsage, mostUsedApp, mostUsedMin };
}

// 앱 카테고리 분류
function categorizeApp(packageOrName) {
  const name = (packageOrName || '').toLowerCase();
  if (name.includes('youtube') || name.includes('netflix') || name.includes('tiktok') || name.includes('disney')) return 'entertainment';
  if (name.includes('game') || name.includes('roblox') || name.includes('minecraft') || name.includes('brawl')) return 'games';
  if (name.includes('school') || name.includes('edu') || name.includes('learn') || name.includes('math') || name.includes('classting')) return 'education';
  if (name.includes('kakao') || name.includes('instagram') || name.includes('facebook') || name.includes('snap') || name.includes('line')) return 'social';
  if (name.includes('chrome') || name.includes('samsung') || name.includes('gallery') || name.includes('camera')) return 'tools';
  return 'other';
}

export const CATEGORY_COLORS = {
  entertainment: '#FF6B6B',
  games: '#FFB347',
  education: '#4ECDC4',
  social: '#A78BFA',
  tools: '#94A3B8',
  other: '#CBD5E1',
};

export const CATEGORY_LABELS = {
  entertainment: { ko: '엔터테인먼트', en: 'Entertainment' },
  games: { ko: '게임', en: 'Games' },
  education: { ko: '교육', en: 'Education' },
  social: { ko: '소셜', en: 'Social' },
  tools: { ko: '도구', en: 'Tools' },
  other: { ko: '기타', en: 'Other' },
};
