import { AppState } from 'react-native';
import { doc, setDoc, getDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../constants/firebase';

let appStateSubscription = null;
let activeStartTime = null;

function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function getScreenTimeRef(familyId, childUid) {
  return doc(db, 'families', familyId, 'screentime', childUid);
}

async function getFamilyId() {
  const user = auth.currentUser;
  if (!user) return null;
  const userDoc = await getDoc(doc(db, 'users', user.uid));
  if (!userDoc.exists()) return null;
  return userDoc.data().familyId || null;
}

async function addUsageMinutes(minutes) {
  if (minutes <= 0) return;
  const user = auth.currentUser;
  if (!user) return;

  const familyId = await getFamilyId();
  if (!familyId) return;

  const ref = getScreenTimeRef(familyId, user.uid);
  const todayKey = getTodayKey();

  const snap = await getDoc(ref);
  const existing = snap.exists() ? snap.data() : {};
  const dailyUsage = existing.dailyUsage || {};
  const currentMinutes = dailyUsage[todayKey] || 0;

  await setDoc(ref, {
    dailyUsage: { ...dailyUsage, [todayKey]: Math.round((currentMinutes + minutes) * 10) / 10 },
    lastActiveAt: new Date().toISOString(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  console.log(`Screen time +${minutes.toFixed(1)}min, total: ${(currentMinutes + minutes).toFixed(1)}min`);
}

export async function startScreenTimeTracking() {
  if (appStateSubscription) return;

  activeStartTime = Date.now();

  appStateSubscription = AppState.addEventListener('change', async (nextState) => {
    if (nextState === 'active') {
      activeStartTime = Date.now();
    } else if (nextState === 'background' || nextState === 'inactive') {
      if (activeStartTime) {
        const elapsed = (Date.now() - activeStartTime) / 60000;
        activeStartTime = null;
        if (elapsed >= 0.1) {
          try {
            await addUsageMinutes(elapsed);
          } catch (e) {
            console.error('Failed to save screen time:', e);
          }
        }
      }
    }
  });

  console.log('Screen time tracking started');
}

export function stopScreenTimeTracking() {
  if (activeStartTime) {
    const elapsed = (Date.now() - activeStartTime) / 60000;
    activeStartTime = null;
    if (elapsed >= 0.1) {
      addUsageMinutes(elapsed).catch(console.error);
    }
  }
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
}

export function subscribeScreenTime(familyId, childUid, callback) {
  const ref = getScreenTimeRef(familyId, childUid);
  return onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      const data = snap.data();
      const todayKey = getTodayKey();
      const usedMinutes = (data.dailyUsage && data.dailyUsage[todayKey]) || 0;
      const dailyLimit = data.dailyLimit || 240;
      callback({ usedMinutes: Math.round(usedMinutes), dailyLimit, lastActiveAt: data.lastActiveAt });
    } else {
      callback({ usedMinutes: 0, dailyLimit: 240, lastActiveAt: null });
    }
  });
}

export async function setDailyLimit(familyId, childUid, minutes) {
  const ref = getScreenTimeRef(familyId, childUid);
  await setDoc(ref, { dailyLimit: minutes, updatedAt: serverTimestamp() }, { merge: true });
}
