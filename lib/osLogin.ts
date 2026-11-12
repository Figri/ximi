import type { SupabaseClient } from '@supabase/supabase-js';

type EmailLinkType = 'email' | 'signup' | 'magiclink';
export type OsLoginInput =
  | { kind: 'code'; token: string }
  | { kind: 'confirmation'; tokenHash: string; type: EmailLinkType }
  | { kind: 'session'; accessToken: string; refreshToken: string };

/** Parse locally. Never open a pasted URL, log it, or send it to another host. */
export function parseOsLoginInput(input: string, projectUrl: string): OsLoginInput {
  const text = input.trim();
  const compact = text.replace(/\s/g, '');
  if (/^\d{6,10}$/.test(compact)) return { kind: 'code', token: compact };
  if (!text) throw new Error('请粘贴邮件里的验证码或确认链接');
  let url: URL;
  let project: URL;
  try { url = new URL(text); project = new URL(projectUrl); }
  catch { throw new Error('请复制邮件按钮的完整链接地址，或填写数字验证码'); }
  const onProject = url.protocol === 'https:' && url.origin === project.origin;
  const onCallback = (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
    || (url.protocol === 'ximios:' && url.hostname === 'os-connect');
  if (url.username || url.password || (!onProject && !onCallback)) {
    throw new Error('这不是西米OS的登录链接，请复制最新登录邮件中的链接');
  }
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));
  if (fragment.has('error') || url.searchParams.has('error')) {
    throw new Error('这个登录链接已失效，请重新发送登录邮件');
  }
  // A successful email verification can redirect to the project's default
  // localhost page. The page cannot load on a phone, but its returned session
  // can still be validated and saved by the existing Supabase SDK.
  const accessToken = fragment.get('access_token');
  const refreshToken = fragment.get('refresh_token');
  if (accessToken && refreshToken && (onCallback || onProject)) {
    return { kind: 'session', accessToken, refreshToken };
  }
  if (onProject && url.pathname.replace(/\/$/, '') === '/auth/v1/verify') {
    const tokenHash = url.searchParams.get('token') || url.searchParams.get('token_hash');
    const type = url.searchParams.get('type') ?? 'email';
    if (tokenHash && ['email', 'signup', 'magiclink'].includes(type)) {
      return { kind: 'confirmation', tokenHash, type: type as EmailLinkType };
    }
  }
  throw new Error('链接里没有登录凭据，请复制邮件中蓝色按钮的链接地址');
}

export async function completeOsLogin(
  auth: Pick<SupabaseClient['auth'], 'verifyOtp' | 'setSession'>,
  email: string, input: string, projectUrl: string,
): Promise<void> {
  const parsed = parseOsLoginInput(input, projectUrl);
  const result = parsed.kind === 'code'
    ? await auth.verifyOtp({ email: email.trim(), token: parsed.token, type: 'email' })
    : parsed.kind === 'confirmation'
      ? await auth.verifyOtp({ token_hash: parsed.tokenHash, type: parsed.type })
      : await auth.setSession({ access_token: parsed.accessToken, refresh_token: parsed.refreshToken });
  if (result.error) {
    const status = result.error.status;
    const code = result.error.code;
    if (code === 'otp_expired' || status === 403) throw new Error('这个链接或验证码已过期或已使用，请重新发送登录邮件，再复制新链接');
    if (status === 429) throw new Error('操作有点频繁，请稍等一分钟再试');
    if (result.error.name === 'AuthRetryableFetchError') throw new Error('暂时连不上登录服务，请检查网络后重试');
    // Avoid copying provider errors that could include pasted credentials.
    throw new Error('登录未完成，请确认使用最新邮件中的验证码或链接');
  }
  if (!result.data.session || !result.data.user) throw new Error('尚未取得登录状态，请重新发送登录邮件');
}

export async function sendOsLoginEmail(auth: Pick<SupabaseClient['auth'], 'signInWithOtp'>, email: string): Promise<void> {
  const address = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error('请先填写能接收邮件的完整邮箱地址');
  const { error } = await auth.signInWithOtp({ email: address, options: { shouldCreateUser: true } });
  if (!error) return;
  if (error.status === 429) throw new Error('邮件发送有点频繁，请等一分钟后再试');
  if (error.name === 'AuthRetryableFetchError') throw new Error('暂时连不上邮件服务，请检查网络后重试');
  throw new Error('登录邮件未发出，请检查邮箱地址并稍后重试');
}
