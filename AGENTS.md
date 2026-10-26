# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# 项目状态怎么接续（给新开的对话看）

- 纯OTA应用：EAS Update + GitHub Actions，不走原生重新构建，永远不加需要原生编译的新依赖。
- 开发分支固定是 `claude/clever-einstein-4j55to`，push到这个分支会自动触发"EAS 自动发布更新" workflow。
- 想知道项目做到哪一步：看 `git log --oneline -20`。每次提交的message都写了这轮改了什么、怎么真实验证的、发现并修了什么bug——不用把整个对话历史搬进新会话，读最近几条commit message基本就能接上。
- 需求文档的全文不在仓库里，在 Notion「📑 西米OS 需求文档」库（见下面「需求文档归档到 Notion」）；commit message 里没写细的需求去那里查。

# 验收纪律（每次写完代码都要做，不是可选项）

1. 先 `npx tsc --noEmit`，再 `rm -rf dist && npx expo export --platform web`（本地用web导出配合Playwright测；真正发布用 `--platform android`）。
2. 用 Playwright 真实点击/拖拽/滚动去走一遍功能，不能只读代码就说"应该没问题"。把需求里列出的验收点挨个对照，一条条确认过，能截图的截图留证。
3. 主动测边界情况（空状态、重叠数据、极短时长、多条并发写入等），不要等用户发现bug再修——历史上好几个真bug（滚轮选择器在web上不生效、拖拽排序并发读改写互相覆盖）都是靠这一步主动测出来的，光看代码看不出来。
4. 发现真bug自己诊断根因、自己改、改完重新验证，不要甩给用户。
5. 最后如实汇报：测了什么、发现并修了什么bug、最终验证结果、哪些东西在这个沙盒里测不了以及为什么（比如 `Alert.alert` 在react-native-web上完全不渲染，任何靠它做二次确认的删除/归档流程只能代码审查，测不了真实点击）。

# 需求文档归档到 Notion（每份都做，不用她提醒）

- 西米OS 的需求文档、改动清单、修复文档、验收报告：全文写在聊天里（手机能直接复制），同一轮里再存进 Notion「💓 2026 → 📑 西米OS 需求文档」库，一份一页。
- 名称写「YYYY-MM-DD｜标题」；类型、状态、模块、谁写的、版本都填上；正文最前面放她这次的原话（「她说的」）。
- 同一份文档改版就改同一页、版本号往上加；push 上线后把状态改成「已上线」，「提交」填提交号。
- 她直接发来的文档（她自己写的、GPT 写的）也存一份，「谁写的」选对。
- 文档不提交进这个仓库（仓库是公开的），只存 Notion。
- 要用 Notion 连接器。会话里没有 Notion 工具时，交付说明里写明「这份还没存进需求文档库」，下次有 Notion 的会话补上。
- 规则原文在 Notion「📐 系统规则」第 4 节，两边说法不一样时以那页为准。
