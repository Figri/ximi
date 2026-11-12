import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { OAuthAuthorizationDetails } from '@supabase/supabase-js';
import { osCloud } from '../lib/osCloud';
import { colors, radius, spacing } from '../constants/theme';

// Supabase OAuth Server's authorization path, hosted as part of the web export.
// It uses the provider's own consent SDK; it never mints or shares a service key.
export default function OsConsent() {
  const params = useLocalSearchParams<{ authorization_id?: string }>();
  const id = typeof params.authorization_id === 'string' ? params.authorization_id : '';
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [login, setLogin] = useState(false);
  useEffect(() => {
    let active = true;
    async function load() {
      if (Platform.OS !== 'web') throw new Error('请在浏览器中完成工具授权');
      if (!id) throw new Error('缺少授权请求，请从 ChatGPT 重新发起连接');
      const cloud = osCloud();
      const { data: { user } } = await cloud.auth.getUser();
      if (!active) return;
      if (!user) { setLogin(true); return; }
      const { data, error } = await cloud.auth.oauth.getAuthorizationDetails(id);
      if (!active) return;
      if (error) throw error;
      if ('redirect_url' in data) { window.location.assign(data.redirect_url); return; }
      setDetails(data);
    }
    load().catch((e) => { if (active) setMessage(e.message); });
    return () => { active = false; };
  }, [id]);
  async function decide(approve: boolean) {
    if (!details || busy) return;
    setBusy(true); setMessage('');
    try {
      const auth = osCloud().auth.oauth;
      const { error } = approve ? await auth.approveAuthorization(id) : await auth.denyAuthorization(id);
      if (error) throw error;
    } catch (e) { setMessage(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  return <SafeAreaView style={s.page}><ScrollView contentContainerStyle={s.body}>
    <Text style={s.title}>授权访问西米OS</Text>
    {login ? <Pressable testID="consent-login" onPress={() => router.replace({ pathname: '/os-connect', params: { authorization_id: id } })}><Text style={s.link}>先登录西米OS账号</Text></Pressable> : null}
    {details ? <>
      <Text style={s.text}>{details.client.name} 正在请求访问 {details.user.email} 的西米OS数据。</Text>
      <Text style={s.text}>连接后可读取随心记、复盘和记录上下文，并在你确认后写入随心记及复盘。只连接你信任的应用。</Text>
      <Text style={s.text}>请求范围：{details.scope || '西米OS记录读写'}</Text>
      <Text selectable style={s.text}>返回地址：{details.redirect_uri}</Text>
      <Pressable testID="consent-approve" disabled={busy} style={s.button} onPress={() => decide(true)}><Text style={s.white}>允许访问</Text></Pressable>
      <Pressable testID="consent-deny" disabled={busy} onPress={() => decide(false)}><Text style={s.link}>拒绝</Text></Pressable>
    </> : null}
    {message ? <Text testID="consent-message" style={s.text}>{message}</Text> : null}
  </ScrollView></SafeAreaView>;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background }, body: { padding: spacing.lg, gap: spacing.lg },
  title: { fontSize: 24, fontWeight: '700', color: colors.textPrimary }, text: { fontSize: 15, lineHeight: 24, color: colors.textPrimary },
  button: { backgroundColor: colors.purpleDark, borderRadius: radius.widget, padding: 14, alignItems: 'center' },
  white: { color: '#fff', fontSize: 16 }, link: { color: colors.purpleDark, fontSize: 16 },
});
