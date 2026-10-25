import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useSegments } from 'expo-router';
import { colors, fontSize, spacing } from '../../constants/theme';

// 页面自己的标题。从「其他」里点进来时（路由在 other 栈里）左边带个返回，免得和系统标题栏重复显示两遍。

export function PageTitle({ title, right }: { title: string; right?: ReactNode }) {
  const segments = useSegments() as string[];
  const inOther = segments.includes('other');
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        {inOther ? (
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.push('/other'))} hitSlop={12} testID="page-back">
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
