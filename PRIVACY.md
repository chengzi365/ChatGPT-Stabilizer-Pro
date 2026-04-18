# Privacy Policy

## ChatGPT Stabilizer Pro

This policy describes what ChatGPT Stabilizer Pro can access on the page, what it stores locally, and what can leave the browser only when the user explicitly copies or exports data.

---

# English Version

## 1. Local-Only Operation

ChatGPT Stabilizer Pro runs entirely inside the user's browser on supported ChatGPT pages.

The extension:

- does not send data to external servers
- does not use analytics or tracking services
- does not use remote logging
- does not upload conversation content

All optimization, diagnostics, and debug processing happens locally in the browser.

---

## 2. What the Extension May Access on the Page

To recognize ChatGPT conversations, measure layout, apply optimization, and support diagnostics, the extension may access limited page data such as:

- route and page state, including the current pathname, search, hash, and page-recognition status
- DOM structure and element attributes used for recognition and optimization, such as `data-testid`, `data-turn-id`, `data-message-id`, `data-message-author-role`, `role`, visibility-related attributes, and layout geometry
- page structure changes detected through `MutationObserver`
- limited interaction metadata during optional debug recording, such as clicks, pointer/button type, focus/selection changes, key names, modifier keys, input type, and input length
- limited text-derived runtime signals used to estimate content complexity or derive in-memory fallback identifiers when the page does not provide stable message identifiers

The extension may transiently inspect page text nodes during local runtime analysis. However, it does not intentionally persist raw conversation text to extension storage, and redacted debug JSON exports do not intentionally include raw conversation text.

---

## 3. Diagnostics Snapshots

The control panel can generate a plain-text diagnostics snapshot when the user manually clicks the copy action.

A diagnostics snapshot may include:

- current runtime status
- selected mode and effective mode
- current page pathname
- page-recognition status
- message and optimization counts
- fallback, recovery, and debug counters

Diagnostics snapshots are generated locally and are not uploaded automatically. If the user copies one, it is placed on the system clipboard by explicit user action.

---

## 4. Debug Recording and Redacted Exports

The extension provides an optional debug recorder for troubleshooting.

Debug entries may include:

- structural summaries of page elements
- local DOM identifiers such as `id`, `data-testid`, role metadata, and DOM path signatures
- page-structure change summaries
- extension sync, pipeline, fallback/recovery, mode-decision, and style-write summaries
- limited keyboard and input metadata such as key names, modifier keys, input type, and input length
- route, path, turn, and message identifiers represented as per-export salted hashes

Debug JSON exports use `schemaVersion: 2` and `privacyMode: "redacted"`.

Redacted exports do not intentionally include:

- raw page pathname or full route string
- raw turn IDs or message IDs
- element `textContent`
- element `aria-label` text
- element `title` text
- page-title text

Debug entries are kept in browser memory by default. They leave the browser only if the user explicitly copies the JSON or exports it as a file.

While debug recording is active:

- the panel and compact badge display a red warning-style recording state
- debug JSON copy and export are disabled until recording stops

If the debug log reaches its maximum entry limit, the extension stops recording automatically, records the stop reason, and preserves the earliest entries instead of discarding the beginning of the log.

The extension may store the debug-recording flag locally so recording can resume after a page reload.

---

## 5. Local Storage

The extension stores a small set of settings locally, such as:

- selected optimization level
- panel open/hidden state
- panel position and size
- active panel tab
- panel theme
- debug-recording on/off state

These settings are stored in:

- extension local storage (`storage.local`)
- a same-page `window.localStorage` mirror used for local state hydration in the content script

By default, the extension does not persist conversation content or full debug entry history to local storage.

---

## 6. Clipboard and File Export

Data leaves the running page only through explicit user actions.

Examples:

- copying a diagnostics snapshot to the system clipboard
- copying a redacted debug JSON export to the system clipboard
- exporting a redacted debug JSON file to a user-chosen location

Before sharing copied or exported data, users should review it carefully. Even in redacted form, diagnostics snapshots and debug logs may still contain current page path information, runtime state, key names, input lengths, local DOM identifiers, structural summaries, and hashed correlation IDs.

---

## 7. No Third-Party Communication

ChatGPT Stabilizer Pro does not communicate with third-party services or APIs.

The codebase does not use:

- remote analytics
- advertising or tracking SDKs
- remote error collection
- outbound network requests for extension telemetry

---

## 8. Permissions and Site Scope

The extension requests only the following browser permission:

`storage`

This permission is used only for local settings persistence.

Content scripts run only on:

- `https://chat.openai.com/*`
- `https://chatgpt.com/*`

---

## 9. User Controls and Data Deletion

Users can remove locally retained extension data at any time by:

- clearing debug logs in the control panel
- stopping debug recording
- deleting exported JSON files
- clearing the extension's local storage
- clearing the same-page local storage entries created by the extension
- uninstalling the extension

---

## 10. Policy Updates

This policy may be updated if the extension changes how it processes local data.

Updates will be reflected in this document.

---

# 中文版本

## 1. 本地运行原则

ChatGPT Stabilizer Pro 仅在用户本地浏览器中的受支持 ChatGPT 页面内运行。

本扩展：

- 不会向任何外部服务器发送数据
- 不会使用统计分析或追踪服务
- 不会使用远程日志服务
- 不会上传聊天内容

所有优化、诊断和调试处理均在浏览器本地完成。

---

## 2. 扩展在页面中可能访问的信息

为了识别 ChatGPT 对话结构、测量布局、执行本地优化并提供诊断能力，扩展可能访问以下有限页面信息：

- 路由和页面状态，例如当前 `pathname`、`search`、`hash` 以及页面识别状态
- 用于识别和优化的 DOM 结构与元素属性，例如 `data-testid`、`data-turn-id`、`data-message-id`、`data-message-author-role`、`role`、可见性相关属性和布局几何信息
- 通过 `MutationObserver` 检测到的页面结构变化
- 可选调试记录期间的有限交互元信息，例如点击、指针/按钮信息、焦点/选择变化、按键名称、修饰键、输入类型和输入长度
- 在页面未提供稳定消息标识时，用于估算内容复杂度或生成仅驻留内存的后备标识的有限文本派生信号

扩展在本地运行分析过程中，可能会临时检查页面文本节点。但扩展不会有意将原始聊天正文持久保存到扩展存储中，脱敏后的调试 JSON 导出也不会有意包含原始聊天正文。

---

## 3. 诊断快照

控制面板支持在用户手动点击复制操作时生成纯文本诊断快照。

诊断快照可能包含：

- 当前运行状态
- 当前选择档位和实际生效档位
- 当前页面路径
- 页面识别状态
- 消息与优化统计
- 降级、恢复和调试计数信息

诊断快照仅在本地生成，不会自动上传。只有当用户主动复制时，相关文本才会写入系统剪贴板。

---

## 4. 调试记录与脱敏导出

扩展提供可选的调试记录功能，用于问题排查。

调试记录可能包含：

- 页面元素结构摘要
- 本地 DOM 标识信息，例如 `id`、`data-testid`、角色元信息和 DOM 路径签名
- 页面结构变化摘要
- 插件同步、pipeline 阶段、降级/恢复、模式决策和样式写入摘要
- 有限的键盘与输入元信息，例如按键名称、修饰键、输入类型和输入长度
- 以“按次导出加盐哈希”形式表示的 route、path、turn、message 标识

调试 JSON 导出使用 `schemaVersion: 2` 和 `privacyMode: "redacted"`。

脱敏导出不会有意包含：

- 原始页面路径或完整路由字符串
- 原始 turn ID 或 message ID
- 元素 `textContent`
- 元素 `aria-label` 文本
- 元素 `title` 文本
- 页面标题文本

调试记录默认只保存在浏览器运行时内存中。只有在用户主动复制 JSON 或导出文件时，它们才会离开当前浏览器运行环境。

调试进行时：

- 面板和折叠徽标会显示红色警示状态
- 调试 JSON 的复制和导出会被禁用，必须先停止调试

如果调试记录达到最大条目上限，扩展会自动停止记录、记录停止原因，并保留最早的记录内容，而不是滚动覆盖开头。

扩展可能会在本地保存“是否正在调试”的开关状态，以便页面刷新后恢复调试状态。

---

## 5. 本地存储

扩展会在本地保存少量配置与界面状态，例如：

- 当前优化档位
- 面板展开/隐藏状态
- 面板位置和尺寸
- 当前面板标签页
- 面板主题
- 调试记录开关状态

这些设置会保存在：

- 扩展本地存储 `storage.local`
- 内容脚本用于本地状态恢复的同页 `window.localStorage` 镜像

默认情况下，扩展不会把聊天正文或完整调试记录历史持久保存到本地存储中。

---

## 6. 剪贴板与文件导出

数据只有在用户明确操作时，才会离开当前页面运行环境。

例如：

- 手动复制诊断快照到系统剪贴板
- 手动复制脱敏调试 JSON 到系统剪贴板
- 手动导出脱敏调试 JSON 文件到用户选择的位置

在对外分享复制内容或导出文件前，用户应仔细检查内容。即便已经脱敏，诊断快照和调试记录仍可能包含当前页面路径、运行状态、按键名称、输入长度、本地 DOM 标识、结构摘要以及哈希关联 ID 等上下文信息。

---

## 7. 无第三方通信

ChatGPT Stabilizer Pro 不会连接任何第三方服务或 API。

代码中不使用：

- 远程统计分析
- 广告或追踪 SDK
- 远程错误收集
- 面向扩展遥测的外发网络请求

---

## 8. 权限与运行范围

扩展仅申请以下浏览器权限：

`storage`

该权限仅用于本地保存扩展设置。

内容脚本仅运行在：

- `https://chat.openai.com/*`
- `https://chatgpt.com/*`

---

## 9. 用户控制与数据删除

用户可以随时通过以下方式删除扩展在本地保留的数据：

- 在控制面板中清空调试记录
- 停止调试记录
- 删除已经导出的 JSON 文件
- 清除扩展本地存储
- 清除扩展写入的同页 `localStorage` 项
- 卸载扩展

---

## 10. 政策更新

如果扩展未来对本地数据处理方式做出调整，本隐私政策也会同步更新。

所有更新都会体现在本文件中。
