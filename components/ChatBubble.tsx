import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import type { ChatMessage } from '../types';

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDateDivider(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return '今天';
  return d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' });
}

interface ChatBubbleProps {
  message: ChatMessage;
  showDateDivider?: boolean;
}

export function ChatBubble({ message, showDateDivider }: ChatBubbleProps) {
  const isUser = message.role === 'user';
  return (
    <View>
      {showDateDivider && (
        <View style={styles.dateDividerRow}>
          <Text style={styles.dateDividerText}>{formatDateDivider(message.created_at)}</Text>
        </View>
      )}
      <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
        <View style={isUser ? styles.columnUser : styles.columnAssistant}>
          {message.image_url && <Image source={{ uri: message.image_url }} style={styles.image} />}
          {!!message.content && (
            <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
              <Text style={[styles.text, isUser && styles.textUser]}>{message.content}</Text>
            </View>
          )}
          <Text style={[styles.time, isUser ? styles.timeUser : styles.timeAssistant]}>
            {formatTime(message.created_at)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dateDividerRow: {
    alignItems: 'center',
    marginVertical: spacing.sm,
  },
  dateDividerText: {
    fontSize: fontSize.tiny,
    color: colors.textMuted,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.widget,
  },
  row: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    flexDirection: 'row',
  },
  rowUser: { justifyContent: 'flex-end' },
  rowAssistant: { justifyContent: 'flex-start' },
  columnUser: { maxWidth: '80%', alignItems: 'flex-end' },
  columnAssistant: { maxWidth: '80%', alignItems: 'flex-start' },
  image: {
    width: 180,
    height: 180,
    borderRadius: radius.card,
    marginBottom: 4,
  },
  bubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.card,
  },
  bubbleUser: {
    backgroundColor: colors.purpleLight,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: colors.card,
    borderBottomLeftRadius: 4,
  },
  text: {
    fontSize: fontSize.body,
    color: colors.textPrimary,
    lineHeight: 19,
  },
  textUser: {
    color: colors.textPrimary,
  },
  time: {
    fontSize: fontSize.tiny,
    color: colors.textMuted,
    marginTop: 3,
    includeFontPadding: false,
  },
  timeUser: { marginRight: 2 },
  timeAssistant: { marginLeft: 2 },
});
