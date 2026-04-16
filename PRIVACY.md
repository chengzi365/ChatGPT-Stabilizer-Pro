# Privacy Policy

## ChatGPT Stabilizer Pro

ChatGPT Stabilizer Pro is a browser extension designed to improve the stability and responsiveness of very long ChatGPT conversations.

This extension focuses on optimizing page performance while keeping the original ChatGPT page behavior intact.

---

# English Version

## Overview

ChatGPT Stabilizer Pro operates entirely inside the user's browser and does not transmit user data to any external servers.

The extension processes certain information from the currently open ChatGPT page in order to:

- recognize conversation structure
- measure content layout
- detect offscreen content
- optimize long conversation rendering
- provide local diagnostics and debug tools

All processing occurs locally in the browser.

---

## Data Access

To perform its functionality, the extension may read limited information from ChatGPT web pages, including:

- page metadata (such as page title and URL path, which may include a ChatGPT conversation identifier)
- structural summaries of DOM elements
- message container attributes
- limited text snippets from nearby rendered elements (truncated to short lengths)
- user interaction metadata (clicks, focus events, selection events, key names, modifier keys, etc.)
- page structure changes detected through MutationObserver

This information is used solely for page optimization and debugging purposes.

---

## Keyboard and Input Data

The extension does **not read or store the full value typed into input fields**.

For debugging purposes, the extension may record limited input-related metadata, such as input type, key names, modifier keys, and the length of text in a field. Debug logs may also include short, truncated snippets from nearby page elements that are already rendered on the page.

Users should review exported logs before sharing them, especially if debug recording was enabled while typing sensitive information.

---

## Local Processing

All diagnostic data and runtime information are processed **locally within the user's browser**.

The extension:

- does not send data to external servers
- does not upload conversation content
- does not collect analytics
- does not track users

---

## Debug Logs

The extension provides optional debugging tools that can generate debug logs.

These logs may include:

- structural summaries of page elements
- truncated text snippets near interaction targets
- extension runtime events
- page structure change summaries
- keyboard and input metadata, such as key names, modifier keys, input type, and input length

Debug log entries are kept in browser memory by default. They are saved outside the extension only if the user copies them or exports them as a JSON file.

The extension may store the debug recording state locally so recording can resume after a page reload.

---

## Data Export

Users may manually export debug logs as JSON files for troubleshooting purposes.

Exporting debug logs is always **explicitly initiated by the user**.

Before sharing exported logs publicly, users should review them carefully because they may contain limited page information or text fragments from the current page.

---

## Data Storage

The extension uses browser local storage and extension local storage for configuration and runtime settings, such as the selected optimization level, panel position, panel theme, and debug recording state.

The extension does not persist conversation content or debug log entries unless the user manually exports them. Exported files remain wherever the user chooses to save them.

---

## Data Deletion

Users can remove locally stored data at any time by:

- clearing debug logs in the extension panel
- stopping debug recording
- deleting any exported JSON files
- clearing the extension's local storage in the browser
- uninstalling the extension

---

## Third-Party Services

ChatGPT Stabilizer Pro does **not communicate with any external services or APIs**.

It does not use analytics platforms, tracking scripts, or remote logging services.

---

## Permissions

The extension only requests the following browser permission:

`storage`

This permission is used only for saving extension settings locally.

Content scripts run only on the following domains:

- https://chat.openai.com/*
- https://chatgpt.com/*

---

## Changes to This Policy

This privacy policy may be updated if the extension introduces new features or changes how data is processed.

Updates will be reflected in this document.

---

# 中文版本

## 概述

ChatGPT Stabilizer Pro 是一个用于优化超长 ChatGPT 对话页面性能的浏览器扩展。

本扩展所有功能均在用户浏览器本地运行，不会向任何外部服务器发送数据。

扩展会读取当前 ChatGPT 页面中的部分信息，用于：

- 识别对话结构
- 测量页面布局
- 判断离屏内容
- 优化长对话渲染性能
- 提供本地诊断与调试工具

所有处理均在浏览器本地完成。

---

## 数据访问

为了实现上述功能，扩展可能读取 ChatGPT 页面中的部分信息，包括：

- 页面标题和 URL 路径等页面元信息（URL 路径可能包含 ChatGPT 对话标识）
- DOM 元素结构摘要
- 消息容器相关属性
- 附近已显示元素的少量文本摘要（会进行长度截断）
- 用户交互元信息（点击、聚焦、选择、按键名称、修饰键等事件信息）
- 通过 MutationObserver 检测到的页面结构变化

这些信息仅用于页面优化与调试分析。

---

## 键盘与输入数据

本扩展 **不会读取或保存输入框里的完整输入值**。

在某些调试场景中，扩展可能记录与输入相关的有限元信息，例如输入类型、按键名称、修饰键状态和输入长度。调试记录也可能包含页面上已经显示出来的附近元素短文本摘要。

如果在输入敏感信息时开启了调试记录，请在分享导出的文件前仔细检查内容。

---

## 本地处理

所有运行数据和诊断信息均在浏览器本地处理。

本扩展：

- 不向任何服务器发送数据
- 不上传聊天内容
- 不收集统计信息
- 不进行用户追踪

---

## 调试记录

扩展提供可选的调试记录功能，用于排查页面问题。

调试记录可能包含：

- 页面结构摘要
- 交互目标附近的短文本摘要
- 扩展运行事件
- 页面结构变化记录
- 按键名称、修饰键状态、输入类型、输入长度等键盘与输入元信息

调试记录默认仅保存在浏览器运行时内存中。只有在用户主动复制或导出 JSON 文件时，才会保存到扩展之外。

扩展可能会在本地保存调试记录开关状态，以便页面刷新后恢复记录状态。

---

## 数据导出

用户可以在需要时手动导出调试记录 JSON 文件。

数据导出 **始终由用户主动触发**。

在公开分享或提交问题前，请仔细检查导出的文件，避免包含个人对话或敏感信息。

---

## 数据存储

扩展会使用浏览器本地存储和扩展本地存储保存配置与运行状态，例如优化档位、面板位置、面板主题和调试记录开关状态。

扩展不会持久保存聊天内容或调试记录正文，除非用户主动导出文件。导出的文件会保存在用户选择的位置。

---

## 数据删除

用户可以随时通过以下方式删除本地数据：

- 在扩展面板中清空调试记录
- 停止调试记录
- 删除已经导出的 JSON 文件
- 在浏览器中清除扩展本地存储
- 卸载扩展

---

## 第三方服务

ChatGPT Stabilizer Pro **不会连接任何第三方服务器或 API**。

扩展不会使用分析平台、追踪脚本或远程日志服务。

---

## 权限说明

扩展仅请求以下浏览器权限：

`storage`

该权限仅用于保存本地配置。

内容脚本仅在以下域名运行：

- https://chat.openai.com/*
- https://chatgpt.com/*

---

## 政策更新

如果扩展未来功能发生变化，本隐私政策可能会进行更新。

所有更新将体现在本文件中。
