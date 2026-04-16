# ChatGPT Stabilizer Pro

<p align="center">
  <a href="./README.md"><strong>中文</strong></a>
</p>

ChatGPT Stabilizer Pro is a desktop browser extension for those very long ChatGPT conversations that slowly turn a smooth page into a sticky, stuttering mess. I built it to ease scrolling lag, typing delay, and tab freezes by optimizing offscreen content and folding history that sits far away from the current view, while keeping ChatGPT's native page behavior as intact as possible.

## Screenshots

| Light mode | Dark mode |
| --- | --- |
| <img src="./img/light.jpg" alt="Control panel in light mode" width="520"> | <img src="./img/dark.jpg" alt="Control panel in dark mode" width="520"> |

## Features

- Recognizes both `chatgpt.com` and `chat.openai.com` by default.
- Offers `Off`, `Monitor`, `Standard`, `Performance`, and other optimization modes you can switch between as needed. More will be added later.
- Adds an in-page control panel for runtime status, optimization stats, diagnostics, and manual refresh.
- Supports local loading in desktop Chrome and Chromium-based browsers with Manifest V3.
- Supports temporary add-on loading in desktop Firefox.
- Currently supports English and Simplified Chinese. The extension loads the matching language pack based on your browser language.

## Local Installation

Download the latest `ChatGPT-Stabilizer-Pro-v*.zip` from GitHub Releases, then unzip it to a folder you can keep around. Local browser loading uses the unzipped folder, not the zip file itself.

### Chrome or Edge

1. Open `chrome://extensions/` or `edge://extensions/`.
2. Turn on `Developer mode`.
3. Click `Load unpacked`.
4. Select the unzipped extension folder. Its top level should contain `manifest.json`.
5. Open or refresh the ChatGPT page.

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click `Load Temporary Add-on`.
3. Select the `manifest.json` file inside the unzipped extension folder.
4. Open or refresh the ChatGPT page.

## Mobile

The current version does not officially support mobile browsers. It is mainly built for desktop browsers.

## Control Panel Buttons

- Copy: Copies the current panel information, useful when reporting an issue.
- Refresh: Manually resyncs the current page state.
- Restore current session: Clears optimization state for the current session and falls back to a safer mode if something unexpected happens.
- Collapse panel: Keeps only the compact panel visible.
- Hide panel: Hides both the full panel and compact panel, leaving only the small badge.

## Control Panel Tabs

The control panel includes several everyday tabs:

- Overview: Check runtime status, target mode, effective mode, optimization rate, and key stats.
- Optimization Level: Switch between `Off`, `Monitor`, `Standard`, `Performance`, and other modes, with a short note and risk hint for each one.
- Chat Stats: Check total messages, content block counts, observed content, optimizable content, optimized content, and the current visible range.
- Performance Metrics: Check initialization, sync, and resync timing, plus folding, restore, and blocking stats in `Performance` mode.
- Recent Events: Review recent extension events, and start debugging, stop debugging, copy logs, or export debug JSON when troubleshooting.

## Optimization Modes

The extension provides several runtime modes. For normal use, start with `Standard`.

### Off

Turns optimization off.

Useful when:

- You are checking whether a problem comes from the extension.
- You want ChatGPT to behave exactly like the original page.
- You need a clean comparison while testing page interactions.

### Monitor

Watches only. Does not optimize.

Useful when:

- You want to check whether page recognition is working.
- You want message counts and diagnostics without changing page behavior.
- You need status data while keeping the page untouched.

### Standard

The recommended default.

It applies conservative optimization to content outside the current viewport. Copying, text selection, link clicks, editing, search, and other native page actions are designed to keep working normally.

Useful for:

- Most long conversations.
- Cases where stability matters more than pushing every last bit of performance.
- Pages with light to moderate scrolling lag.

### Performance

Performance-first mode.

It folds high-benefit history that is far away from the viewport, then restores it when that content gets close again. This mode can help more on extremely long conversations, but the first copy, selection, or click on folded history may need a short restore moment before it feels normal.

Useful for:

- Very long conversations.
- Pages packed with code blocks, tables, Markdown, images, or long text.
- Cases where `Standard` does not reduce enough lag.

Notes:

- Folded history stays in its original position. It is not deleted.
- Content restores automatically when it gets close to the viewport, or when you click, select, or focus it.

### Extreme

A more aggressive optimization strategy than Performance, with stronger optimization results. Coming in the next version. Stay tuned.

## Recommended Use

For everyday use:

1. Start with `Standard`.
2. If the conversation still feels slow, switch to `Performance`.
3. If something looks wrong, switch to `Off` and compare.
4. If you only want status data, use `Monitor`.

When a long conversation is clearly dragging:

1. Open the control panel.
2. Switch to `Performance`.
3. Wait for the optimization status in the panel to settle.

## Permissions and Privacy

Full privacy policy: [PRIVACY.md](./PRIVACY.md#english-version).

This extension only requests the local `storage` permission. It does not send anything out on its own, and its content scripts only run on:

- `https://chat.openai.com/*`
- `https://chatgpt.com/*`

The extension reads the current ChatGPT page DOM to:

- Recognize the conversation structure.
- Count messages.
- Check whether content is outside the viewport.
- Measure content height.
- Estimate content complexity.
- Generate local diagnostics and debug logs.

Diagnostics snapshots and debug logs are only meant to help debug local page issues.
They are stored locally and can only be copied or exported by you.
Before posting them publicly or attaching them to an issue, check them carefully for private conversations, personal data, account details, or anything else sensitive.

## Debug Logs

The `Recent Events` tab in the control panel includes debug logging. It records detailed page-structure changes so a problem can be tracked down instead of guessed at.

Debug logs can record:

- DOM events such as clicks, input, focus, and selection.
- ChatGPT page-structure changes.
- Extension sync start and end events.
- Extension style writes.
- Page snapshots and diffs.

When you run into an unexpected issue:

1. Open the control panel.
2. Go to the `Recent Events` tab.
3. Click `Start debugging`.
4. Reproduce the issue.
5. Click `Stop debugging`.
6. Export JSON or copy JSON manually.

Note: debug logs may include page-structure summaries, short text summaries, and current page state. If you need to send them to someone else, review the files first and remove anything private or sensitive.

## Reporting Issues

When reporting an issue, please include:

- Browser name and version.
- Operating system.
- Current ChatGPT domain.
- Current optimization mode.
- Exact steps that triggered the issue.
- The diagnostics snapshot from the control panel.
- Debug log JSON if needed.

Before submitting diagnostics or debug logs, check them carefully for private conversations, personal data, account details, or anything else sensitive.

One thing I noticed while building this: the ChatGPT web app itself has plenty of rough edges. Some problems may not come from this extension at all. If something breaks, first turn the extension fully off and try the same steps again. If the problem is still there with the extension off, it is probably something that has to be fixed on ChatGPT's side.

## Project Structure

- `content/bootstrap/`: startup entry and namespace initialization.
- `content/core/`: configuration, i18n, logging, storage, diagnostics state, and shared utilities.
- `content/dom/`: ChatGPT page recognition, message discovery, layout measurement, observers, and interaction protection.
- `content/runtime/`: runtime scheduling, mode execution, performance metrics, fallback/recovery, and debug logging.
- `content/modes/`: optimization mode registry and mode implementations.
- `content/ui/`: control panel layout, rendering, subscriptions, and interaction handling.
- `content/style/`: base optimization styles and mode-specific styles.
- `icons/`: extension icons.
- `_locales/`: browser extension localization text.

## License

This project is released under the GPL-3.0-only license. See [LICENSE](LICENSE) for the full license text.
