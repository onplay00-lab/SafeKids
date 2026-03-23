import * as Location from 'expo-location';
import { Linking } from 'react-native';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../constants/firebase';
import Constants from 'expo-constants';
import { checkGeofences } from './geofenceService';

const LOCATION_TASK = 'background-location-task';

// Expo Go 여부 판별
const isExpoGo = Constants.appOwnership === 'expo';

// ============================================
// 1) 백그라운드 위치 태스크 (Development Build 전용)
// ============================================
if (!isExpoGo) {
  const TaskManager = require('expo-task-manager');
  TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
    if (error) {
      console.error('Background location error:', error);
      return;
    }
    if (data) {
      const { locations } = data;
      const location = locations[0];
      if (location && auth.currentUser) {
        try {
          await saveLocation(location);
        } catch (e) {
          console.error('Failed to save location:', e);
        }
      }
    }
  });
}

// ============================================
// 2) Firestore에 위치 저장하는 함수
// ============================================
async function saveLocation(location) {
  const user = auth.currentUser;
  if (!user) return;

  const userDoc = await getDoc(doc(db, 'users', user.uid));
  if (!userDoc.exists()) return;

  const familyId = userDoc.data().familyId;
  if (!familyId) return;

  const locationRef = doc(db, 'families', familyId, 'locations', user.uid);
  await setDoc(locationRef, {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy: location.coords.accuracy,
    timestamp: new Date(location.timestamp),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  console.log('Location saved:', location.coords.latitude, location.coords.longitude);

  // 지오펜스 진입/이탈 체크
  try {
    await checkGeofences(familyId, user.uid, location.coords.latitude, location.coords.longitude);
  } catch (e) {
    console.error('Geofence check failed:', e);
  }
}

// 포그라운드 위치 감시 구독 (Expo Go용)
let foregroundSubscription = null;

// ============================================
// 3) 위치 권한 요청 + 추적 시작
// ============================================
export async function startLocationTracking() {
  let fgStatus;
  try {
    const result = await Location.requestForegroundPermissionsAsync();
    fgStatus = result.status;
  } catch (e) {
    console.log('위치 권한 요청 실패:', e);
    return 'denied';
  }
  if (fgStatus !== 'granted') {
    console.log('포그라운드 위치 권한 거부됨');
    return 'denied';
  }

  // 현재 위치 즉시 저장
  try {
    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
      timeout: 10000,
    });
    await saveLocation(current);
  } catch (e) {
    console.log('현재 위치 가져오기 실패 (무시):', e);
  }

  // Expo Go: 포그라운드 watchPosition 사용
  if (isExpoGo) {
    console.log('[Expo Go] 포그라운드 위치 감시 모드');
    if (!foregroundSubscription) {
      foregroundSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 30000,
          distanceInterval: 30,
        },
        async (location) => {
          if (auth.currentUser) {
            try {
              await saveLocation(location);
            } catch (e) {
              console.error('Failed to save watched location:', e);
            }
          }
        }
      );
    }
    return 'foreground-only';
  }

  // Development Build: 백그라운드 추적
  let bgStatus;
  try {
    const result = await Location.requestBackgroundPermissionsAsync();
    bgStatus = result.status;
  } catch (e) {
    console.log('백그라운드 위치 권한 요청 실패:', e);
    bgStatus = 'denied';
  }
  if (bgStatus !== 'granted') {
    console.log('백그라운드 위치 권한 거부됨 → 설정 화면 열기');
    Linking.openSettings(); // 앱 설정에서 "항상 허용" 선택 유도
    if (!foregroundSubscription) {
      foregroundSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 30000,
          distanceInterval: 30,
        },
        async (location) => {
          if (auth.currentUser) {
            try {
              await saveLocation(location);
            } catch (e) {
              console.error('Failed to save watched location:', e);
            }
          }
        }
      );
    }
    return 'foreground-only';
  }

  try {
    const TaskManager = require('expo-task-manager');
    const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK);
    if (!isRegistered) {
      await Location.startLocationUpdatesAsync(LOCATION_TASK, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 60000,
        distanceInterval: 50,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'SafeKids',
          notificationBody: '자녀 안전을 위해 위치를 확인하고 있습니다',
          notificationColor: '#4A90D9',
        },
      });
    }
    return 'active';
  } catch (e) {
    console.log('백그라운드 위치 태스크 등록 실패:', e);
    return 'foreground-only';
  }
}

// ============================================
// 4) 위치 추적 중지
// ============================================
export async function stopLocationTracking() {
  // 포그라운드 구독 해제
  if (foregroundSubscription) {
    foregroundSubscription.remove();
    foregroundSubscription = null;
  }

  // 백그라운드 태스크 해제 (Development Build만)
  if (!isExpoGo) {
    const TaskManager = require('expo-task-manager');
    const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK);
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    }
  }
}
