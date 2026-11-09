# FORK

维护者笔记。`README.md` 是安装说明，必须**如实描述本 fork 实际发布的东西**；本文件记录与上游的差异、原因，以及如何把这个 fork 维护下去。变更日志就是 fork 分支上的提交历史——有意不再维护第二份。

## 仓库结构

fork 自 [`kunkun9527/pi-hashline-edit-pro-lean`](https://github.com/kunkun9527/pi-hashline-edit-pro-lean) 的 `6.4.6-lean.3`。那个包装层又包装了 [`YuGiMob/pi-hashline-edit-pro`](https://github.com/YuGiMob/pi-hashline-edit-pro)，本 fork 把包装层移植到上游 `7.2.0`。

| Ref | 内容 |
| --- | --- |
| `main` | 与 fork 时刻完全一致的上游树。没有任何 fork 提交。rebase 目标。 |
| `mine` | 全部 fork 提交，线性、无 merge。安装命令 pin 在这里；合并进 `main` 后即可去掉 pin。 |
| `upstream-7.1.1` | `mine` 的旧名，与它同提交，只为让早先写下的安装命令继续可用；确认无人依赖后删除。 |
| 运行时 `mine`（`qiansanyu/pi-hashline-edit-pro`） | `package.json` 依赖的运行时。承载行为改动 `autoReadWrite`，以及 `[H_LITERAL_ESCAPE]` 的计数文案（模型可见文本，非行为）；理由见下。 |

不发布到 npm：`dependencies` 指向 git ref，所以安装是按 commit 复现，而不是按版本号。

## 与所 fork 的包装层的差异

| 方面 | 上游包装层 `6.4.6-lean.3` | 本 fork | 位置 |
| --- | --- | --- | --- |
| 运行时 | `pi-hashline-edit-pro@6.4.6` | `github:qiansanyu/pi-hashline-edit-pro#mine`（上游 7.2.0） | `package.json` |
| 模型可见文本 | 6.4.6 的精简版 | 7.2.0 的精简版，`outline` 已移植；转义规则不照抄上游，改为指向 `[H_LITERAL_ESCAPE]` 的字符数 | `index.ts`、`tests/` |
| 锚点 | 四字符 | 五字符小写，即 7.x 提供的形式 | `index.ts`、`tests/` |
| 行为 | — | `autoReadWrite`（默认 `"full"`）：`write` 只回报行数，不回显整篇文件；这与上游保持默认时的输出一致 | 运行时 `mine` 分支 |
| 度量 | 完整系统提示，一次性 | 仅工具文本，可复现的 harness，快照入库 | `bench/` |
| 文档 | 6.4.6、原作者安装地址 | 7.2.0、本 fork 安装地址、差异与同步说明 | `README.md`、`README_zh-CN.md`、本文件 |

### 转义规则为什么不照抄上游

上游 7.2.0 的 payload 规则按「JSON 源」写：escapes are decoded once … `\uXXXX` 是那个字符、`\\uXXXX` 是字面文本。但工具拿到的是**值**而不是源：它逐字写入，一次调用是否被解一次由参数解析决定，不由这个扩展决定。照抄这句话等于给模型一个会算错的预判 —— 而「该写几个反斜杠」正是它动手前唯一的判断依据。

所以这一行改为指向测量：payload 原样落地，落盘的真实字符数由 `[H_LITERAL_ESCAPE]` 报出，以计数为准。这样规则不依赖任何链路语义（换 provider、换模型都成立）。hint 的记法与计数在运行时仓库，本仓库只同步这一行文案；5 变体落盘矩阵、定位与去重的回灌联动，以及为什么"只改文案"会静默降级，记在运行时仓库的 `LOCAL-CHANGES.md` 第 2 节。

## 文档改到哪里

保持这个切分，下一次 rebase 才便宜：

- `README.md` / `README_zh-CN.md` —— 用户会照着做的事实：安装命令、版本、工具清单、默认值、行为。fork 一变就改它们；绝不能让它们描述上游的版本，因为里面的安装命令指向的是 fork。
- 两份 README 顶部的 `## This fork` / `## 本 fork 的差异` —— 唯一谈「自己是个 fork」的正文。凡是 fork 属性都放这里，这样下面属于上游的段落可以整段照搬。
- `bench/README.md` —— 度量细节：四种设置的表格、上游成本为何下降、每个复现用例证明了什么。`README.md` 只留一句结论和一个链接。
- 本文件 —— 差异理由 + 同步与发版流程。不面向用户。

不要加 `LOCAL-CHANGES.md` 式的差异日志。它重复 `git log main..mine`，写完就开始腐坏，而且最糟的是：它会诱导你把 README 留在上游的事实上，于是 README 描述的版本根本不是安装命令取到的版本。

## 同步上游

```bash
git remote add upstream https://github.com/kunkun9527/pi-hashline-edit-pro-lean.git  # 只需一次
git config rerere.enabled true                                                      # 只需一次
git config rerere.autoupdate true                                                   # 只需一次
git fetch upstream
git rebase upstream/main                                                            # 在 fork 分支上
```

冲突热点，从重到轻：`README.md`、`README_zh-CN.md`、`index.ts`、`tests/*.mjs`、`package.json`。历史刻意保持「一个关注点一个提交」：冲突只会落在引起它的那个提交上，意图就写在提交信息里。把分支压缩成一个提交，等于拿这个换一大坨无法解析的冲突。

上游整段重写某个 README 小节时，取他们的，再只把 fork 的事实贴回去——`git checkout --theirs README.md`，然后恢复 `## This fork`、安装 pin、`## Versions` / `## 版本`、以及那一行占用结论。`bench/` 是 fork 独有的，永不冲突。

## 发版

1. `npm ci && npm run check`
2. `npm run bench && npm run bench:upstream` —— 写出 `bench/snapshots/<version>*.{json,txt}`
3. 更新 `bench/README.md` 里的表格；重新生成的快照若只差版本戳，就说明工具文本没动
4. 改 `package.json` 的 `version` 与 `description`，再改两份 README：顶部一行结论、`## Versions` / `## 版本`，差异若变动也一并更新 `## This fork`
5. 按仓库既有风格提交：conventional 前缀 + 这么做的理由（`deps:`、`docs:`、`bench:`、`test:`、`fix:`、`release:`）
6. `pi install git:github.com/qiansanyu/pi-hashline-edit-pro-lean@mine`，然后新建 Pi 会话——工具文本与 Schema 只在注册时进入模型

## 待办

分支改名已完成。`upstream-7.1.1` 仍与 `mine` 同提交，是留给旧安装命令的兼容引用；确认没有环境还 pin 在旧名上之后，删掉本地与远端分支即可（`git branch -d upstream-7.1.1`、`git push origin :upstream-7.1.1`）。
