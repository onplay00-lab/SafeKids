import { useEffect, useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../constants/firebase';
import { Colors } from '../constants/Colors';
import { useAuth } from '../contexts/AuthContext';

export default function FamilyChat() {
  const { user, familyId, role } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const flatListRef = useRef(null);

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
    });
    return unsub;
  }, [familyId]);

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || sending || !familyId) return;
    setSending(true);
    setText('');
    try {
      await addDoc(collection(db, 'families', familyId, 'chat'), {
        senderUid: user.uid,
        senderName,
        senderRole: role,
        text: trimmed,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.error('메시지 전송 실패:', e);
    }
    setSending(false);
  }

  function formatTime(ts) {
    if (!ts?.toDate) return '';
    const d = ts.toDate();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function renderMessage({ item }) {
    const isMe = item.senderUid === user?.uid;
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
      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          value={text}
          onChangeText={setText}
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
          <Text style={s.sendBtnText}>전송</Text>
        </TouchableOpacity>
      </View>
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
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: Colors.border, backgroundColor: Colors.white },
  input: { flex: 1, backgroundColor: Colors.bg, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, fontSize: 14, color: Colors.textPrimary, maxHeight: 100 },
  sendBtn: { backgroundColor: Colors.primary, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, marginLeft: 8 },
  sendBtnDisabled: { backgroundColor: Colors.border },
  sendBtnText: { fontSize: 14, fontWeight: '600', color: Colors.white },
});
