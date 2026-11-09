# pi-hashline-edit-pro-lean

<!-- token-benchmark:summary:start -->
> **工具文本：Lean 854 tokens，上游 `pi-hashline-edit-pro@7.2.0` 3,666，减少 76.7%。**
<!-- token-benchmark:summary:end -->
> **上游作者的配置参考：** [查看 Pi Lean Setup](https://github.com/kunkun9527/my-lean-pi-setup)

[English](README.md)

[`pi-hashline-edit-pro`](https://github.com/YuGiMob/pi-hashline-edit-pro) 的 Token 精简版 Pi 包装层。当前固定使用完整的上游 `7.2.0` 运行时，只精简长期进入模型上下文的工具文本。

## 本 fork 的差异

fork 自 [`kunkun9527/pi-hashline-edit-pro-lean`](https://github.com/kunkun9527/pi-hashline-edit-pro-lean) 的 `6.4.6-lean.3`，已移植到上游 `pi-hashline-edit-pro@7.2.0`。仅自用、从 git 安装，不发布到 npm，`kunkun9527` 名下的包仍是原始的 6.4.6 版本。

与被 fork 的包装层相比：移植了 `outline`，锚点改为 7.x 提供的五字符小写形式，运行时固定到本 fork 的 `mine` 分支（该分支带一处行为改动 `autoReadWrite`），上下文占用改为仓库内可复现的脚本测量。改了什么、为什么、以及如何与上游同步，见 [`FORK.md`](FORK.md)。

## 上下文占用

<!-- token-benchmark:benchmark:start -->
854 tokens，同一设置下上游为 3,666，**减少 76.7%**。本扩展加进模型上下文的全部内容都是工具文本，全部由 `bench/dump-visible-text.mjs` 实测；四种设置的完整表格、快照与复现脚本见 [`bench/`](bench/README.md)。
<!-- token-benchmark:benchmark:end -->

## 保留的能力

- 五字符小写 Hashline 锚点与已提供锚点校验。
- 安全的 anchor-only `replace`、`replace_match`、`insert`、`copy`、`move`（默认不传 `path`）和按文件撤销。
- 返回锚点的 ripgrep 搜索，工具名为 `grep`，默认启用。
- Hash store、自动读取、文件检查、write 锚点回显防护和上游 session hooks。
- 直接复用上游运行时、Schema 和工具开关，不缩减或重写安全协议。
- 兼容本地 `@local/pi-collapsed-tools.display-service.v1` 折叠展示装饰器。

## 为什么更精简

只裁剪模型可见文本，而且每一句都是上游原有说法的精简版：简短描述、一行工具清单摘要，以及上游使用规则的缩写；每条规则只说一次，所以删除参数字段说明，只保留上游对范围首尾、copy 的源与目标（move 字段相同）以及 `text` 的原文说明（其中换行规则挪到共用编辑规则里）；不额外加载 Prompt 资源，也不加任何我们自己的规则。上游已经用报错强制执行、且错误信息写明怎么改的规则（范围内的行没读过、同批范围重叠、锚点失效、path 与锚点不符），交给报错处理，不写进提示。提示里保留上游那些违反后会悄悄改错、或丢掉报错也找不回的东西：`anchor│content` 行格式、转义只解码一次、batch 与单槽撤销、追加与删除的语义。上游只在某些设置下才给的句子（关闭 replace_match 或 copy/move、关闭 autoRead、开启 codemode）随设置增减；上游在每个工具上重复的工具偏好句只在 `read` 上保留一次，codemode 专用说明原样透传。运行行为、默认值、校验、错误契约和工具 Schema 都随所固定的上游运行时，只有一处随分支带进来的改动：`autoReadWrite`（默认 `"full"`）让 `write` 只回报行数而不回读整篇；保持默认时，模型看到的文本与上游今天完全一致。

## 安装

```bash
pi install git:github.com/qiansanyu/pi-hashline-edit-pro-lean@upstream-7.1.1
```

`@upstream-7.1.1` 固定到承载本 fork 上游移植及其 `mine` 运行时依赖的分支（分支名是历史遗留）；该分支合并进 `main` 后即可去掉。

需要 Pi `>=0.99.0`。请勿同时加载其它 Hashline 包装扩展或上游包本身，以免重复注册工具。

## 工具

```text
read
outline            # 上游的符号地图，上游默认关闭
replace            # anchor-only：默认不传 path
replace_match      # 在锚点范围内替换精确子串
insert             # anchor-only：默认不传 path
copy / move        # 复制或移动锚点行范围，可跨文件
grep               # 带锚点的 ripgrep，替代 Pi 内置 grep
undo_last_change   # 仍需要 path
```

必须复制 `read`、`grep` 或 `outline` 返回的五字符小写锚点，绝不要猜测。`replace` 和 `insert` 接收一个原样写入的 `text` 字符串，字符串里的换行就是分行；`replace` 中 `text: ""` 表示删除所选范围。同一条消息里对同一文件的编辑会合并成一个 batch，共用一个 diff 和一次撤销。

参数容错：校验之前，`replace` 把已废弃的 `replacement_text` / `replacement_lines`、`insert` 把 `lines` 当作 `text`，与 `path` 相同的 `ref` 会被丢弃。有歧义的输入（包括缺 `remove_to`、`path` 或锚点）仍按校验报错。

## 配置

配置保存在 `~/.config/pi-hashline-edit-pro/config.json`（或 `$PI_HASHLINE_DIR/config.json`），与上游共用，用 `/hashline-config` 修改。

默认值与上游一致：除 `outline` 外全部开启，`outline` 需要先在 `/hashline-config` 里打开。`6.4.5-lean.2` 及更早版本加载时会往配置里写入 `replaceMatchEnabled: false`（更早的版本还会写 `copyMoveEnabled: false`），升级后这些值会保留，请在 `/hashline-config` 里把工具重新打开，或者写入：

```json
{
  "copyMoveEnabled": true,
  "replaceMatchEnabled": true
}
```

有两个上游设置会换上 Pi 自带的普通工具：`anchorGrepEnabled: false` 会注册内置 `grep`；被 `disableOnModels` 匹配的模型会改用内置 `read` 和 `grep`，并关闭编辑工具。这些普通工具保留 Pi 自己的说明。

## 从 4.x 升级

- `replacement_lines` / `lines` 数组改为 `text` 字符串；`[]` 改为 `""`。
- `anchor_grep` 改名为 `grep`，并替代 Pi 内置 `grep`。
- 新增 `replace_match`、`copy`、`move`，默认开启，都可在 `/hashline-config` 里切换。
- 纯删除会校验首尾两行；中间从未读到的行按磁盘上的当前内容删除。

升级后请新建 Pi 会话，确保模型获得新的 Schema 与使用说明。

## 版本

- Lean 包装层：`7.2.0-lean.1`
- 上游运行时：`pi-hashline-edit-pro@7.2.0`（本 fork 的 `mine` 分支）
- Pi：`>=0.99.0`
- Node.js：`>=22.19.0`

## 本地开发

```bash
npm ci
npm run check
```

## 开源协议与上游

MIT。本项目包装了采用 MIT 许可证的 [`pi-hashline-edit-pro`](https://github.com/YuGiMob/pi-hashline-edit-pro)。
