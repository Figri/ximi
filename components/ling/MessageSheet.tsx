import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { room } from '../../constants/room';
import { KIND_LABEL } from '../../lib/ling/templates';
import type { LingMessage } from '../../lib/ling/thread';

// 长按灵的一条消息：看为什么发、标判词。点外面就关。

export const FEEDBACK_TAGS = ['套话', '死板', '你又重置了', '不像人'] as const;

interface Props {
  message: LingMessage | null;
  onClose: () => void;
  onFeedback: (message: LingMessage, tag: string | null) => void;
}

export function MessageSheet({ message, onClose, onFeedback }: Props) {
  const insets = useSafeAreaInsets();
  if (!message) return null;
  const kindLabel = message.kind in KIND_LABEL ? KIND_LABEL[message.kind as keyof typeof KIND_LABEL] : null;
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} testID="sheet-backdrop">
        <Pressable style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]} onPress={() => {}}>
          <Text style={styles.quote} numberOfLines={3}>
            {message.content}
          </Text>
          {message.trigger ? (
            <View style={styles.whyBox}>
              <Text style={styles.whyLabel}>{kindLabel ? `${kindLabel} · 为什么发这条` : '为什么发这条'}</Text>
              <Text style={styles.whyText}>{message.trigger}</Text>
              {message.fallback ? <Text style={styles.whyHint}>这条是备用文案（当时没接上大脑）</Text> : null}
            </View>
          ) : null}
          <Text style={styles.label}>这句哪里不对？标一下，下一条就换说法</Text>
          <View style={styles.tags}>
            {FEEDBACK_TAGS.map((tag) => {
              const on = message.feedback === tag;
              return (
                <Pressable
                  key={tag}
                  style={[styles.tag, on && styles.tagOn]}
                  onPress={() => onFeedback(message, on ? null : tag)}
                >
                  <Text style={[styles.tagText, on && styles.tagTextOn]}>{tag}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable style={styles.close} onPress={onClose}>
            <Text style={styles.closeText}>好</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: room.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 18,
    gap: 12,
  },
  quote: { color: room.ink2, fontSize: 13, lineHeight: 19 },
  whyBox: { backgroundColor: room.inset, borderRadius: 12, padding: 12, gap: 4 },
  whyLabel: { color: room.ink3, fontSize: 11 },
  whyText: { color: room.ink, fontSize: 14 },
  whyHint: { color: room.ink3, fontSize: 11 },
  label: { color: room.ink3, fontSize: 12 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { borderWidth: 1, borderColor: room.accent, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  tagOn: { backgroundColor: room.accent },
  tagText: { color: room.accent, fontSize: 13 },
  tagTextOn: { color: room.bg, fontWeight: '700' },
  close: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: room.inset },
  closeText: { color: room.ink, fontSize: 14 },
});
