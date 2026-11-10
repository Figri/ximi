---
name: ximi-verify
description: 西米OS 改完代码后的验收流程（AGENTS.md「验收纪律」的具体操作）：tsc → npm test → 临时装 web 依赖 → 离线导出 web → Node 版 Playwright 往 localStorage 种数据、真点真拖、拨时钟测换日 → 离线导出 android。在这个仓库里改完任何代码、要「验收 / 测一下 / 截图给她看 / 复现 bug」时用。
---

# 西米OS 验收怎么做

AGENTS.md 规定了「要做什么」，这里是「在云端沙盒里具体怎么做」，每一步都在 2026-11 实际跑通过。

## 1. 先过静态检查

```bash
npx tsc --noEmit
npm test            # tests/logic.test.mjs，纯函数，不用装别的
```

## 2. 临时装 web 依赖（不写进 package.json）

App 只发 Android，`react-dom` / `react-native-web` 不在依赖里。按 Expo 自带的版本表临时装：

```bash
V=$(node -e "const b=require('expo/bundledNativeModules.json');process.stdout.write('react-dom@'+b['react-dom']+' react-native-web@'+b['react-native-web'])")
npm install --no-save --no-audit --no-fund $V
```

装完 `git status` 里不应该出现 package.json / package-lock.json 的改动。

## 3. 离线导出 web

```bash
rm -rf dist && EXPO_OFFLINE=1 npx expo export --platform web
```

不加 `EXPO_OFFLINE=1` 会报 `HTTP Proxy Network Error: Forbidden`：Expo CLI 启动时去 expo.dev 查版本，沙盒代理不放行，跟代码无关。

## 4. 起静态服务

```bash
python3 -m http.server 8090 --directory dist    # 后台跑
```

导出是单页模式：只有 `/` 能直接打开；别的页面在 App 里点进去，不要直接 goto 深链接再刷新。

## 5. 用 Node 版 Playwright 真点

- 用 **Node 版**：`createRequire('/home/user/ximi/package.json')` 之后 `require('playwright')`。沙盒里没有 Python 版，**不要** `pip install playwright` 或 `playwright install`。
- 手机尺寸：`viewport: { width: 390, height: 844 }`，`timezoneId: 'Asia/Shanghai'`，`locale: 'zh-CN'`。给她看的截图 `deviceScaleFactor: 2`，自己看的用 1。
- 跑种数据的 node 脚本时加 `TZ=Asia/Shanghai`，不然脚本里算的「晚上 8 点」到浏览器里会变成凌晨 4 点。
- `testID` 在 web 上就是 `data-testid`，用 `page.getByTestId('care-expand')`。
- 长按：`mouse.down()` → 等 800ms → `mouse.up()`（App 里长按一般是 400ms）。

### 种数据

本地库（`lib/localdb.ts`）在 web 上就是 localStorage：

- 每张表按 200 行一块：`ldb_v1_<表名>_<块号>` 存 JSON 数组，`ldb_v1_<表名>_meta` 存 `{"chunks": 块数}`。
- 行的字段照 `types/index.ts`，默认值照 `lib/localdb.ts` 里的 `DEFAULTS`。
- 别的模块是普通 AsyncStorage 键（`todo_completions_v1`、`schedule_checks_v1` 等），在各自的 `*Local.ts` 里能找到键名。
- 用 `context.addInitScript` 在页面脚本跑之前写进去；用 sessionStorage 打个标记只种一次，不然页面一刷新会把 App 刚写的东西盖掉。
- 没配 `EXPO_PUBLIC_SUPABASE_URL` 时旧 Supabase 搬家会自己跳过，不用管。

### 拨时钟

一天从 5 点算起（`lingDayKey`，灵的设定里能改）。测换日、过半夜、「到日子提醒」这类逻辑时：

```js
await page.clock.install({ time: new Date('2026-11-11T00:40:00+08:00') });
await page.goto('http://localhost:8090/');
```

### 验证写进去的东西

点完之后用 `page.evaluate(() => localStorage.getItem('ldb_v1_completions_0'))` 读回来，核对条数和字段，别只看界面。

## 6. 最后确认 Android 能打包

```bash
EXPO_OFFLINE=1 npx expo export --platform android --output-dir <草稿目录>/dist-android
```

## 7. 收尾

- `rm -rf dist`，关掉 http.server。
- `git status`：只应该有这次改的源码。

## 在 web 上测不了的（汇报时如实写）

- `Alert.alert` 在 react-native-web 上完全不渲染：靠它二次确认的删除 / 归档流程只能代码审查。
- 通知、震动（`Vibration`）、触感反馈。
- 原生 Yoga 跟 react-native-web 的布局差异：百分比 / `maxHeight` 在没有明确高度的祖先节点上表现不同，横向 ScrollView 不给外层高度时的表现也不同。这类改动要提醒她在手机上看一眼。
