const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const fetch = require("node-fetch");

initializeApp();
const db = getFirestore();

// ============================================
// Expo Push API 전송 헬퍼
// ============================================
async function sendExpoPush({ token, title, body, data = {} }) {
  if (!token) return null;

  const message = {
    to: token,
    sound: "default",
    title,
    body,
    data,
    priority: "high",
  };

  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });

  return response.json();
}

// ============================================
// 부모 토큰 + 자녀 이름 가져오기 헬퍼
// ============================================
async function getParentTokenAndChildName(familyId, childUid) {
  const famSnap = await db.doc(`families/${familyId}`).get();
  if (!famSnap.exists) return { token: null, childName: "자녀" };

  const parentId = famSnap.data().parentId;
  let token = null;
  let notifSettings = {};

  if (parentId) {
    const parentSnap = await db.doc(`users/${parentId}`).get();
    if (parentSnap.exists) {
      token = parentSnap.data().pushToken || null;
      notifSettings = parentSnap.data().notificationSettings || {};
    }
  }

  let childName = "자녀";
  if (childUid) {
    const childSnap = await db.doc(`users/${childUid}`).get();
    if (childSnap.exists) {
      const d = childSnap.data();
      childName = d.name || d.email?.split("@")[0] || "자녀";
    }
  }

  return { token, notifSettings, childName };
}

// ============================================
// 1) SOS 생성 시 → 부모에게 푸시
// ============================================
exports.onSOSCreated = onDocumentCreated(
  "families/{familyId}/sos/{sosId}",
  async (event) => {
    const { familyId, sosId } = event.params;
    const data = event.data.data();
    const childUid = data.childUid;

    const { token, notifSettings, childName } =
      await getParentTokenAndChildName(familyId, childUid);

    if (notifSettings.sos === false) return;
    if (!token) return;

    const address = data.location?.address;
    await sendExpoPush({
      token,
      title: "🚨 SOS 알림",
      body: address
        ? `${childName}이(가) 위험 신호를 보냈습니다! 위치: ${address}`
        : `${childName}이(가) 위험 신호를 보냈습니다!`,
      data: { type: "sos", sosId, familyId },
    });
  }
);

// ============================================
// 2) 지오펜스 알림 생성 시 → 부모에게 푸시
// ============================================
exports.onGeofenceAlert = onDocumentCreated(
  "families/{familyId}/geofenceAlerts/{alertId}",
  async (event) => {
    const { familyId } = event.params;
    const data = event.data.data();

    const { token, notifSettings } =
      await getParentTokenAndChildName(familyId, data.childUid);

    if (notifSettings.geofence === false) return;
    if (!token) return;

    const isEnter = data.type === "enter";
    await sendExpoPush({
      token,
      title: isEnter
        ? `📍 ${data.geofenceName} 도착`
        : `🚶 ${data.geofenceName} 이탈`,
      body: isEnter
        ? `${data.childName}이(가) ${data.geofenceName}에 도착했습니다.`
        : `${data.childName}이(가) ${data.geofenceName}을(를) 벗어났습니다.`,
      data: { type: "geofence", geofenceId: data.geofenceId, familyId },
    });
  }
);

// ============================================
// 3) 위치 업데이트 시 저배터리(≤20%) → 부모에게 푸시 (하루 1회)
// ============================================
exports.onLowBattery = onDocumentUpdated(
  "families/{familyId}/locations/{childUid}",
  async (event) => {
    const { familyId, childUid } = event.params;
    const before = event.data.before.data();
    const after = event.data.after.data();

    const battery = after?.battery ?? -1;
    const charging = after?.charging ?? false;

    // 충전 중이거나 배터리 정보 없으면 무시
    if (charging || battery < 0 || battery > 20) return;

    // 이전에도 저배터리였으면 중복 알림 방지 (5% 이상 변화 없으면 스킵)
    const prevBattery = before?.battery ?? 100;
    if (prevBattery <= 20 && Math.abs(prevBattery - battery) < 5) return;

    const { token, notifSettings, childName } =
      await getParentTokenAndChildName(familyId, childUid);

    if (notifSettings.battery === false) return;
    if (!token) return;

    await sendExpoPush({
      token,
      title: "🔋 저배터리 알림",
      body: `${childName}의 배터리가 ${battery}%입니다. 충전이 필요해요.`,
      data: { type: "lowBattery", familyId, childUid },
    });
  }
);

// ============================================
// 4) 추가 시간 요청 생성 시 → 부모에게 푸시
// ============================================
exports.onTimeRequest = onDocumentCreated(
  "families/{familyId}/timeRequests/{requestId}",
  async (event) => {
    const { familyId } = event.params;
    const data = event.data.data();

    const { token, notifSettings } =
      await getParentTokenAndChildName(familyId, data.childUid);

    if (notifSettings.timeRequest === false) return;
    if (!token) return;

    await sendExpoPush({
      token,
      title: "⏰ 추가 시간 요청",
      body: `${data.childName}이(가) ${data.extraMinutes}분 추가를 요청했습니다.`,
      data: { type: "timeRequest", familyId },
    });
  }
);
