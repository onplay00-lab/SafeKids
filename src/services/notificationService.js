import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../constants/firebase';

// 알림 표시 방식 설정 (앱이 포그라운드일 때도 표시)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// ============================================
// 1) 푸시 토큰 등록 및 Firestore 저장
// ============================================
export async function registerPushToken(uid) {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permission denied');
      return null;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;

    // Firestore users/{uid}에 토큰 저장
    await setDoc(
      doc(db, 'users', uid),
      { pushToken: token, tokenUpdatedAt: serverTimestamp() },
      { merge: true }
    );

    console.log('Push token registered:', token);
    return token;
  } catch (e) {
    console.error('Failed to register push token:', e);
    return null;
  }
}

// ============================================
// 2) 알림 리스너 설정 (앱 루트에서 호출)
// 푸시 알림 전송은 Firebase Cloud Functions에서 처리
// ============================================
export function setupNotificationListeners(onReceive, onResponse) {
  const receiveSub = Notifications.addNotificationReceivedListener(onReceive);
  const responseSub = Notifications.addNotificationResponseReceivedListener(onResponse);
  return () => {
    receiveSub.remove();
    responseSub.remove();
  };
}
