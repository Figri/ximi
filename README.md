# 西米OS

给西米一个人用的生活管理 APP。核心是把"知道该做但总拖着"的事变成固定周期提醒，做了就记录，回头能看。
打开像跟人聊天，不是打开管理工具。

技术栈：Expo (React Native) + expo-router + Zustand + Expo Notifications。数据存在手机本地（AsyncStorage，`lib/localdb.ts`），
连上 Notion 后自动同步、每周备份（`lib/notion/`）。只走 OTA 更新（EAS Update），不加需要原生编译的依赖。

## 现在（2.0）有什么

- ☀️ **今天**：随心记（随手写一句；左边选个表情就是「现在怎么样」，能单独记也能表情 + 一段话）、作息和事项（直接写一句就加，认得「周三 10点」「20分钟后 关火」）、
  娱乐出口、身体（体重 / 经期）、该照顾的（习惯，按分类分组，长按看记录、改、删）
- 🕐 **时间**：格子视图 / 列表视图记时间块，每条能记积分（＋/－）；顶上「今日 +N」，⋯ 里是积分统计、时间统计、月历、分类和情绪标签管理
- 💜 **灵**：对话、主动消息（约定提醒、接住你、想你了、顺口一提），提示词 6 层拼起来（`lib/ling/prompt.ts`），
  「灵的设定」里能看能改
- ⋯ **其他**：底栏自己排；日程、本周、猫咪、身体这些页面；作息模板、灵的设定、Notion 连接 / 备份恢复、让灵记住的事
- 右下角 ＋：一句话自动归类成时间块 / 事项 / 例行 / 状态 / 想法 / 碎片（`lib/captureParse.ts`）

## 项目结构

```
app/
  (tabs)/            # 底栏：今天 index / 时间 time / 灵 chat / 其他 other（other/ 下是从「其他」点进去的页面）
  page/              # 从别的页面单独打开某个功能页（带返回）
  habit/[id].tsx     # 新建 / 编辑习惯（id=new 是新建）
  cat/[id].tsx       # 一只猫的记录
  ...                # 灵的设定、Notion 连接、作息模板、分类管理等
components/          # today/ timetab/ capture/ ling/ schedule/ todotab/ common/
lib/
  localdb.ts         # 本地数据库（用法和 supabase-js 一样，存在 AsyncStorage）
  ling/              # 灵：提示词、回复、主动消息排程
  notion/            # Notion 同步、备份
  captureParse.ts    # ＋ 的一句话怎么归类（纯函数，有测试）
  decay.ts           # 习惯到日子 / 提醒（纯函数，有测试）
  legacyMigration.ts # 旧 Supabase 数据一次性搬到本地
tests/logic.test.mjs # npm test：上面两个纯函数的测试，不用装别的
```

## 改完代码怎么验

`npx tsc --noEmit` → `npm test` → `rm -rf dist && npx expo export --platform web` 用浏览器真点一遍 →
`npx expo export --platform android` 确认 Hermes 能打包。详细规矩见 `AGENTS.md`。

> 下面「建 Supabase 项目」是第一版留下的：2.0 起数据都在手机本地，Supabase 只用来把旧数据一次性搬过来，新装可以跳过。

## 0. 建 Supabase 项目（不管走哪条部署路线都要做，纯网页操作）

1. 去 [supabase.com](https://supabase.com) 建一个新项目
2. 打开 SQL Editor，运行 `supabase/schema.sql`，再运行 `supabase/seed.sql`
   - 如果复制粘贴的地方（比如 GitHub 网页、某些剪贴板工具）一次只能拿到 100 行左右，改用 `supabase/split/` 目录下拆好的分段文件，按文件名顺序（`schema_1_of_3.sql` → `schema_2_of_3.sql` → `schema_3_of_3.sql`，然后 `seed_1_of_2.sql` → `seed_2_of_2.sql`）一段段跑，已经在本地 Postgres 里验证过整个流程没问题
   - 更省心的办法是用 `psql "你的连接串" -f supabase/schema.sql` 直接跑文件，完全不用复制粘贴
3. 项目设置里拿到 `Project URL` 和 `anon public / publishable key`，下面两条部署路线都要用到这两个值

RLS 已经在 `schema.sql` 里关掉了（单用户 APP，不需要）。

## 部署：装一次 APP，以后自动更新（推荐）

代码改动会通过 GitHub Actions 自动发布 OTA 更新（EAS Update），装了 APP 之后不用再碰电脑，改动会在你下次打开 APP 时自动生效。整个链路：

```
我推代码到 GitHub → GitHub Actions 自动跑 → 发布更新到 EAS → 手机上的 APP 下次打开自动拉取
```

### 一次性设置（大概10分钟，全程网页操作，不用装任何东西）

1. 去 [expo.dev](https://expo.dev) 免费注册账号
2. 登录后：右上角头像 → **Account Settings** → **Access Tokens** → **Create Token**，复制生成的 token
3. 去 [github.com/Figri/ximi](https://github.com/Figri/ximi) → **Settings** → **Secrets and variables → Actions** → **New repository secret**，Name 填 `EXPO_TOKEN`，Value 粘贴刚才的 token
4. 仓库 **Actions** 标签页 → 找到 **EAS 一次性初始化** → **Run workflow**，跑一次（把这个仓库跟你的 EAS 账号关联起来，自动把 `app.json` 里的更新地址填好）
5. 去 [expo.dev](https://expo.dev) 找到刚关联出来的项目 → **Environment variables**，分别给 `preview` 和 `production` 这两个 environment 各加两条（跟上面「0.」拿到的值一样）：
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`

   这步不能跳，不然打出来的 APP 连不上 Supabase（AI key 不用在这加，那个是装完 APP 之后在手机上「其他 → 灵的设定 → 大脑」里自己填的，跟这里无关）。
6. 回 GitHub 仓库 **Actions** 标签页 → **EAS 构建 APK** → **Run workflow**，`profile` 选 `preview`，跑完在日志里能看到下载链接，或者去 expo.dev 项目页的 Builds 里找

### 装到手机

把第 6 步的 APK 下载下来，传到手机（微信/网盘/浏览器直接下载都行），点开安装。Android 首次装非应用商店的 APK 会提示"未知来源"，允许一下就行。

### 之后怎么更新

不用做任何事。以后我这边每次往 `claude/clever-einstein-4j55to` 分支推代码，**EAS 自动发布更新**这个工作流会自动跑，你手机上的 APP 下次冷启动（完全退出再打开）就会拉到最新版本。

> 例外：如果某次改动加了新的原生模块/权限（比如以后做屏幕时间那个功能），OTA 更新盖不到，需要重新走一遍"构建 APK"那步、重新装一次。我会在那种改动之后提前说清楚。

### 想在电脑上本地跑（可选，日常开发不需要）

如果你想在自己电脑上改代码实时预览，或者上面的 GitHub 网页/expo.dev 网页在你的网络下都打不开（说明需要代理才能用），走下面这条本地路线：

### 1. 配环境变量

```bash
cp .env.example .env
```

把 `.env` 里的两个值填成真的：

```
EXPO_PUBLIC_SUPABASE_URL=你的 supabase project url
EXPO_PUBLIC_SUPABASE_ANON_KEY=你的 supabase anon/publishable key
```

AI 的 key 不用配在这里：APP 装起来之后，去 **其他 → 灵的设定 → 大脑**，选一个模型、把对应的 key 粘进去、保存就行。key 存在手机本地的系统安全存储里（iOS Keychain / Android Keystore），不会进 Supabase 也不会进 git，换手机要重新填一遍。

### 2. 装依赖、跑起来

```bash
npm install
npx expo start
```

手机装 **Expo Go**（Google Play 下载），扫二维码就能实时预览。改代码会热更新。

### 3. 打包成 APK 装到手机

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
- AI key 存在设备本地（`expo-secure-store`），不在构建产物/仓库里；如果以后要给别人用，最好还是换成后端代理，不要让每个人在自己手机上各存各的 key 直连各家 API
- 灵的回复里可以带结构化指令（```json {"actions":[...]}```），由 `lib/ling/actions.ts` 执行（比如打卡）
