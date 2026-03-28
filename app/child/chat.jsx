import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import FamilyChat from '../../components/FamilyChat';

export default function ChildChat() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.container, { paddingTop: insets.top + 10 }]}>
      <Text style={s.title}>가족 채팅</Text>
      <FamilyChat />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  title: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, paddingHorizontal: 20, paddingBottom: 8 },
});
