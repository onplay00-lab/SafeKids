import { useEffect, useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Modal,
} from 'react-native';
import { collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { useTranslation } from 'react-i18next';
import { db } from '../constants/firebase';
import { Colors } from '../constants/Colors';
import { useAuth } from '../contexts/AuthContext';

const STICKERS = [
  { id: 'love', emoji: '❤️' },
  { id: 'thumbsup', emoji: '👍' },
  { id: 'laugh', emoji: '😂' },
  { id: 'hug', emoji: '🤗' },
  { id: 'star', emoji: '⭐' },
  { id: 'home', emoji: '🏠' },
  { id: 'food', emoji: '🍕' },
  { id: 'sleep', emoji: '😴' },
  { id: 'study', emoji: '📚' },
  { id: 'play', emoji: '⚽' },
  { id: 'sorry', emoji: '🙏' },
  { id: 'ok', emoji: '👌' },
  { id: 'miss', emoji: '🥺' },
  { id: 'angry', emoji: '😤' },
  { id: 'happy', emoji: '😊' },
  { id: 'cry', emoji: '😢' },
];

export default function FamilyChat() {
  const { user, familyId, role } = useAuth();
  const { t } = useTranslation();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [playingId, setPlayingId] = useState(null);
  const [senderName, setSenderName] = useState(user?.displayName || user?.email?.split('@')[0] || (role === 'parent' ? t('common.parent') : t('common.child')));
  const [memberNames, setMemberNames] = useState({}); // uid → 최신 이름 맵
  const flatListRef = useRef(null);
  const soundRef = useRef(null);
  const recordTimerRef = useRef(null);

  // 가족 멤버 이름 맵 로드 (childNames + 부모 이름)
  useEffect(() => {
    if (!familyId || !user) return;
    (async () => {
      try {
        const famDoc = await getDoc(doc(db, 'families', familyId));
        if (!famDoc.exists()) return;
        const famData = famDoc.data();
        const names = {};
        // 자녀 이름: childNames 맵 우선
        const childNames = famData.childNames || {};
        for (const [uid, name] of Object.entries(childNames)) {
          names[uid] = name;
        }
        // 부모 이름
        const parentIds = famData.parentIds || [];
        for (const pid of parentIds) {
          try {
            const pDoc = await getDoc(doc(db, 'users', pid));
            if (pDoc.exists()) {
              names[pid] = pDoc.data().name || pDoc.data().email?.split('@')[0] || t('common.parent');
            }
          } catch {}
        }
        // 자녀 중 childNames에 없는 경우 users에서 가져오기
        for (const cuid of (famData.children || [])) {
          if (!names[cuid]) {
            try {
              const cDoc = await getDoc(doc(db, 'users', cuid));
              if (cDoc.exists()) {
                names[cuid] = cDoc.data().name || cDoc.data().email?.split('@')[0] || t('common.child');
              }
            } catch {}
          }
        }
        setMemberNames(names);
        // 내 이름 설정
        if (names[user.uid]) setSenderName(names[user.uid]);
      } catch {}
    })();
  }, [familyId, user]);

  function getStickerLabel(id) {
    return t(`chat.sticker.${id}`);
  }

  useEffect(() => {
    if (!familyId) return;
    const q = query(
      collection(db, 'families', familyId, 'chat'),
      orderBy('createdAt', 'desc'),
      limit(100)
    );
    const unsub = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse();
      setMessages(msgs);
    }, (err) => {
      console.error('채팅 구독 오류:', err);
    });
    return unsub;
  }, [familyId]);

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
      }
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    };
  }, []);

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || sending || !familyId) return;
    setSending(true);
    setText('');
    setShowStickers(false);
    try {
      await addDoc(collection(db, 'families', familyId, 'chat'), {
        senderUid: user.uid,
        senderName,
        senderRole: role,
        type: 'text',
        text: trimmed,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.error('메시지 전송 실패:', e);
    }
    setSending(false);
  }

  async function handleSendSticker(sticker) {
    if (sending || !familyId) return;
    setSending(true);
    setShowStickers(false);
    try {
      await addDoc(collection(db, 'families', familyId, 'chat'), {
        senderUid: user.uid,
        senderName,
        senderRole: role,
        type: 'sticker',
        stickerId: sticker.id,
        stickerEmoji: sticker.emoji,
        stickerLabel: getStickerLabel(sticker.id),
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.error('스티커 전송 실패:', e);
    }
    setSending(false);
  }

  async function handleStartRecording() {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) return;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(rec);
      setIsRecording(true);
      setRecordDuration(0);

      recordTimerRef.current = setInterval(() => {
        setRecordDuration(prev => prev + 1);
      }, 1000);
    } catch (e) {
      console.error('녹음 시작 실패:', e);
    }
  }

  async function handleStopRecording() {
    if (!recording) return;
    clearInterval(recordTimerRef.current);
    setIsRecording(false);

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (!uri || recordDuration < 1) return;

      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      setSending(true);
      await addDoc(collection(db, 'families', familyId, 'chat'), {
        senderUid: user.uid,
        senderName,
        senderRole: role,
        type: 'voice',
        voiceBase64: base64,
        voiceDuration: recordDuration,
        createdAt: serverTimestamp(),
      });
      setSending(false);

      try { await FileSystem.deleteAsync(uri); } catch {}
    } catch (e) {
      console.error('녹음 저장 실패:', e);
      setRecording(null);
      setSending(false);
    }
  }

  async function handleCancelRecording() {
    if (!recording) return;
    clearInterval(recordTimerRef.current);
    setIsRecording(false);
    try {
      await recording.stopAndUnloadAsync();
    } catch {}
    setRecording(null);
    setRecordDuration(0);
  }

  async function handlePlayVoice(item) {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
        if (playingId === item.id) {
          setPlayingId(null);
          return;
        }
      }

      setPlayingId(item.id);

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const tempUri = FileSystem.cacheDirectory + `voice_${item.id}.m4a`;
      await FileSystem.writeAsStringAsync(tempUri, item.voiceBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const { sound } = await Audio.Sound.createAsync({ uri: tempUri });
      soundRef.current = sound;

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          setPlayingId(null);
          sound.unloadAsync().catch(() => {});
          soundRef.current = null;
        }
      });

      await sound.playAsync();
    } catch (e) {
      console.error('재생 실패:', e);
      setPlayingId(null);
    }
  }

  function formatTime(ts) {
    if (!ts?.toDate) return '';
    const d = ts.toDate();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function formatDuration(sec) {
    const m = Math.floor(sec / 60);
    const s2 = sec % 60;
    return `${m}:${String(s2).padStart(2, '0')}`;
  }

  function getDisplayName(item) {
    return memberNames[item.senderUid] || item.senderName || (item.senderRole === 'parent' ? t('common.parent') : t('common.child'));
  }

  function renderMessage({ item }) {
    const isMe = item.senderUid === user?.uid;

    if (item.type === 'sticker') {
      return (
        <View style={[s.msgRow, isMe && s.msgRowMe]}>
          {!isMe && (
            <View style={[s.msgAvatar, item.senderRole === 'parent' ? s.avatarParent : s.avatarChild]}>
              <Text style={s.msgAvatarText}>{item.senderRole === 'parent' ? 'P' : 'C'}</Text>
            </View>
          )}
          <View style={s.msgContent}>
            {!isMe && <Text style={s.msgSender}>{getDisplayName(item)}</Text>}
            <View style={s.stickerBubble}>
              <Text style={s.stickerEmoji}>{item.stickerEmoji}</Text>
              <Text style={s.stickerLabel}>{getStickerLabel(item.stickerId) || item.stickerLabel}</Text>
            </View>
            <Text style={[s.msgTime, isMe && s.msgTimeMe]}>{formatTime(item.createdAt)}</Text>
          </View>
        </View>
      );
    }

    if (item.type === 'voice') {
      const isPlaying = playingId === item.id;
      return (
        <View style={[s.msgRow, isMe && s.msgRowMe]}>
          {!isMe && (
            <View style={[s.msgAvatar, item.senderRole === 'parent' ? s.avatarParent : s.avatarChild]}>
              <Text style={s.msgAvatarText}>{item.senderRole === 'parent' ? 'P' : 'C'}</Text>
            </View>
          )}
          <View style={s.msgContent}>
            {!isMe && <Text style={s.msgSender}>{getDisplayName(item)}</Text>}
            <TouchableOpacity
              style={[s.voiceBubble, isMe ? s.bubbleMe : s.bubbleOther]}
              onPress={() => handlePlayVoice(item)}
            >
              <Text style={s.voiceIcon}>{isPlaying ? '⏸' : '▶️'}</Text>
              <View style={s.voiceWave}>
                {[...Array(8)].map((_, i) => (
                  <View
                    key={i}
                    style={[
                      s.voiceBar,
                      { height: 4 + Math.random() * 14, backgroundColor: isMe ? 'rgba(255,255,255,0.6)' : Colors.primaryMid },
                    ]}
                  />
                ))}
              </View>
              <Text style={[s.voiceDuration, isMe && { color: 'rgba(255,255,255,0.8)' }]}>
                {formatDuration(item.voiceDuration || 0)}
              </Text>
            </TouchableOpacity>
            <Text style={[s.msgTime, isMe && s.msgTimeMe]}>{formatTime(item.createdAt)}</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={[s.msgRow, isMe && s.msgRowMe]}>
        {!isMe && (
          <View style={[s.msgAvatar, item.senderRole === 'parent' ? s.avatarParent : s.avatarChild]}>
            <Text style={s.msgAvatarText}>{item.senderRole === 'parent' ? 'P' : 'C'}</Text>
          </View>
        )}
        <View style={s.msgContent}>
          {!isMe && <Text style={s.msgSender}>{getDisplayName(item)}</Text>}
          <View style={[s.msgBubble, isMe ? s.bubbleMe : s.bubbleOther]}>
            <Text style={[s.msgText, isMe && s.msgTextMe]}>{item.text}</Text>
          </View>
          <Text style={[s.msgTime, isMe && s.msgTimeMe]}>{formatTime(item.createdAt)}</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.listContent}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
      />

      {showStickers && (
        <View style={s.stickerPanel}>
          {STICKERS.map((st) => (
            <TouchableOpacity key={st.id} style={s.stickerItem} onPress={() => handleSendSticker(st)}>
              <Text style={s.stickerItemEmoji}>{st.emoji}</Text>
              <Text style={s.stickerItemLabel}>{getStickerLabel(st.id)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {isRecording && (
        <View style={s.recordingBar}>
          <View style={s.recordingDot} />
          <Text style={s.recordingText}>{t('chat.recording', { duration: formatDuration(recordDuration) })}</Text>
          <TouchableOpacity style={s.recordCancelBtn} onPress={handleCancelRecording}>
            <Text style={s.recordCancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.recordStopBtn} onPress={handleStopRecording}>
            <Text style={s.recordStopText}>{t('common.send')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {!isRecording && (
        <View style={s.inputRow}>
          <TouchableOpacity
            style={s.iconBtn}
            onPress={() => setShowStickers(!showStickers)}
          >
            <Text style={s.iconBtnText}>{showStickers ? '⌨️' : '😊'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.iconBtn}
            onPress={handleStartRecording}
          >
            <Text style={s.iconBtnText}>🎤</Text>
          </TouchableOpacity>

          <TextInput
            style={s.input}
            value={text}
            onChangeText={(t2) => { setText(t2); if (showStickers) setShowStickers(false); }}
            placeholder={t('chat.placeholder')}
            placeholderTextColor={Colors.textHint}
            multiline
            maxLength={500}
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[s.sendBtn, (!text.trim() || sending) && s.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!text.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Text style={s.sendBtnText}>{t('common.send')}</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  listContent: { padding: 16, paddingBottom: 8 },
  msgRow: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end' },
  msgRowMe: { flexDirection: 'row-reverse' },
  msgAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  avatarParent: { backgroundColor: Colors.primaryLight },
  avatarChild: { backgroundColor: '#FAECE7' },
  msgAvatarText: { fontSize: 11, fontWeight: '600', color: Colors.primary },
  msgContent: { maxWidth: '75%' },
  msgSender: { fontSize: 11, color: Colors.textSecondary, marginBottom: 2 },
  msgBubble: { borderRadius: 16, padding: 10, paddingHorizontal: 14 },
  bubbleMe: { backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: Colors.bg, borderBottomLeftRadius: 4 },
  msgText: { fontSize: 14, color: Colors.textPrimary, lineHeight: 20 },
  msgTextMe: { color: Colors.white },
  msgTime: { fontSize: 10, color: Colors.textHint, marginTop: 2 },
  msgTimeMe: { textAlign: 'right' },

  inputRow: { flexDirection: 'row', alignItems: 'flex-end', padding: 8, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: Colors.border, backgroundColor: Colors.white },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  iconBtnText: { fontSize: 20 },
  input: { flex: 1, backgroundColor: Colors.bg, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14, color: Colors.textPrimary, maxHeight: 100 },
  sendBtn: { backgroundColor: Colors.primary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, marginLeft: 6 },
  sendBtnDisabled: { backgroundColor: Colors.border },
  sendBtnText: { fontSize: 14, fontWeight: '600', color: Colors.white },

  stickerPanel: { flexDirection: 'row', flexWrap: 'wrap', padding: 8, backgroundColor: Colors.bg, borderTopWidth: 0.5, borderTopColor: Colors.border },
  stickerItem: { width: '25%', alignItems: 'center', paddingVertical: 10 },
  stickerItemEmoji: { fontSize: 28 },
  stickerItemLabel: { fontSize: 10, color: Colors.textSecondary, marginTop: 2 },
  stickerBubble: { alignItems: 'center', paddingVertical: 4 },
  stickerEmoji: { fontSize: 48 },
  stickerLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },

  voiceBubble: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 10, paddingHorizontal: 14, gap: 8, minWidth: 160 },
  voiceIcon: { fontSize: 18 },
  voiceWave: { flexDirection: 'row', alignItems: 'center', gap: 2, flex: 1 },
  voiceBar: { width: 3, borderRadius: 2 },
  voiceDuration: { fontSize: 12, color: Colors.textSecondary },

  recordingBar: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#FCEBEB', borderTopWidth: 0.5, borderTopColor: '#F09595' },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#E53935', marginRight: 8 },
  recordingText: { flex: 1, fontSize: 14, fontWeight: '500', color: '#E53935' },
  recordCancelBtn: { paddingHorizontal: 14, paddingVertical: 8 },
  recordCancelText: { fontSize: 14, color: Colors.textSecondary },
  recordStopBtn: { backgroundColor: Colors.primary, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  recordStopText: { fontSize: 14, fontWeight: '600', color: Colors.white },
});
