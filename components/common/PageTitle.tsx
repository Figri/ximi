import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useSegments } from 'expo-router';
import { colors, fontSize, spacing } from '../../constants/theme';

// 页面自己的标题。从「其他」里点进来（other 栈）或者从别的页面单独打开（app/page/...）时左边带个返回，
// 免得和系统标题栏重复显示两遍。

/** 这一页是不是从别处推进来的（不是底栏上的那一栏）：要显示返回 */
export function usePushedPage(): boolean {
  const segments = useSegments() as string[];
  return segments.includes('other') || segments[0] === 'page';
}

export function PageTitle({ title, right }: { title: string; right?: ReactNode }) {
  const pushed = usePushedPage();
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        {pushed ? (
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12} testID="page-back">
            <Text style={styles.back}>‹</Text>
          </Pressable>
        ) : null}
        <Text style={styles.title}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.sm },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  back: { fontSize: 26, lineHeight: 28, color: colors.purpleDark, marginTop: -2 },
  title: { fontSize: fontSize.pageTitle, fontWeight: '700', color: colors.textPrimary },
});
