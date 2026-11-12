import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../constants/theme';
import { osCloud } from '../lib/osCloud';
import { completeOsLogin, sendOsLoginEmail } from '../lib/osLogin';
import { enableOsSync, syncOs, syncStatus } from '../lib/osSync';

export default function OsConnect() {
  const { authorization_id } = useLocalSearchParams<{ authorization_id?: string }>();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [account, setAccount] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState('尚未同步');
  async function refresh() {
    const s = await syncStatus();
    setLast(s.error || (s.lastSuccess ? `最近同步：${new Date(s.lastSuccess).toLocaleString()}` : '尚未同步'));
    const { data } = await osCloud().auth.getUser();
    setAccount(data.user?.email ?? '');
  }
  useEffect(() => { refresh().catch((e) => setMessage(e.message)); }, []);
  async function act(action: () => Promise<void>) {
    setBusy(true); setMessage('');
    try { await action(); await refresh(); } catch (e) { setMessage(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  const button = (title: string, id: string, action: () => Promise<void>) => (
    <Pressable testID={id} disabled={busy} style={[s.button, busy && { opacity: 0.5 }]} onPress={() => act(action)}><Text style={s.buttonText}>{title}</Text></Pressable>
  );
  return <SafeAreaView style={s.page}><ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
    <Pressable onPress={() => router.back()}><Text style={s.link}>‹ 返回</Text></Pressable>
    <Text style={s.title}>西米OS云端连接</Text>
    <View style={s.card}>
      <Text style={s.text}>登录后开启同步，随心记和复盘可在云端读写；时间、习惯、情绪和事项会上传供复盘查询。首次开启前自动保留本地备份。</Text>
      <Text style={s.text}>ChatGPT 需要另行连接并授权西米OS工具。这里登录成功不代表 ChatGPT 已连通。</Text>
    </View>
    <View style={s.card}>
      {account ? <Text style={s.text}>已登录：{account}</Text> : <>
        <Text style={s.note}>首次使用会创建你的云端账号，验证邮箱后才能同步。</Text>
        <TextInput testID="cloud-email" style={s.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="云端账号邮箱" />
        {button('发送登录邮件', 'cloud-send-code', async () => {
          await sendOsLoginEmail(osCloud().auth, email);
          setMessage('登录邮件已发送。邮件只有蓝色按钮时，请复制按钮的链接地址，粘贴到下面。');
        })}
        <Text style={s.note}>邮件链接打不开也可以登录：长按邮件中的蓝色确认或登录按钮，选择「复制链接地址」，回到这里粘贴。电脑上用鼠标右键复制链接。</Text>
        <TextInput testID="cloud-code" style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]} value={code} onChangeText={setCode} multiline autoCapitalize="none" autoCorrect={false} placeholder="粘贴验证码或邮件里的完整链接" />
        <Text style={s.note}>如果已经点过邮件按钮、打开的是无法访问的 localhost 页面，也可以复制浏览器地址栏的完整地址到这里。登录链接只粘贴在 App 内。</Text>
        {button('登录', 'cloud-login', async () => {
          await completeOsLogin(osCloud().auth, email, code, process.env.EXPO_PUBLIC_SUPABASE_URL ?? '');
          setCode('');
          setMessage('登录成功，可以点「开启同步」');
          if (typeof authorization_id === 'string') router.replace({ pathname: '/os-consent', params: { authorization_id } });
        })}
      </>}
      {account ? <>
        {button('开启同步', 'cloud-enable', async () => { await enableOsSync(); setMessage('本轮云端同步成功'); })}
        {button('立即同步', 'cloud-sync', async () => { await syncOs(); setMessage('本轮云端同步成功'); })}
        {button('退出登录', 'cloud-logout', async () => { const { error } = await osCloud().auth.signOut(); if (error) throw error; setAccount(''); })}
      </> : null}
      <Text testID="cloud-status" style={s.text}>{last}</Text>
      {message ? <Text testID="cloud-message" style={s.text}>{message}</Text> : null}
      {busy ? <Text style={s.text}>正在处理…</Text> : null}
    </View>
    <Text style={s.note}>当前版本不会自动读取 ChatGPT 历史聊天或内部记忆。你在聊天中确认的内容，须由已授权工具明确写回。Notion自动归档将在后续阶段接入。</Text>
  </ScrollView></SafeAreaView>;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background }, body: { padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 24, fontWeight: '700', color: colors.textPrimary }, link: { color: colors.purpleDark, fontSize: 16 },
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.md, gap: spacing.md },
  text: { color: colors.textPrimary, fontSize: 15, lineHeight: 23 }, note: { color: colors.textSecondary, fontSize: 13, lineHeight: 21 },
  input: { backgroundColor: colors.background, padding: 12, borderRadius: radius.widget, color: colors.textPrimary },
  button: { padding: 12, borderRadius: radius.widget, backgroundColor: colors.purpleDark, alignItems: 'center' }, buttonText: { color: '#fff', fontSize: 15 },
});
