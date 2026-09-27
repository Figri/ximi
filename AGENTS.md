# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# 项目状态怎么接续（给新开的对话看）

- 纯OTA应用：EAS Update + GitHub Actions，不走原生重新构建，永远不加需要原生编译的新依赖。
- 开发分支固定是 `claude/clever-einstein-4j55to`，push到这个分支会自动触发"EAS 自动发布更新" workflow。
- 想知道项目做到哪一步：看 `git log --oneline -20`。每次提交的message都写了这轮改了什么、怎么真实验证的、发现并修了什么bug——不用把整个对话历史搬进新会话，读最近几条commit message基本就能接上。

# 验收纪律（每次写完代码都要做，不是可选项）

1. 先 `npx tsc --noEmit`，再 `rm -rf dist && npx expo export --platform web`（本地用web导出配合Playwright测；真正发布用 `--platform android`）。
2. 用 Playwright 真实点击/拖拽/滚动去走一遍功能，不能只读代码就说"应该没问题"。把需求里列出的验收点挨个对照，一条条确认过，能截图的截图留证。
3. 主动测边界情况（空状态、重叠数据、极短时长、多条并发写入等），不要等用户发现bug再修——历史上好几个真bug（滚轮选择器在web上不生效、拖拽排序并发读改写互相覆盖）都是靠这一步主动测出来的，光看代码看不出来。
4. 发现真bug自己诊断根因、自己改、改完重新验证，不要甩给用户。
5. 最后如实汇报：测了什么、发现并修了什么bug、最终验证结果、哪些东西在这个沙盒里测不了以及为什么（比如 `Alert.alert` 在react-native-web上完全不渲染，任何靠它做二次确认的删除/归档流程只能代码审查，测不了真实点击）。
