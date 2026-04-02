const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const fetch = require("node-fetch");

initializeApp();
const db = getFirestore();

// ============================================
// i18n: 서버 사이드 푸시 알림 번역
// ============================================
const PUSH_STRINGS = {
  ko: {
    "sos.title": "🚨 SOS 알림",
    "sos.bodyWithAddr": "{{name}}이(가) 위험 신호를 보냈습니다! 위치: {{address}}",
    "sos.body": "{{name}}이(가) 위험 신호를 보냈습니다!",
    "geo.enterTitle": "📍 {{place}} 도착",
    "geo.leaveTitle": "🚶 {{place}} 이탈",
    "geo.enterBody": "{{name}}이(가) {{place}}에 도착했습니다.",
    "geo.leaveBody": "{{name}}이(가) {{place}}을(를) 벗어났습니다.",
    "battery.title": "🔋 저배터리 알림",
    "battery.body": "{{name}}의 배터리가 {{pct}}%입니다. 충전이 필요해요.",
    "loud.title": "📢 부모님이 연락을 원해요!",
    "loud.body": "지금 바로 확인해주세요!",
    "chat.title": "💬 {{name}}",
    "chat.defaultName": "가족",
    "chat.body": "새 메시지가 있어요",
    "emotion.title": "{{emoji}} {{name}}의 기분",
    "emotion.body": "오늘 기분: {{label}}",
    "timeReq.title": "⏰ 추가 시간 요청",
    "timeReq.body": "{{name}}이(가) {{min}}분 추가를 요청했습니다.",
    "sound.title": "🎧 주변 소리 요청",
    "sound.body": "부모님이 주변 소리를 요청했습니다. 30초간 녹음됩니다.",
    "sound.completeTitle": "🎧 주변 소리 녹음 완료",
    "sound.completeBody": "{{name}}의 주변 소리 녹음이 완료되었습니다.",
    "behavior.lateNightTitle": "🌙 심야 사용 감지",
    "behavior.lateNightBody": "{{name}}이(가) 심야 시간({{time}})에 기기를 사용 중입니다.",
    "behavior.overuseTitle": "📈 과다 사용 감지",
    "behavior.overuseBody": "{{name}}이(가) 제한 시간({{limit}})의 {{pct}}%를 사용했습니다.",
    "behavior.newAppTitle": "📱 새 앱 사용 감지",
    "behavior.newAppBody": "{{name}}이(가) 새로운 앱 '{{app}}'을(를) 사용하기 시작했습니다.",
    "child": "자녀",
    "emotions.happy": "행복해", "emotions.excited": "신나", "emotions.calm": "평온해",
    "emotions.tired": "피곤해", "emotions.sad": "슬퍼", "emotions.angry": "화나",
    "emotions.scared": "무서워", "emotions.bored": "심심해",
  },
  en: {
    "sos.title": "🚨 SOS Alert",
    "sos.bodyWithAddr": "{{name}} sent a distress signal! Location: {{address}}",
    "sos.body": "{{name}} sent a distress signal!",
    "geo.enterTitle": "📍 Arrived at {{place}}",
    "geo.leaveTitle": "🚶 Left {{place}}",
    "geo.enterBody": "{{name}} arrived at {{place}}.",
    "geo.leaveBody": "{{name}} left {{place}}.",
    "battery.title": "🔋 Low Battery Alert",
    "battery.body": "{{name}}'s battery is at {{pct}}%. Please charge.",
    "loud.title": "📢 Your parent wants to reach you!",
    "loud.body": "Please check now!",
    "chat.title": "💬 {{name}}",
    "chat.defaultName": "Family",
    "chat.body": "New message",
    "emotion.title": "{{emoji}} {{name}}'s mood",
    "emotion.body": "Today's mood: {{label}}",
    "timeReq.title": "⏰ Extra Time Request",
    "timeReq.body": "{{name}} requested {{min}} extra minutes.",
    "sound.title": "🎧 Sound Around Request",
    "sound.body": "Your parent requested to hear your surroundings. Recording for 30 seconds.",
    "sound.completeTitle": "🎧 Sound Around Complete",
    "sound.completeBody": "{{name}}'s surrounding sound recording is ready.",
    "behavior.lateNightTitle": "🌙 Late Night Usage Detected",
    "behavior.lateNightBody": "{{name}} is using the device late at night ({{time}}).",
    "behavior.overuseTitle": "📈 Overuse Detected",
    "behavior.overuseBody": "{{name}} has used {{pct}}% of the time limit ({{limit}}).",
    "behavior.newAppTitle": "📱 New App Detected",
    "behavior.newAppBody": "{{name}} started using a new app '{{app}}'.",
    "child": "Child",
    "emotions.happy": "Happy", "emotions.excited": "Excited", "emotions.calm": "Calm",
    "emotions.tired": "Tired", "emotions.sad": "Sad", "emotions.angry": "Angry",
    "emotions.scared": "Scared", "emotions.bored": "Bored",
  },
};

function tr(lang, key, vars = {}) {
  const strings = PUSH_STRINGS[lang] || PUSH_STRINGS.ko;
  let s = strings[key] || PUSH_STRINGS.ko[key] || key;
  for (const [k, v] of Object.entries(vars)) {
    s = s.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
  }
  return s;
}

async function getUserLang(uid) {
  if (!uid) return "ko";
  try {
    const snap = await db.doc(`users/${uid}`).get();
    return snap.exists ? (snap.data().language || "ko") : "ko";
  } catch (e) {
    return "ko";
  }
}

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
// 모든 부모 토큰 + 자녀 이름 가져오기 헬퍼
// ============================================
async function getParentTokensAndChildName(familyId, childUid) {
  const famSnap = await db.doc(`families/${familyId}`).get();
  if (!famSnap.exists) return { parents: [], childName: "자녀" };

  const famData = famSnap.data();
  // parentIds 배열 또는 레거시 parentId 호환
  const parentIds = famData.parentIds || (famData.parentId ? [famData.parentId] : []);

  const parents = [];
  for (const pid of parentIds) {
    const parentSnap = await db.doc(`users/${pid}`).get();
    if (parentSnap.exists) {
      const pData = parentSnap.data();
      parents.push({
        uid: pid,
        token: pData.pushToken || null,
        notifSettings: pData.notificationSettings || {},
        lang: pData.language || "ko",
      });
    }
  }

  // childNames 맵 우선, 없으면 users 문서에서 가져오기
  let childName = "자녀";
  if (childUid) {
    const customName = (famData.childNames || {})[childUid];
    if (customName) {
      childName = customName;
    } else {
      const childSnap = await db.doc(`users/${childUid}`).get();
      if (childSnap.exists) {
        const d = childSnap.data();
        childName = d.name || d.email?.split("@")[0] || "자녀";
      }
    }
  }

  return { parents, childName };
}

// 모든 부모에게 푸시 전송 (언어별 번역 지원)
// titleFn, bodyFn: (lang) => string 형태의 함수 또는 고정 문자열
async function sendPushToAllParents(parents, notifKey, { titleFn, bodyFn, title, body, data }) {
  const promises = [];
  for (const p of parents) {
    if (notifKey && p.notifSettings[notifKey] === false) continue;
    if (!p.token) continue;
    const t = titleFn ? titleFn(p.lang || "ko") : title;
    const b = bodyFn ? bodyFn(p.lang || "ko") : body;
    promises.push(sendExpoPush({ token: p.token, title: t, body: b, data }));
  }
  return Promise.all(promises);
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

    const { parents, childName } =
      await getParentTokensAndChildName(familyId, childUid);

    const address = data.location?.address;
    await sendPushToAllParents(parents, "sos", {
      titleFn: (lang) => tr(lang, "sos.title"),
      bodyFn: (lang) => address
        ? tr(lang, "sos.bodyWithAddr", { name: childName, address })
        : tr(lang, "sos.body", { name: childName }),
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

    const { parents } =
      await getParentTokensAndChildName(familyId, data.childUid);

    const isEnter = data.type === "enter";
    await sendPushToAllParents(parents, "geofence", {
      titleFn: (lang) => isEnter
        ? tr(lang, "geo.enterTitle", { place: data.geofenceName })
        : tr(lang, "geo.leaveTitle", { place: data.geofenceName }),
      bodyFn: (lang) => isEnter
        ? tr(lang, "geo.enterBody", { name: data.childName, place: data.geofenceName })
        : tr(lang, "geo.leaveBody", { name: data.childName, place: data.geofenceName }),
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

    const { parents, childName } =
      await getParentTokensAndChildName(familyId, childUid);

    await sendPushToAllParents(parents, "battery", {
      titleFn: (lang) => tr(lang, "battery.title"),
      bodyFn: (lang) => tr(lang, "battery.body", { name: childName, pct: battery }),
      data: { type: "lowBattery", familyId, childUid },
    });
  }
);

// ============================================
// 4) 추가 시간 요청 생성 시 → 부모에게 푸시
// ============================================
// ============================================
// 4-1) 큰소리 신호 → 자녀에게 푸시 (무음모드에서도 울림)
// ============================================
exports.onLoudSignal = onDocumentCreated(
  "families/{familyId}/loudSignals/{signalId}",
  async (event) => {
    const { familyId } = event.params;
    const data = event.data.data();
    const childUid = data.childUid;

    if (!childUid) return;

    const childSnap = await db.doc(`users/${childUid}`).get();
    if (!childSnap.exists) return;

    const childData = childSnap.data();
    const childToken = childData.pushToken;
    if (!childToken) return;

    const lang = childData.language || "ko";
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: childToken,
        sound: "default",
        title: tr(lang, "loud.title"),
        body: data.message || tr(lang, "loud.body"),
        data: { type: "loudSignal", familyId },
        priority: "high",
        channelId: "loud-signal",
      }),
    });
  }
);

// ============================================
// 5) 가족 채팅 메시지 → 상대방에게 푸시
// ============================================
exports.onChatMessage = onDocumentCreated(
  "families/{familyId}/chat/{messageId}",
  async (event) => {
    const { familyId } = event.params;
    const data = event.data.data();
    const senderUid = data.senderUid;

    const famSnap = await db.doc(`families/${familyId}`).get();
    if (!famSnap.exists) return;

    const famData = famSnap.data();
    const parentIds = famData.parentIds || (famData.parentId ? [famData.parentId] : []);
    const childIds = famData.children || [];
    const allMembers = [...parentIds, ...childIds];

    // 발신자 제외한 모든 가족에게 푸시
    const recipients = allMembers.filter((uid) => uid !== senderUid);

    for (const uid of recipients) {
      const userSnap = await db.doc(`users/${uid}`).get();
      if (!userSnap.exists) continue;
      const userData = userSnap.data();
      const token = userData.pushToken;
      if (!token) continue;

      const lang = userData.language || "ko";
      await sendExpoPush({
        token,
        title: tr(lang, "chat.title", { name: data.senderName || tr(lang, "chat.defaultName") }),
        body: data.text || tr(lang, "chat.body"),
        data: { type: "chat", familyId },
      });
    }
  }
);

// ============================================
// 6) 감정 체크인 → 부모에게 푸시
// ============================================
exports.onEmotionCheck = onDocumentCreated(
  "families/{familyId}/emotionChecks/{checkId}",
  async (event) => {
    const { familyId } = event.params;
    const data = event.data.data();

    const { parents } =
      await getParentTokensAndChildName(familyId, data.childUid);

    await sendPushToAllParents(parents, null, {
      titleFn: (lang) => tr(lang, "emotion.title", { emoji: data.emoji, name: data.childName }),
      bodyFn: (lang) => tr(lang, "emotion.body", { label: data.emotionId ? tr(lang, `emotions.${data.emotionId}`) : data.label }),
      data: { type: "emotion", familyId },
    });
  }
);

exports.onTimeRequest = onDocumentCreated(
  "families/{familyId}/timeRequests/{requestId}",
  async (event) => {
    const { familyId } = event.params;
    const data = event.data.data();

    const { parents } =
      await getParentTokensAndChildName(familyId, data.childUid);

    await sendPushToAllParents(parents, "timeRequest", {
      titleFn: (lang) => tr(lang, "timeReq.title"),
      bodyFn: (lang) => tr(lang, "timeReq.body", { name: data.childName, min: data.extraMinutes }),
      data: { type: "timeRequest", familyId },
    });
  }
);

// ============================================
// 8) Sound Around 요청 → 자녀에게 푸시
// ============================================
exports.onSoundRequest = onDocumentCreated(
  "families/{familyId}/soundRequests/{requestId}",
  async (event) => {
    const { familyId } = event.params;
    const data = event.data.data();
    const childUid = data.childUid;

    if (!childUid || data.status !== "pending") return;

    const childSnap = await db.doc(`users/${childUid}`).get();
    if (!childSnap.exists) return;

    const childData = childSnap.data();
    const childToken = childData.pushToken;
    if (!childToken) return;

    const lang = childData.language || "ko";
    await sendExpoPush({
      token: childToken,
      title: tr(lang, "sound.title"),
      body: tr(lang, "sound.body"),
      data: { type: "soundRequest", familyId },
    });
  }
);

// ============================================
// 9) Sound Around 완료 → 부모에게 푸시
// ============================================
exports.onSoundComplete = onDocumentUpdated(
  "families/{familyId}/soundRequests/{requestId}",
  async (event) => {
    const { familyId } = event.params;
    const before = event.data.before.data();
    const after = event.data.after.data();

    // pending → completed 전환 시에만
    if (before.status !== "pending" || after.status !== "completed") return;

    const { parents, childName } =
      await getParentTokensAndChildName(familyId, after.childUid);

    await sendPushToAllParents(parents, null, {
      titleFn: (lang) => tr(lang, "sound.completeTitle"),
      bodyFn: (lang) => tr(lang, "sound.completeBody", { name: childName }),
      data: { type: "soundComplete", familyId },
    });
  }
);

// ============================================
// 10) AI 행동 분석: 스크린타임 기록 생성 시 → 패턴 분석 + 알림
// ============================================
exports.analyzeDailyBehavior = onDocumentCreated(
  "families/{familyId}/screentimeHistory/{childUid}/daily/{dateId}",
  async (event) => {
    const { familyId, childUid, dateId } = event.params;
    const data = event.data.data();
    const totalUsage = data.totalUsage || data.dailyUsage || 0;
    const dailyLimit = data.dailyLimit || 240;
    const allApps = data.allAppsUsage || [];

    const { parents, childName } =
      await getParentTokensAndChildName(familyId, childUid);

    const alerts = [];

    // 1) 과다 사용 감지 (제한의 150% 이상)
    if (dailyLimit > 0 && totalUsage > dailyLimit * 1.5) {
      const pct = Math.round((totalUsage / dailyLimit) * 100);
      const fmtLimit = dailyLimit >= 60 ? `${Math.floor(dailyLimit/60)}h${dailyLimit%60}m` : `${dailyLimit}m`;
      alerts.push({
        type: "overuse",
        severity: "warning",
        title: "과다 사용",
        titleEn: "Overuse",
        description: `${childName}: 제한 시간의 ${pct}% 사용`,
        descriptionEn: `${childName}: Used ${pct}% of time limit`,
        pushTitleFn: (lang) => tr(lang, "behavior.overuseTitle"),
        pushBodyFn: (lang) => tr(lang, "behavior.overuseBody", { name: childName, pct, limit: fmtLimit }),
      });
    }

    // 2) 심야 사용 감지 (데이터에 lateNightUsage 필드가 있으면)
    const lateUsage = data.lateNightMinutes || 0;
    if (lateUsage > 10) {
      alerts.push({
        type: "lateNight",
        severity: "warning",
        title: "심야 사용",
        titleEn: "Late Night Usage",
        description: `${childName}: 심야 시간에 ${lateUsage}분 사용`,
        descriptionEn: `${childName}: Used device for ${lateUsage}min late at night`,
        pushTitleFn: (lang) => tr(lang, "behavior.lateNightTitle"),
        pushBodyFn: (lang) => tr(lang, "behavior.lateNightBody", { name: childName, time: `${lateUsage}min` }),
      });
    }

    // 3) 새로운 앱 감지 (이전 기록과 비교)
    try {
      const prevDate = new Date(dateId);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevId = prevDate.toISOString().split("T")[0];
      const prevSnap = await db.doc(`families/${familyId}/screentimeHistory/${childUid}/daily/${prevId}`).get();
      if (prevSnap.exists) {
        const prevApps = new Set((prevSnap.data().allAppsUsage || []).map(a => a.packageName || a.name));
        const newApps = allApps.filter(a => !prevApps.has(a.packageName || a.name) && (a.usedMinutes || 0) > 5);
        for (const app of newApps.slice(0, 3)) {
          alerts.push({
            type: "newApp",
            severity: "info",
            title: "새 앱 사용",
            titleEn: "New App",
            description: `${childName}: '${app.name || app.packageName}' 사용 시작`,
            descriptionEn: `${childName}: Started using '${app.name || app.packageName}'`,
            pushTitleFn: (lang) => tr(lang, "behavior.newAppTitle"),
            pushBodyFn: (lang) => tr(lang, "behavior.newAppBody", { name: childName, app: app.name || app.packageName }),
          });
        }
      }
    } catch (e) {
      // 이전 기록 없으면 무시
    }

    // Firestore에 알림 저장 + 부모에게 푸시
    for (const alert of alerts) {
      await db.collection(`families/${familyId}/behaviorAlerts`).add({
        childUid,
        childName,
        type: alert.type,
        severity: alert.severity,
        title: alert.title,
        titleEn: alert.titleEn,
        description: alert.description,
        descriptionEn: alert.descriptionEn,
        date: dateId,
        read: false,
        createdAt: new Date(),
      });

      await sendPushToAllParents(parents, null, {
        titleFn: alert.pushTitleFn,
        bodyFn: alert.pushBodyFn,
        data: { type: "behaviorAlert", familyId, childUid },
      });
    }
  }
);
