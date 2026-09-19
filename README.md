# 西米OS

给西米一个人用的生活管理 APP。核心是把"知道该做但总拖着"的事变成固定周期提醒，做了就记录，回头能看。
打开像跟人聊天，不是打开管理工具。

技术栈：Expo (React Native) + expo-router + Supabase (Postgres) + Zustand + Expo Notifications。

## 第一版做了什么

- 📌 **生活**：卡片列表（按红/黄/绿排序）、标签筛选、完成打卡 + 撤销（带动效）、新建/编辑卡片
- 💬 **聊天**：和「灵」的基础对话（v1 纯聊天，还不会自动改卡片数据）
- 📋 **记录** / 📊 **数据**：先放了占位页面，完整功能在第二、三版
- 衰减引擎（`lib/decay.ts`）：卡片根据完成时间线性衰减，超过 `max_delay` 变红
- 前台衰减检查 + 本地通知（`lib/useDecayNotifications.ts`，15分钟检查一次，Expo Go 里就能跑）
- 预设数据：5只猫 + 猫相关/护理/家务卡片（见 `supabase/seed.sql`）

## 项目结构

```
app/
  (tabs)/          # 底部tab：chat / life / record / data
  card/[id].tsx     # 卡片详情/编辑页（id=new 时是新建）
  _layout.tsx       # 根布局
components/         # Card, CardList, TagFilter, ChatBubble, ActionButton, HPMPBar
lib/
  supabase.ts       # Supabase client
  ai.ts             # AI API 封装（Claude / GPT / Gemini 可切换）
  decay.ts          # 衰减计算引擎
  notifications.ts  # 本地通知封装
  cards.ts          # 卡片/动作/完成记录的数据访问
  store.ts          # Zustand store
types/index.ts       # 和数据库表一一对应的 TS 类型
supabase/
  schema.sql        # 建表 SQL
  seed.sql          # 预设数据（猫、卡片、标签）
  split/            # schema.sql / seed.sql 按 <100 行拆好的分段版本
```

## 第一次跑起来

### 1. 建 Supabase 项目

1. 去 [supabase.com](https://supabase.com) 建一个新项目
2. 打开 SQL Editor，运行 `supabase/schema.sql`，再运行 `supabase/seed.sql`
   - 如果复制粘贴的地方（比如 GitHub 网页、某些剪贴板工具）一次只能拿到 100 行左右，改用 `supabase/split/` 目录下拆好的分段文件，按文件名顺序（`schema_1_of_3.sql` → `schema_2_of_3.sql` → `schema_3_of_3.sql`，然后 `seed_1_of_2.sql` → `seed_2_of_2.sql`）一段段跑，已经在本地 Postgres 里验证过整个流程没问题
   - 更省心的办法是用 `psql "你的连接串" -f supabase/schema.sql` 直接跑文件，完全不用复制粘贴
3. 项目设置里拿到 `Project URL` 和 `anon public key`

### 2. 配环境变量

```bash
cp .env.example .env
```

把 `.env` 里的三个值填成真的：

```
EXPO_PUBLIC_SUPABASE_URL=你的 supabase project url
EXPO_PUBLIC_SUPABASE_ANON_KEY=你的 supabase anon key
EXPO_PUBLIC_AI_API_KEY=你的 AI API key（Anthropic / OpenAI / Gemini 三选一，取决于聊天页选的模型）
```

RLS 已经在 `schema.sql` 里关掉了（单用户 APP，不需要）。

### 3. 装依赖、跑起来

```bash
npm install
npx expo start
```

手机装 **Expo Go**（Google Play 下载），扫二维码就能实时预览。改代码会热更新。

### 4. 打包成 APK 装到手机

```bash
npm install -g eas-cli
eas login
eas build -p android --profile preview
```

build 完成后 EAS 会给一个下载链接，把 APK 传到手机（微信/网盘/USB都行）直接装。

> 注意：屏幕时间功能（`react-native-app-usage-stats`）需要 development build，不能在 Expo Go 里跑，先跳过，第三版再加。

## 开发备忘

- Expo SDK 57，用了新架构（`newArchEnabled: true`）
- 装原生模块时如果 `npx expo install` 报网络错误（React Native Directory 兼容性检查），加 `EXPO_OFFLINE=1` 环境变量跳过检查
- AI API key 目前是直接打进客户端的（简化处理，单用户场景可以接受）；如果以后要给别人用，务必换成后端代理，不要把 key 暴露在 APP 包里
- `lib/ai.ts` 已经会解析 AI 回复里的结构化指令（```json {"instructions":[...]}```），但 v1 聊天页还没接上"自动更新卡片"，这是第二版的事
