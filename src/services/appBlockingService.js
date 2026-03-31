import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../../constants/firebase';

function getRef(familyId, childUid) {
  return doc(db, 'families', familyId, 'appBlocking', childUid);
}

// 부모: 차단 앱 목록 업데이트
export async function updateBlockedApps(familyId, childUid, blockedApps) {
  await setDoc(getRef(familyId, childUid), {
    blockedApps,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

// 부모: 스케줄 기반 앱 차단 설정
export async function updateBlockSchedule(familyId, childUid, schedule) {
  await setDoc(getRef(familyId, childUid), {
    schedule,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

// 실시간 구독
export function subscribeAppBlocking(familyId, childUid, callback) {
  return onSnapshot(getRef(familyId, childUid), (snap) => {
    callback(snap.exists() ? snap.data() : null);
  });
}

// 기본 차단 가능 앱 목록
export const BLOCKABLE_APPS = {
  youtube: {
    name: 'YouTube',
    icon: '📺',
    packages: ['com.google.android.youtube', 'com.google.android.youtubekids'],
  },
  games: {
    name: '게임',
    icon: '🎮',
    packages: [
      'com.roblox.client', 'com.mojang.minecraftpe',
      'com.supercell.clashroyale', 'com.supercell.clashofclans',
      'com.brawlstars', 'com.kiloo.subwaysurf', 'com.outfit7.tomrun',
    ],
  },
  social: {
    name: 'SNS',
    icon: '💬',
    packages: [
      'com.instagram.android', 'com.zhiliaoapp.musically',
      'com.snapchat.android', 'com.facebook.katana',
    ],
  },
  browser: {
    name: '브라우저',
    icon: '🌐',
    packages: [
      'com.android.chrome', 'com.sec.android.app.sbrowser',
      'org.mozilla.firefox',
    ],
  },
};
