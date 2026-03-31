import { useEffect, useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Modal,
} from 'react-native';
import { collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { db } from '../constants/firebase';
import { Colors } from '../constants/Colors';
import { useAuth } from '../contexts/AuthContext';

const STICKERS = [
  { id: 'love', emoji: '❤️', label: '사랑해' },
  { id: 'thumbsup', emoji: '👍', label: '좋아요' },
  { id: 'laugh', emoji: '😂', label: '웃겨' },
  { id: 'hug', emoji: '🤗', label: '안아줘' },
  { id: 'star', emoji: '⭐', label: '최고' },
  { id: 'home', emoji: '🏠', label: '집에 갈게' },
  { id: 'food', emoji: '🍕', label: '배고파' },
  { id: 'sleep', emoji: '😴', label: '졸려' },
  { id: 'study', emoji: '📚', label: '공부중' },
  { id: 'play', emoji: '⚽', label: '놀자' },
  { id: 'sorry', emoji: '🙏', label: '미안해' },
  { id: 'ok', emoji: '👌', label: '알겠어' },
  { id: 'miss', emoji: '🥺', label: '보고싶어' },
  { id: 'angry', emoji: '😤', label: '화나' },
  { id: 'happy', emoji: '😊', label: '행복해' },
  { id: 'cry', emoji: '😢', label: '슬퍼' },
];

export default function FamilyChat() {
  const { user, familyId, role } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [playingId, setPlayingId] = useState(null);
  const flatListRef = useRef(null);
  const soundRef = useRef(null);
  const recordTimerRef = useRef(null);

  const senderName = user?.displayName || user?.email?.split('@')[0] || (role === 'parent' ? '부모' : '자녀');

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

  // Cleanup sound on unmount
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
        stickerLabel: sticker.label,
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

      // Read the audio file as base64
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

      // Clean up temp file
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
      // Stop any currently playing audio
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

      // Write base64 to temp file and play
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
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function renderMessage({ item }) {
    const isMe = item.senderUid === user?.uid;

    // Sticker message
    if (item.type === 'sticker') {
      return (
        <View style={[s.msgRow, isMe && s.msgRowMe]}>
          {!isMe && (
            <View style={[s.msgAvatar, item.senderRole === 'parent' ? s.avatarParent : s.avatarChild]}>
              <Text style={s.msgAvatarText}>{item.senderRole === 'parent' ? 'P' : 'C'}</Text>
            </View>
          )}
          <View style={s.msgContent}>
            {!isMe && <Text style={s.msgSender}>{item.senderName}</Text>}
            <View style={s.stickerBubble}>
              <Text style={s.stickerEmoji}>{item.stickerEmoji}</Text>
              <Text style={s.stickerLabel}>{item.stickerLabel}</Text>
            </View>
            <Text style={[s.msgTime, isMe && s.msgTimeMe]}>{formatTime(item.createdAt)}</Text>
          </View>
        </View>
      );
    }

    // Voice message
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
            {!isMe && <Text style={s.msgSender}>{item.senderName}</Text>}
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

    // Text message (default)
    return (
      <View style={[s.msgRow, isMe && s.msgRowMe]}>
        {!isMe && (
          <View style={[s.msgAvatar, item.senderRole === 'parent' ? s.avatarParent : s.avatarChild]}>
            <Text style={s.msgAvatarText}>{item.senderRole === 'parent' ? 'P' : 'C'}</Text>
          </View>
        )}
        <View style={s.msgContent}>
          {!isMe && <Text style={s.msgSender}>{item.senderName}</Text>}
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
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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

      {/* Sticker Panel */}
      {showStickers && (
        <View style={s.stickerPanel}>
          {STICKERS.map((st) => (
            <TouchableOpacity key={st.id} style={s.stickerItem} onPress={() => handleSendSticker(st)}>
              <Text style={s.stickerItemEmoji}>{st.emoji}</Text>
              <Text style={s.stickerItemLabel}>{st.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Recording UI */}
      {isRecording && (
        <View style={s.recordingBar}>
          <View style={s.recordingDot} />
          <Text style={s.recordingText}>녹음 중 {formatDuration(recordDuration)}</Text>
          <TouchableOpacity style={s.recordCancelBtn} onPress={handleCancelRecording}>
            <Text style={s.recordCancelText}>취소</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.recordStopBtn} onPress={handleStopRecording}>
            <Text style={s.recordStopText}>전송</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Input Row */}
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
            onChangeText={(t) => { setText(t); if (showStickers) setShowStickers(false); }}
            placeholder="메시지를 입력하세요"
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
              <Text style={s.sendBtnText}>전송</Text>
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

  // Input
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', padding: 8, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: Colors.border, backgroundColor: Colors.white },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  iconBtnText: { fontSize: 20 },
  input: { flex: 1, backgroundColor: Colors.bg, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14, color: Colors.textPrimary, maxHeight: 100 },
  sendBtn: { backgroundColor: Colors.primary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, marginLeft: 6 },
  sendBtnDisabled: { backgroundColor: Colors.border },
  sendBtnText: { fontSize: 14, fontWeight: '600', color: Colors.white },

  // Sticker
  stickerPanel: { flexDirection: 'row', flexWrap: 'wrap', padding: 8, backgroundColor: Colors.bg, borderTopWidth: 0.5, borderTopColor: Colors.border },
  stickerItem: { width: '25%', alignItems: 'center', paddingVertical: 10 },
  stickerItemEmoji: { fontSize: 28 },
  stickerItemLabel: { fontSize: 10, color: Colors.textSecondary, marginTop: 2 },
  stickerBubble: { alignItems: 'center', paddingVertical: 4 },
  stickerEmoji: { fontSize: 48 },
  stickerLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },

  // Voice
  voiceBubble: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 10, paddingHorizontal: 14, gap: 8, minWidth: 160 },
  voiceIcon: { fontSize: 18 },
  voiceWave: { flexDirection: 'row', alignItems: 'center', gap: 2, flex: 1 },
  voiceBar: { width: 3, borderRadius: 2 },
  voiceDuration: { fontSize: 12, color: Colors.textSecondary },

  // Recording
  recordingBar: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#FCEBEB', borderTopWidth: 0.5, borderTopColor: '#F09595' },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#E53935', marginRight: 8 },
  recordingText: { flex: 1, fontSize: 14, fontWeight: '500', color: '#E53935' },
  recordCancelBtn: { paddingHorizontal: 14, paddingVertical: 8 },
  recordCancelText: { fontSize: 14, color: Colors.textSecondary },
  recordStopBtn: { backgroundColor: Colors.primary, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  recordStopText: { fontSize: 14, fontWeight: '600', color: Colors.white },
});
