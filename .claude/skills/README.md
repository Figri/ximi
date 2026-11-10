# 项目 skill 从哪来

打开这个仓库的 Claude Code（电脑上、云端都一样）会自动加载这里的 skill。2026-11-10 装的：

| skill | 来源 | 版本 | 许可 |
|---|---|---|---|
| `ximi-verify` | 这个项目自己写的 | — | 跟仓库一样 |
| `expo-router` | github.com/expo/skills `plugins/expo/skills/expo-router` | a9e5bd3 | MIT |
| `expo-animation` | 同上 `expo-animation` | a9e5bd3 | MIT |
| `expo-design-system` | 同上 `expo-design-system` | a9e5bd3 | MIT |
| `eas-update` | 同上 `eas-update` | a9e5bd3 | MIT |
| `vercel-react-native-skills` | github.com/vercel-labs/agent-skills `skills/react-native-skills` | 1a2c79d | MIT |
| `frontend-design` | github.com/anthropics/skills `skills/frontend-design` | 2c5958e | Apache-2.0 |

原样拷过来，只删了给别的 AI 工具用的 `agents/openai.yaml`。要更新就从上面的仓库重新拷同一个目录。

## 看过但没装的

- `expo-overview`：是个「路由」skill，会让人先去查 `@expo/ui`（要原生编译），跟这个项目只走 OTA 冲突。
- `expo-ui`、`expo-native-ui`、`expo-dom`、`expo-module`、`expo-app-clip`、`expo-dev-client`、`eas-app-stores` 等：要么要原生编译，要么偏 iOS，要么跟这个项目用不上。
- `webapp-testing`（Anthropic）：要 Python 版 Playwright，沙盒里只有 Node 版；换成了自己写的 `ximi-verify`。
- `react-native-best-practices`（Callstack）：6.5MB，大部分是图，放进仓库太重。

用法上跟 `AGENTS.md` 冲突时以 `AGENTS.md` 为准。
