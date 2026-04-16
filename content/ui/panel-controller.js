(() => {
  const app = globalThis.__CSP__;
  const config = app.core.config;
  const i18n = app.core.i18n;
  const storage = app.core.storage;
  const {
    copyText,
    escapeHtml,
  } = app.core.utils;

  const TAB_IDS = app.ui.panelTabIds;
  const ICONS = {
    copy: `
      <rect x="9" y="9" width="10" height="10" rx="2"></rect>
      <path d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path>
    `,
    resync: `
      <path d="M20 4v6h-6"></path>
      <path d="M4 20v-6h6"></path>
      <path d="M20 10a8 8 0 0 0-14.7-3"></path>
      <path d="M4 14a8 8 0 0 0 14.7 3"></path>
    `,
    restore: `
      <path d="M3 12a9 9 0 1 0 3-6.7"></path>
      <path d="M3 4v5h5"></path>
    `,
    collapse: `
      <path d="m6 15 6-6 6 6"></path>
    `,
    hide: `
      <path d="M3 3l18 18"></path>
      <path d="M10.6 10.5a2 2 0 0 0 2.8 2.8"></path>
      <path d="M9.9 5.2A10.5 10.5 0 0 1 12 5c5.2 0 9.4 3.8 10 7-.2.9-.7 1.8-1.4 2.7"></path>
      <path d="M6.6 6.7C4.6 8 3.3 9.8 3 12c.6 3.2 4.8 7 9 7 1.7 0 3.3-.4 4.7-1.1"></path>
    `,
    show: `
      <path d="M2.8 12c1-4 4.9-7 9.2-7s8.2 3 9.2 7c-1 4-4.9 7-9.2 7s-8.2-3-9.2-7Z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    `,
  };

  function t(key, params = {}, fallback) {
    return i18n.t(key, params, fallback);
  }

  function iconMarkup(name) {
    const iconBody = ICONS[name] || "";

    return `<svg viewBox="0 0 24 24" aria-hidden="true">${iconBody}</svg>`;
  }

  function createInitialPanelState(diagnostics) {
    const initialState = {
      level: config.defaultLevel,
      targetMode: config.defaultLevel,
      effectiveMode: config.defaultLevel,
      availableLevels: [],
      plannedLevels: [],
      modes: [],
      runtimeStatus: "disabled",
      page: {},
      capabilities: {},
      metrics: {},
      fallback: {},
      activity: {},
      session: {},
      trace: {},
      events: [],
    };
    const modeState = diagnostics.getSliceState("modeState");

    if (modeState && typeof modeState === "object") {
      initialState.level = modeState.level || initialState.level;
      initialState.targetMode = modeState.targetMode || initialState.targetMode;
      initialState.effectiveMode = modeState.effectiveMode || initialState.effectiveMode;
      initialState.availableLevels = Array.isArray(modeState.availableLevels)
        ? modeState.availableLevels
        : [];
      initialState.plannedLevels = Array.isArray(modeState.plannedLevels)
        ? modeState.plannedLevels
        : [];
      initialState.modes = Array.isArray(modeState.modes) ? modeState.modes : [];
    }

    initialState.runtimeStatus =
      diagnostics.getSliceState("runtimeStatus") || initialState.runtimeStatus;

    [
      "page",
      "capabilities",
      "metrics",
      "fallback",
      "activity",
      "session",
      "trace",
      "events",
    ].forEach((sliceName) => {
      const sliceState = diagnostics.getSliceState(sliceName);

      if (typeof sliceState !== "undefined") {
        initialState[sliceName] = sliceState;
      }
    });

    return initialState;
  }

  class ControlPanel {
    constructor(diagnostics) {
      this.diagnostics = diagnostics;
      this.host = null;
      this.shadow = null;
      this.elements = {};
      this.handlers = {
        changeLevel: () => {},
        resync: () => {},
        restoreSession: () => {},
        toggleTrace: () => {},
        exportTrace: () => {},
        copyTrace: () => {},
        clearTrace: () => {},
      };
      this.diagnosticsSliceUnsubscribes = new Map();
      this.isSyncingDiagnosticsSubscriptions = false;
      this.immediateRenderScheduled = false;
      this.frameRenderHandle = null;
      this.state = createInitialPanelState(diagnostics);
      this.dirtySections = new Set(app.ui.panelSectionIds || []);
      this.renderTimer = null;
      this.hasRendered = false;
      this.renderCache = Object.create(null);
      this.overlayProgressSession = null;
      this.modeScrollFrame = 0;
      this.pendingModeAutoScroll = this.activeTab === TAB_IDS[1];
      this.lastAutoScrolledModeId = "";
      this.isOpen = storage.get(config.storageKeys.panelOpen, false);
      this.isHidden = storage.get(config.storageKeys.panelHidden, false);
      this.activeTab = this.normalizeTab(storage.get(config.storageKeys.panelTab, TAB_IDS[0]));
      this.theme = this.normalizeTheme(
        storage.get(config.storageKeys.panelTheme, "light")
      );
      this.panelSize = this.normalizePanelSize(
        storage.get(config.storageKeys.panelSize, null)
      );
      this.position = this.normalizePosition(
        storage.get(config.storageKeys.panelPosition, null),
        this.getFallbackDimensions()
      );
      this.dragState = {
        active: false,
        pointerId: null,
        startX: 0,
        startY: 0,
        originLeft: 0,
        originTop: 0,
        moved: false,
        blockClickUntil: 0,
      };
      this.resizeState = {
        active: false,
        pointerId: null,
        startX: 0,
        startY: 0,
        originWidth: 0,
        originHeight: 0,
        moved: false,
      };
      this.positionClampScheduled = false;
      this.storageUnsubscribe = storage.subscribe((changes, meta) => {
        this.handleStorageChanges(changes, meta);
      });
      this.handlePointerMove = this.handlePointerMove.bind(this);
      this.handlePointerUp = this.handlePointerUp.bind(this);
      this.handleResizePointerMove = this.handleResizePointerMove.bind(this);
      this.handleResizePointerUp = this.handleResizePointerUp.bind(this);
      this.handleResize = this.handleResize.bind(this);
    }

    handleStorageChanges(changes, meta = {}) {
      if (!changes || meta.source === "local") {
        return;
      }

      let changed = false;

      if (Object.prototype.hasOwnProperty.call(changes, config.storageKeys.panelOpen)) {
        this.isOpen = Boolean(changes[config.storageKeys.panelOpen].newValue);
        if (this.isOpen && this.activeTab === TAB_IDS[1]) {
          this.pendingModeAutoScroll = true;
        }
        changed = true;
      }

      if (Object.prototype.hasOwnProperty.call(changes, config.storageKeys.panelHidden)) {
        this.isHidden = Boolean(changes[config.storageKeys.panelHidden].newValue);
        changed = true;
      }

      if (Object.prototype.hasOwnProperty.call(changes, config.storageKeys.panelTab)) {
        this.activeTab = this.normalizeTab(
          changes[config.storageKeys.panelTab].newValue
        );
        if (this.activeTab === TAB_IDS[1]) {
          this.pendingModeAutoScroll = true;
        }
        changed = true;
      }

      if (Object.prototype.hasOwnProperty.call(changes, config.storageKeys.panelPosition)) {
        this.position = this.normalizePosition(
          changes[config.storageKeys.panelPosition].newValue,
          this.measureCurrentSize()
        );
        changed = true;
      }

      if (Object.prototype.hasOwnProperty.call(changes, config.storageKeys.panelSize)) {
        this.panelSize = this.normalizePanelSize(
          changes[config.storageKeys.panelSize].newValue
        );
        this.applyPanelSize();
        this.schedulePositionClamp();
        changed = true;
      }

      if (Object.prototype.hasOwnProperty.call(changes, config.storageKeys.panelTheme)) {
        this.theme = this.normalizeTheme(
          changes[config.storageKeys.panelTheme].newValue
        );
        this.applyTheme();
        changed = true;
      }

      if (!changed) {
        return;
      }

      this.clearScheduledRender();
      this.markAllSectionsDirty();
      this.applyPosition();
      this.updateVisibility();
      this.syncDiagnosticsSubscription();

      if (this.isHidden) {
        return;
      }

      this.renderSafely();
    }

    normalizeTab(tab) {
      return TAB_IDS.includes(tab) ? tab : TAB_IDS[0];
    }

    normalizeTheme(theme) {
      return theme === "dark" ? "dark" : "light";
    }

    setHandlers(handlers) {
      this.handlers = {
        ...this.handlers,
        ...handlers,
      };
    }

    mount() {
      if (this.host) {
        return;
      }

      this.host = document.createElement("div");
      this.host.id = config.panel.hostId;
      this.host.style.position = "fixed";
      this.host.style.left = "0px";
      this.host.style.top = "0px";
      this.host.style.zIndex = String(config.panel.zIndex);
      document.documentElement.appendChild(this.host);

      this.shadow = this.host.attachShadow({ mode: "open" });
      this.shadow.innerHTML = this.buildTemplate();

      this.elements.shell = this.shadow.querySelector(".csp-shell");
      this.elements.launcher = this.shadow.querySelector(".launcher");
      this.elements.badge = this.shadow.querySelector(".badge");
      this.elements.badgeDot = this.shadow.querySelector(".dot");
      this.elements.badgeSummary = this.shadow.querySelector(".badge-summary");
      this.elements.panel = this.shadow.querySelector(".panel");
      this.elements.summary = this.shadow.querySelector(".summary");
      this.elements.statsGrid = this.shadow.querySelector(".stats-grid");
      this.elements.tabStrip = this.shadow.querySelector(".tab-strip");
      this.elements.modeGrid = this.shadow.querySelector(".mode-grid");
      this.elements.overlay = this.shadow.querySelector(".panel-overlay");
      this.elements.overlayTitle = this.shadow.querySelector(".panel-overlay-title");
      this.elements.overlayBody = this.shadow.querySelector(".panel-overlay-body");
      this.elements.overlayMeta = this.shadow.querySelector(".panel-overlay-meta");
      this.elements.overlayProgressFill = this.shadow.querySelector(
        ".panel-overlay-progress-fill"
      );
      this.elements.overlayProgressValue = this.shadow.querySelector(
        ".panel-overlay-progress-value"
      );
      this.elements.messageSummary = this.shadow.querySelector("[data-section='message-summary']");
      this.elements.runtime = this.shadow.querySelector("[data-section='runtime']");
      this.elements.messages = this.shadow.querySelector("[data-section='messages']");
      this.elements.impact = this.shadow.querySelector("[data-section='impact']");
      this.elements.performance = this.shadow.querySelector("[data-section='performance']");
      this.elements.fallback = this.shadow.querySelector("[data-section='fallback']");
      this.elements.traceSummary = this.shadow.querySelector("[data-section='trace-summary']");
      this.elements.events = this.shadow.querySelector(".events");
      this.elements.actions = this.shadow.querySelector(".actions");
      this.elements.traceActions = this.shadow.querySelector(".trace-actions");
      this.elements.resizeHandle = this.shadow.querySelector(".panel-resize-handle");
      this.elements.tabPanels = Array.from(this.shadow.querySelectorAll("[data-tab-panel]"));
      this.elements.restoreAction = this.shadow.querySelector("[data-action='restore']");
      this.elements.traceToggle = this.shadow.querySelector("[data-trace-action='toggle']");
      this.elements.traceExport = this.shadow.querySelector("[data-trace-action='export']");
      this.elements.traceCopy = this.shadow.querySelector("[data-trace-action='copy']");
      this.elements.traceClear = this.shadow.querySelector("[data-trace-action='clear']");
      this.elements.themeToggle = this.shadow.querySelector("[data-theme-toggle]");

      this.applyActionIcons();
      this.applyTheme();
      this.applyPanelSize();
      this.applyPosition();
      this.updateVisibility();
      this.installListeners();
      globalThis.addEventListener("resize", this.handleResize);

      this.syncDiagnosticsSubscription();

      if (!this.isHidden) {
        this.renderSafely();
      }
    }

    applyActionIcons() {
      this.setIconButton(
        this.shadow.querySelector("[data-action='copy']"),
        "copy",
        t("panel.actions.copy", {}, "Copy diagnostics")
      );
      this.setIconButton(
        this.shadow.querySelector("[data-action='resync']"),
        "resync",
        t("panel.actions.resync", {}, "Resync")
      );
      this.setIconButton(
        this.shadow.querySelector("[data-action='restore']"),
        "restore",
        t("panel.actions.restoreSession", {}, "Restore current session")
      );
      this.setIconButton(
        this.shadow.querySelector("[data-action='collapse']"),
        "collapse",
        t("panel.actions.collapse", {}, "Collapse panel")
      );
      this.setIconButton(
        this.shadow.querySelector("[data-action='hide']"),
        "hide",
        t("panel.actions.hide", {}, "Hide panel")
      );
      this.setIconButton(
        this.elements.launcher,
        "show",
        t("panel.actions.show", {}, "Show panel")
      );
    }

    applyTheme() {
      const theme = this.normalizeTheme(this.theme);

      this.theme = theme;

      if (this.elements.shell) {
        this.elements.shell.dataset.theme = theme;
      }

      this.updateThemeToggle();
    }

    updateThemeToggle() {
      const button = this.elements.themeToggle;

      if (!button) {
        return;
      }

      const isDark = this.theme === "dark";
      const label = isDark
        ? t("panel.actions.lightMode", {}, "Light")
        : t("panel.actions.darkMode", {}, "Dark");

      button.textContent = label;
      button.title = label;
      button.setAttribute("aria-label", label);
      button.dataset.theme = this.theme;
    }

    toggleTheme() {
      this.theme = this.theme === "dark" ? "light" : "dark";
      this.applyTheme();
      storage.set(config.storageKeys.panelTheme, this.theme);
    }

    setIconButton(element, iconName, label) {
      element.innerHTML = iconMarkup(iconName);
      element.title = label;
      element.setAttribute("aria-label", label);
    }

    installListeners() {
      this.elements.badge.addEventListener("click", () => {
        if (!this.shouldIgnoreClick()) {
          this.setOpen(!this.isOpen);
        }
      });

      this.elements.launcher.addEventListener("click", () => {
        if (!this.shouldIgnoreClick()) {
          this.setHidden(false, true);
        }
      });

      if (this.elements.themeToggle) {
        this.elements.themeToggle.addEventListener("click", () => {
          this.toggleTheme();
        });
      }

      this.elements.actions.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-action]");

        if (!button) {
          return;
        }

        const action = button.dataset.action;

        if (action === "copy") {
          const copied = await copyText(this.diagnostics.buildSnapshotText());
          this.diagnostics.pushEvent(
            "panel",
            copied ? "events.copyDiagnosticsSuccess" : "events.copyDiagnosticsFailure",
            copied ? "info" : "warn"
          );
          return;
        }

        if (action === "resync") {
          this.handlers.resync();
          return;
        }

        if (action === "restore") {
          this.handlers.restoreSession();
          return;
        }

        if (action === "collapse") {
          this.setOpen(false);
          return;
        }

        if (action === "hide") {
          this.setHidden(true, false);
        }
      });

      if (this.elements.traceActions) {
        this.elements.traceActions.addEventListener("click", async (event) => {
          const button = event.target.closest("[data-trace-action]");

          if (!button) {
            return;
          }

          const action = button.dataset.traceAction;

          if (action === "toggle") {
            this.handlers.toggleTrace();
            return;
          }

          if (action === "export") {
            this.handlers.exportTrace();
            return;
          }

          if (action === "copy") {
            await this.handlers.copyTrace();
            return;
          }

          if (action === "clear") {
            this.handlers.clearTrace();
          }
        });
      }

      this.elements.tabStrip.addEventListener("click", (event) => {
        const button = event.target.closest("[data-tab]");

        if (button && button.dataset.tab) {
          this.setActiveTab(button.dataset.tab);
        }
      });

      this.elements.modeGrid.addEventListener("click", (event) => {
        const button = event.target.closest(".mode-btn");

        if (button && !button.disabled && button.dataset.level) {
          this.handlers.changeLevel(button.dataset.level);
        }
      });

      this.shadow.querySelectorAll("[data-drag-handle]").forEach((element) => {
        element.addEventListener("pointerdown", (event) => this.handlePointerDown(event));
      });

      if (this.elements.resizeHandle) {
        this.elements.resizeHandle.addEventListener("pointerdown", (event) =>
          this.handleResizePointerDown(event)
        );
      }
    }

    shouldIgnoreClick() {
      return Date.now() < this.dragState.blockClickUntil;
    }

    handlePointerDown(event) {
      if (event.button !== 0) {
        return;
      }

      if (
        event.currentTarget.dataset.dragHandle === "header" &&
        event.target.closest("[data-no-drag='true']")
      ) {
        return;
      }

      this.dragState.active = true;
      this.dragState.pointerId = event.pointerId;
      this.dragState.startX = event.clientX;
      this.dragState.startY = event.clientY;
      this.dragState.originLeft = this.position.left;
      this.dragState.originTop = this.position.top;
      this.dragState.moved = false;

      globalThis.addEventListener("pointermove", this.handlePointerMove);
      globalThis.addEventListener("pointerup", this.handlePointerUp, true);
      globalThis.addEventListener("pointercancel", this.handlePointerUp, true);
      event.preventDefault();
    }

    handlePointerMove(event) {
      if (!this.dragState.active || event.pointerId !== this.dragState.pointerId) {
        return;
      }

      const deltaX = event.clientX - this.dragState.startX;
      const deltaY = event.clientY - this.dragState.startY;

      if (
        !this.dragState.moved &&
        Math.hypot(deltaX, deltaY) >= config.panel.dragThresholdPx
      ) {
        this.dragState.moved = true;
      }

      if (!this.dragState.moved) {
        return;
      }

      this.position = this.normalizePosition(
        {
          left: this.dragState.originLeft + deltaX,
          top: this.dragState.originTop + deltaY,
        },
        this.measureCurrentSize()
      );
      this.applyPosition();
      event.preventDefault();
    }

    handlePointerUp(event) {
      if (!this.dragState.active || event.pointerId !== this.dragState.pointerId) {
        return;
      }

      const moved = this.dragState.moved;

      this.dragState.active = false;
      this.dragState.pointerId = null;
      this.dragState.moved = false;
      globalThis.removeEventListener("pointermove", this.handlePointerMove);
      globalThis.removeEventListener("pointerup", this.handlePointerUp, true);
      globalThis.removeEventListener("pointercancel", this.handlePointerUp, true);

      if (moved) {
        this.persistPosition();
        this.dragState.blockClickUntil = Date.now() + 200;
      }
    }

    handleResizePointerDown(event) {
      if (event.button !== 0 || !this.isOpen || this.isHidden) {
        return;
      }

      this.resizeState.active = true;
      this.resizeState.pointerId = event.pointerId;
      this.resizeState.startX = event.clientX;
      this.resizeState.startY = event.clientY;
      this.resizeState.originWidth = this.panelSize.width;
      this.resizeState.originHeight = this.panelSize.height;
      this.resizeState.moved = false;

      globalThis.addEventListener("pointermove", this.handleResizePointerMove);
      globalThis.addEventListener("pointerup", this.handleResizePointerUp, true);
      globalThis.addEventListener("pointercancel", this.handleResizePointerUp, true);
      event.preventDefault();
    }

    handleResizePointerMove(event) {
      if (!this.resizeState.active || event.pointerId !== this.resizeState.pointerId) {
        return;
      }

      const deltaX = event.clientX - this.resizeState.startX;
      const deltaY = event.clientY - this.resizeState.startY;

      if (
        !this.resizeState.moved &&
        Math.hypot(deltaX, deltaY) >= config.panel.dragThresholdPx
      ) {
        this.resizeState.moved = true;
      }

      if (!this.resizeState.moved) {
        return;
      }

      const nextSize = this.normalizePanelSize({
        width: this.resizeState.originWidth + deltaX,
        height: this.resizeState.originHeight + deltaY,
      });

      if (
        nextSize.width === this.panelSize.width &&
        nextSize.height === this.panelSize.height
      ) {
        return;
      }

      this.panelSize = nextSize;
      this.applyPanelSize();
      this.position = this.normalizePosition(
        this.position,
        this.getHostDimensionsForPanelSize(nextSize)
      );
      this.applyPosition();
      event.preventDefault();
    }

    handleResizePointerUp(event) {
      if (!this.resizeState.active || event.pointerId !== this.resizeState.pointerId) {
        return;
      }

      const moved = this.resizeState.moved;

      this.resizeState.active = false;
      this.resizeState.pointerId = null;
      this.resizeState.moved = false;
      globalThis.removeEventListener("pointermove", this.handleResizePointerMove);
      globalThis.removeEventListener("pointerup", this.handleResizePointerUp, true);
      globalThis.removeEventListener("pointercancel", this.handleResizePointerUp, true);

      if (moved) {
        this.persistPanelSize();
        this.persistPosition();
      }
    }

    buildTemplate() {
      return `
<style>
  :host{all:initial}
  .csp-shell{display:grid;gap:10px;justify-items:end;width:max-content;font-family:"Segoe UI","Helvetica Neue",Arial,sans-serif;color:#111827}
  button{font:inherit;cursor:pointer}
  svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
  .launcher,.badge{border:1px solid rgba(15,23,42,.12);background:rgba(255,255,255,.96);box-shadow:0 12px 32px rgba(15,23,42,.16);backdrop-filter:blur(14px)}
  .launcher{display:none;align-items:center;justify-content:center;width:44px;height:44px;border-radius:14px;color:#0f766e;cursor:grab}
  .badge{display:flex;align-items:center;gap:8px;min-width:196px;padding:10px 12px;border-radius:14px;color:#0f172a;cursor:grab}
  .badge:active,.launcher:active,.panel-header:active{cursor:grabbing}
  .dot{width:10px;height:10px;border-radius:999px;background:#94a3b8;flex:none}
  .dot[data-status="active"]{background:#0f766e}
  .dot[data-status="fallback"]{background:#d97706}
  .dot[data-status="degraded"]{background:#b91c1c}
  .dot[data-status="error"]{background:#7f1d1d}
  .badge-text{display:grid;gap:2px;min-width:0}
  .badge-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em}
  .badge-summary{font-size:12px;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .panel{position:relative;display:none;gap:12px;width:392px;height:520px;padding:16px;border:1px solid rgba(15,23,42,.12);border-radius:18px;background:rgba(255,255,255,.98);box-shadow:0 20px 44px rgba(15,23,42,.18);backdrop-filter:blur(16px);overflow:hidden;grid-template-rows:auto auto auto auto minmax(0,1fr) auto}
  .panel-header{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;cursor:grab;user-select:none}
  .title-wrap{display:grid;gap:3px;min-width:0;flex:1 1 auto}
  .title{font-size:16px;font-weight:800}
  .subtitle{font-size:12px;color:#475569;line-height:1.45;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .summary{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center;padding:14px 16px;border-radius:16px;background:linear-gradient(180deg,#f8fafc 0%,#eef6f5 100%);border:1px solid rgba(15,23,42,.08)}
  .summary-indicator{display:grid;gap:8px;min-width:0}
  .summary-label{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.08em}
  .summary-level-row{display:flex;align-items:center;gap:10px;min-width:0}
  .summary-level-dot{width:12px;height:12px;border-radius:999px;background:#94a3b8;flex:none;box-shadow:0 0 0 4px rgba(148,163,184,.12)}
  .summary-level-dot[data-status="active"]{background:#0f766e;box-shadow:0 0 0 4px rgba(15,118,110,.14)}
  .summary-level-dot[data-status="fallback"]{background:#d97706;box-shadow:0 0 0 4px rgba(217,119,6,.14)}
  .summary-level-dot[data-status="degraded"]{background:#b91c1c;box-shadow:0 0 0 4px rgba(185,28,28,.14)}
  .summary-level-dot[data-status="error"]{background:#7f1d1d;box-shadow:0 0 0 4px rgba(127,29,29,.14)}
  .summary-level-text{font-size:20px;font-weight:800;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .summary-level-text-wrap{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}
  .summary-chip{display:inline-flex;align-items:center;padding:4px 9px;border-radius:999px;background:#fff;border:1px solid rgba(15,23,42,.08);font-size:11px;font-weight:700;color:#334155}
  .summary-rate{display:grid;gap:4px;justify-items:end;text-align:right}
  .summary-rate-label{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.08em}
  .summary-rate-value{font-size:28px;font-weight:900;line-height:1;color:#0f766e}
  .summary[data-status="fallback"] .summary-rate-value{color:#d97706}
  .summary[data-status="degraded"] .summary-rate-value,
  .summary[data-status="error"] .summary-rate-value{color:#b91c1c}
  .summary[data-status="disabled"] .summary-rate-value{color:#64748b}
  .actions{display:flex;gap:6px;flex:none}
  .icon-btn,.mode-btn,.tab-btn,.trace-btn{border:1px solid rgba(15,23,42,.12);background:#fff;color:#0f172a;transition:transform .12s ease,background .12s ease,border-color .12s ease}
  .icon-btn:hover,.mode-btn:hover,.tab-btn:hover,.trace-btn:hover{transform:translateY(-1px);border-color:rgba(15,23,42,.24);background:#f8fafc}
  .icon-btn:disabled,.mode-btn:disabled,.tab-btn:disabled,.trace-btn:disabled{cursor:not-allowed;opacity:.55;transform:none}
  .icon-btn{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9px;padding:0}
  .stats-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .stat-card{display:grid;gap:4px;padding:10px 12px;border-radius:14px;background:linear-gradient(180deg,#fff 0%,#f8fafc 100%);border:1px solid rgba(15,23,42,.08)}
  .stat-label{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.06em}
  .stat-value{font-size:18px;font-weight:800;color:#0f172a}
  .tab-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(72px,1fr));gap:8px}
  .tab-btn{border-radius:10px;padding:8px 10px;font-size:12px;font-weight:700;line-height:1.25;min-height:40px}
  .tab-btn[data-active="true"]{border-color:#0f766e;background:rgba(15,118,110,.08);color:#0f766e}
  .tab-panels{display:grid;min-height:0;height:100%;align-self:stretch;overflow:hidden}
  .tab-panel{display:none;min-height:0;height:100%;max-height:100%;overflow:auto;overscroll-behavior:contain;padding-right:2px}
  .tab-panel{scrollbar-width:thin;scrollbar-color:rgba(100,116,139,.72) transparent}
  .tab-panel::-webkit-scrollbar{width:10px;height:10px}
  .tab-panel::-webkit-scrollbar-track{background:transparent;border-radius:999px}
  .tab-panel::-webkit-scrollbar-thumb{border:2px solid transparent;border-radius:999px;background:rgba(100,116,139,.58);background-clip:padding-box}
  .tab-panel::-webkit-scrollbar-thumb:hover{background:rgba(71,85,105,.72);background-clip:padding-box}
  .tab-panel::-webkit-scrollbar-corner{background:transparent}
  .tab-panel[data-active="true"]{display:grid;gap:10px;align-content:start}
  .section{display:grid;gap:8px;padding:12px 14px;border-radius:14px;background:#fff;border:1px solid rgba(15,23,42,.08)}
  .section-title{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#0f172a}
  .trace-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .trace-btn{border-radius:10px;padding:8px 10px;font-size:12px;font-weight:700;line-height:1.25;min-height:40px}
  .trace-btn[data-recording="true"]{border-color:#0f766e;background:rgba(15,118,110,.08);color:#0f766e}
  .mode-grid{display:grid;gap:8px}
  .mode-btn{display:grid;gap:4px;width:100%;border-radius:12px;padding:10px 12px;text-align:left}
  .mode-btn[data-active="true"]{border-color:#0f766e;background:rgba(15,118,110,.06)}
  .mode-top{display:flex;justify-content:space-between;align-items:center;gap:8px;font-weight:700;font-size:12px}
  .risk-tag{font-size:11px;color:#7c2d12;background:#fff7ed;padding:2px 6px;border-radius:999px}
  .risk-tag[data-risk="none"]{color:#166534;background:#f0fdf4}
  .risk-tag[data-risk="very-low"]{color:#065f46;background:#ecfdf5}
  .risk-tag[data-risk="low"]{color:#0f766e;background:#f0fdfa}
  .risk-tag[data-risk="medium"]{color:#9a3412;background:#fff7ed}
  .risk-tag[data-risk="high"]{color:#991b1b;background:#fef2f2}
  .mode-desc{font-size:12px;color:#475569;line-height:1.45}
  .mode-risk{font-size:11px;color:#7c2d12;line-height:1.4}
  .kv{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 12px;align-items:center;font-size:12px}
  .kv div:nth-child(odd){color:#475569}
  .kv div:nth-child(even){font-weight:700;color:#0f172a;text-align:right}
  .events{display:grid;gap:8px;font-size:12px}
  .event{display:grid;gap:2px;padding:8px 10px;border-radius:10px;background:#f8fafc}
  .event-time{color:#64748b;font-size:11px}
  .event-detail{color:#0f172a;line-height:1.45}
  .panel-overlay{position:absolute;inset:0;display:grid;place-items:center;padding:20px;border-radius:inherit;background:linear-gradient(180deg,rgba(246,250,252,.62) 0%,rgba(238,247,246,.76) 100%);backdrop-filter:blur(18px) saturate(135%);opacity:0;visibility:hidden;pointer-events:none;transition:opacity .18s ease,visibility .18s ease;z-index:5;overflow:hidden}
  .panel-overlay[data-active="true"]{opacity:1;visibility:visible;pointer-events:auto}
  .panel-overlay::before,.panel-overlay::after{content:"";position:absolute;border-radius:999px;filter:blur(6px);opacity:.55;animation:overlayFloat 5.8s ease-in-out infinite}
  .panel-overlay::before{width:176px;height:176px;top:-42px;right:-28px;background:radial-gradient(circle at 30% 30%,rgba(15,118,110,.22),rgba(15,118,110,0) 72%)}
  .panel-overlay::after{width:150px;height:150px;bottom:-34px;left:-22px;background:radial-gradient(circle at 65% 35%,rgba(14,165,233,.18),rgba(14,165,233,0) 74%);animation-delay:-2.1s}
  .panel-overlay-card{position:relative;display:grid;justify-items:center;gap:12px;width:min(100%,248px);padding:18px 18px 16px;border:1px solid rgba(255,255,255,.55);border-radius:20px;background:linear-gradient(180deg,rgba(255,255,255,.58) 0%,rgba(255,255,255,.34) 100%);box-shadow:0 18px 38px rgba(15,23,42,.12),inset 0 1px 0 rgba(255,255,255,.62)}
  .panel-overlay-loader{position:relative;display:grid;place-items:center;width:74px;height:74px}
  .panel-overlay-loader::before,.panel-overlay-loader::after{content:"";position:absolute;border-radius:999px}
  .panel-overlay-loader::before{inset:7px;border:1px solid rgba(15,118,110,.18);background:radial-gradient(circle at 35% 35%,rgba(255,255,255,.92),rgba(255,255,255,.28) 72%)}
  .panel-overlay-loader::after{inset:0;border:1px solid rgba(15,23,42,.08);background:conic-gradient(from 180deg,rgba(15,118,110,.05),rgba(15,118,110,.42),rgba(14,165,233,.14),rgba(15,118,110,.05));mask:radial-gradient(farthest-side,transparent calc(100% - 7px),#000 0);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 7px),#000 0);animation:overlaySpin 1.15s linear infinite}
  .panel-overlay-core{position:relative;width:26px;height:26px;border-radius:999px;background:radial-gradient(circle at 32% 32%,#ffffff 0%,#d7f6f1 36%,#0f766e 100%);box-shadow:0 0 0 7px rgba(15,118,110,.08),0 8px 18px rgba(15,118,110,.18);animation:overlayPulse 1.7s ease-in-out infinite}
  .panel-overlay-dots{display:flex;align-items:center;gap:6px}
  .panel-overlay-dots span{width:7px;height:7px;border-radius:999px;background:linear-gradient(180deg,#0f766e,#14b8a6);opacity:.28;animation:overlayDots 1.15s ease-in-out infinite}
  .panel-overlay-dots span:nth-child(2){animation-delay:.15s}
  .panel-overlay-dots span:nth-child(3){animation-delay:.3s}
  .panel-overlay-title{font-size:15px;font-weight:800;color:#0f172a;text-align:center;letter-spacing:.01em}
  .panel-overlay-body{font-size:12px;line-height:1.6;color:#475569;text-align:center}
  .panel-overlay-progress{display:grid;gap:6px;justify-items:center;width:min(100%,186px)}
  .panel-overlay-progress-track{position:relative;width:100%;height:9px;border-radius:999px;background:rgba(226,232,240,.88);box-shadow:inset 0 1px 2px rgba(15,23,42,.08);overflow:hidden}
  .panel-overlay-progress-fill{height:100%;width:0;border-radius:inherit;background:linear-gradient(90deg,#0f766e 0%,#14b8a6 58%,#7dd3fc 100%);box-shadow:0 4px 14px rgba(20,184,166,.28);transition:width .22s ease}
  .panel-overlay-progress-value{font-size:12px;font-weight:800;letter-spacing:.02em;color:#0f172a}
  .panel-overlay-meta{min-height:18px;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#0f766e;text-align:center}
  .panel-resize-handle{position:absolute;right:8px;bottom:8px;width:18px;height:18px;border-radius:8px;display:grid;place-items:center;background:linear-gradient(180deg,rgba(255,255,255,.96) 0%,rgba(241,245,249,.92) 100%);border:1px solid rgba(15,23,42,.08);box-shadow:0 6px 16px rgba(15,23,42,.08);cursor:nwse-resize;touch-action:none;user-select:none;z-index:6}
  .panel-resize-handle::before{content:"";width:10px;height:10px;background:
    linear-gradient(135deg,transparent 0 42%,rgba(15,23,42,.34) 42% 52%,transparent 52% 100%),
    linear-gradient(135deg,transparent 0 64%,rgba(15,23,42,.22) 64% 74%,transparent 74% 100%);
    opacity:.92}
  .panel-footer{display:flex;align-items:center;justify-content:center;gap:6px;padding:2px 28px 0 4px;font-size:11px;line-height:1.4;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .theme-toggle{display:inline-flex;align-items:center;justify-content:center;min-width:58px;height:22px;padding:0 8px;border:1px solid rgba(15,23,42,.12);border-radius:8px;background:#fff;color:#0f766e;font-size:11px;font-weight:800;line-height:1;cursor:pointer}
  .theme-toggle:hover{background:#f8fafc;border-color:rgba(15,23,42,.24)}
  .csp-shell[data-theme="dark"]{color:#f3f4f6}
  .csp-shell[data-theme="dark"] .launcher,
  .csp-shell[data-theme="dark"] .badge{border-color:rgba(229,231,235,.14);background:rgba(24,26,27,.96);box-shadow:0 12px 32px rgba(0,0,0,.34)}
  .csp-shell[data-theme="dark"] .launcher{color:#5eead4}
  .csp-shell[data-theme="dark"] .badge{color:#f3f4f6}
  .csp-shell[data-theme="dark"] .badge-summary,
  .csp-shell[data-theme="dark"] .subtitle,
  .csp-shell[data-theme="dark"] .summary-label,
  .csp-shell[data-theme="dark"] .summary-rate-label,
  .csp-shell[data-theme="dark"] .stat-label,
  .csp-shell[data-theme="dark"] .kv div:nth-child(odd),
  .csp-shell[data-theme="dark"] .event-time,
  .csp-shell[data-theme="dark"] .mode-desc,
  .csp-shell[data-theme="dark"] .panel-overlay-body,
  .csp-shell[data-theme="dark"] .panel-footer{color:#a8b0b8}
  .csp-shell[data-theme="dark"] .panel{border-color:rgba(229,231,235,.12);background:rgba(18,19,20,.98);box-shadow:0 20px 44px rgba(0,0,0,.42)}
  .csp-shell[data-theme="dark"] .summary{border-color:rgba(229,231,235,.1);background:linear-gradient(180deg,#202324 0%,#181a1b 100%)}
  .csp-shell[data-theme="dark"] .summary-level-text,
  .csp-shell[data-theme="dark"] .stat-value,
  .csp-shell[data-theme="dark"] .section-title,
  .csp-shell[data-theme="dark"] .kv div:nth-child(even),
  .csp-shell[data-theme="dark"] .event-detail,
  .csp-shell[data-theme="dark"] .panel-overlay-title,
  .csp-shell[data-theme="dark"] .panel-overlay-progress-value{color:#f8fafc}
  .csp-shell[data-theme="dark"] .summary-chip,
  .csp-shell[data-theme="dark"] .stat-card,
  .csp-shell[data-theme="dark"] .section,
  .csp-shell[data-theme="dark"] .event{border-color:rgba(229,231,235,.1);background:#202324;color:#f3f4f6}
  .csp-shell[data-theme="dark"] .tab-panel{scrollbar-color:rgba(156,163,175,.72) #181a1b}
  .csp-shell[data-theme="dark"] .tab-panel::-webkit-scrollbar-track{background:#181a1b}
  .csp-shell[data-theme="dark"] .tab-panel::-webkit-scrollbar-thumb{border-color:#181a1b;background:rgba(156,163,175,.58);background-clip:padding-box}
  .csp-shell[data-theme="dark"] .tab-panel::-webkit-scrollbar-thumb:hover{background:rgba(209,213,219,.72);background-clip:padding-box}
  .csp-shell[data-theme="dark"] .tab-panel::-webkit-scrollbar-corner{background:#181a1b}
  .csp-shell[data-theme="dark"] .icon-btn,
  .csp-shell[data-theme="dark"] .mode-btn,
  .csp-shell[data-theme="dark"] .tab-btn,
  .csp-shell[data-theme="dark"] .trace-btn,
  .csp-shell[data-theme="dark"] .theme-toggle{border-color:rgba(229,231,235,.12);background:#202324;color:#f3f4f6}
  .csp-shell[data-theme="dark"] .icon-btn:hover,
  .csp-shell[data-theme="dark"] .mode-btn:hover,
  .csp-shell[data-theme="dark"] .tab-btn:hover,
  .csp-shell[data-theme="dark"] .trace-btn:hover,
  .csp-shell[data-theme="dark"] .theme-toggle:hover{border-color:rgba(94,234,212,.34);background:#2b2f31}
  .csp-shell[data-theme="dark"] .tab-btn[data-active="true"],
  .csp-shell[data-theme="dark"] .mode-btn[data-active="true"],
  .csp-shell[data-theme="dark"] .trace-btn[data-recording="true"]{border-color:#5eead4;background:rgba(45,212,191,.12);color:#99f6e4}
  .csp-shell[data-theme="dark"] .summary-rate-value,
  .csp-shell[data-theme="dark"] .panel-overlay-meta{color:#5eead4}
  .csp-shell[data-theme="dark"] .mode-risk{color:#fbbf24}
  .csp-shell[data-theme="dark"] .risk-tag{color:#fdba74;background:rgba(251,146,60,.13)}
  .csp-shell[data-theme="dark"] .risk-tag[data-risk="none"],
  .csp-shell[data-theme="dark"] .risk-tag[data-risk="very-low"]{color:#86efac;background:rgba(34,197,94,.13)}
  .csp-shell[data-theme="dark"] .risk-tag[data-risk="low"]{color:#5eead4;background:rgba(20,184,166,.13)}
  .csp-shell[data-theme="dark"] .risk-tag[data-risk="high"]{color:#fca5a5;background:rgba(239,68,68,.14)}
  .csp-shell[data-theme="dark"] .panel-overlay{background:linear-gradient(180deg,rgba(24,26,27,.68) 0%,rgba(18,19,20,.84) 100%)}
  .csp-shell[data-theme="dark"] .panel-overlay-card{border-color:rgba(229,231,235,.13);background:linear-gradient(180deg,rgba(32,35,36,.74) 0%,rgba(24,26,27,.58) 100%);box-shadow:0 18px 38px rgba(0,0,0,.32),inset 0 1px 0 rgba(255,255,255,.08)}
  .csp-shell[data-theme="dark"] .panel-overlay-loader::before{border-color:rgba(94,234,212,.2);background:radial-gradient(circle at 35% 35%,rgba(255,255,255,.18),rgba(255,255,255,.04) 72%)}
  .csp-shell[data-theme="dark"] .panel-overlay-progress-track{background:rgba(75,85,99,.72)}
  .csp-shell[data-theme="dark"] .panel-resize-handle{border-color:rgba(229,231,235,.12);background:linear-gradient(180deg,rgba(43,47,49,.96) 0%,rgba(32,35,36,.92) 100%);box-shadow:0 6px 16px rgba(0,0,0,.24)}
  .csp-shell[data-theme="dark"] .panel-resize-handle::before{background:
    linear-gradient(135deg,transparent 0 42%,rgba(229,231,235,.48) 42% 52%,transparent 52% 100%),
    linear-gradient(135deg,transparent 0 64%,rgba(229,231,235,.32) 64% 74%,transparent 74% 100%)}
  @keyframes overlaySpin{to{transform:rotate(360deg)}}
  @keyframes overlayPulse{0%,100%{transform:scale(.94)}50%{transform:scale(1.04)}}
  @keyframes overlayDots{0%,100%{transform:translateY(0);opacity:.24}50%{transform:translateY(-4px);opacity:1}}
  @keyframes overlayFloat{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(0,8px,0)}}
  @media (max-width:640px){.panel-header{flex-direction:column;align-items:stretch}.actions{justify-content:flex-end}.summary{grid-template-columns:1fr}.summary-rate{justify-items:start;text-align:left}.tab-strip{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
<div class="csp-shell">
  <button class="launcher" type="button" data-drag-handle="launcher"></button>
  <button class="badge" type="button" data-drag-handle="badge">
    <span class="dot" data-status="disabled"></span>
    <span class="badge-text">
      <span class="badge-title">${escapeHtml(t("panel.badgeTitle"))}</span>
      <span class="badge-summary">${escapeHtml(t("panel.badgeWaiting"))}</span>
    </span>
  </button>
  <div class="panel">
    <div class="panel-overlay" data-active="false">
      <div class="panel-overlay-card">
        <div class="panel-overlay-loader" aria-hidden="true">
          <div class="panel-overlay-core"></div>
        </div>
        <div class="panel-overlay-dots" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div class="panel-overlay-title"></div>
        <div class="panel-overlay-body"></div>
        <div class="panel-overlay-progress">
          <div class="panel-overlay-progress-track">
            <div class="panel-overlay-progress-fill"></div>
          </div>
          <div class="panel-overlay-progress-value"></div>
        </div>
        <div class="panel-overlay-meta"></div>
      </div>
    </div>
    <div class="panel-header" data-drag-handle="header">
      <div class="title-wrap">
        <div class="title">${escapeHtml(t("panel.title"))}</div>
        <div class="subtitle">${escapeHtml(t("panel.subtitle"))}</div>
      </div>
      <div class="actions">
        <button class="icon-btn" data-action="copy" data-no-drag="true" type="button"></button>
        <button class="icon-btn" data-action="resync" data-no-drag="true" type="button"></button>
        <button class="icon-btn" data-action="restore" data-no-drag="true" type="button"></button>
        <button class="icon-btn" data-action="collapse" data-no-drag="true" type="button"></button>
        <button class="icon-btn" data-action="hide" data-no-drag="true" type="button"></button>
      </div>
    </div>
    <div class="summary"></div>
    <div class="stats-grid"></div>
    <div class="tab-strip"></div>
    <div class="tab-panels">
      <div class="tab-panel" data-tab-panel="overview">
        <div class="section">
          <div class="section-title">${escapeHtml(t("panel.sections.runtime"))}</div>
          <div class="kv" data-section="runtime"></div>
        </div>
        <div class="section">
          <div class="section-title">${escapeHtml(t("panel.sections.impact"))}</div>
          <div class="kv" data-section="impact"></div>
        </div>
      </div>
      <div class="tab-panel" data-tab-panel="mode">
        <div class="section">
          <div class="section-title">${escapeHtml(t("panel.sections.mode"))}</div>
          <div class="mode-grid"></div>
        </div>
      </div>
      <div class="tab-panel" data-tab-panel="messages">
        <div class="section">
          <div class="section-title">${escapeHtml(t("panel.sections.messages"))}</div>
          <div class="kv" data-section="message-summary"></div>
        </div>
        <div class="section">
          <div class="section-title">${escapeHtml(t("panel.sections.units", {}, "Content Blocks"))}</div>
          <div class="kv" data-section="messages"></div>
        </div>
      </div>
      <div class="tab-panel" data-tab-panel="performance">
        <div class="section">
          <div class="section-title">${escapeHtml(t("panel.sections.performance"))}</div>
          <div class="kv" data-section="performance"></div>
        </div>
        <div class="section">
          <div class="section-title">${escapeHtml(t("panel.sections.fallback"))}</div>
          <div class="kv" data-section="fallback"></div>
        </div>
      </div>
      <div class="tab-panel" data-tab-panel="events">
        <div class="section">
          <div class="section-title">${escapeHtml(t("panel.sections.trace", {}, "Trace Recorder"))}</div>
          <div class="kv" data-section="trace-summary"></div>
          <div class="trace-actions">
            <button class="trace-btn" data-trace-action="toggle" type="button"></button>
            <button class="trace-btn" data-trace-action="export" type="button"></button>
            <button class="trace-btn" data-trace-action="copy" type="button"></button>
            <button class="trace-btn" data-trace-action="clear" type="button"></button>
          </div>
        </div>
        <div class="section">
          <div class="section-title">${escapeHtml(t("panel.sections.events"))}</div>
          <div class="events"></div>
        </div>
      </div>
    </div>
    <div class="panel-footer">
      <button class="theme-toggle" data-theme-toggle type="button"></button>
      <span>·</span>
      <span>v${escapeHtml(app.version)}</span>
      <span>·</span>
      <span>GPL-3.0</span>
    </div>
    <div class="panel-resize-handle"></div>
  </div>
</div>`;
    }

  }

  Object.assign(
    ControlPanel.prototype,
    app.ui.panelLayoutMethods,
    app.ui.panelSubscriptionMethods,
    app.ui.panelOverlayMethods,
    app.ui.panelSectionRenderMethods,
    app.ui.panelRenderMethods
  );

  app.ui.ControlPanel = ControlPanel;
})();
