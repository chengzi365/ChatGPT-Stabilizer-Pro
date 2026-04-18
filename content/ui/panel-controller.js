(() => {
  const app = globalThis.__CSP__;
  const config = app.core.config;
  const i18n = app.core.i18n;
  const storage = app.core.storage;
  const { copyText } = app.core.utils;

  const TAB_IDS = app.ui.panelTabIds;
  const createInitialPanelState = app.ui.createInitialPanelState;
  const readStoredPanelViewState = app.ui.readStoredPanelViewState;
  const buildPanelTemplate = app.ui.buildPanelTemplate;
  const panelIconMarkup = app.ui.panelIconMarkup;

  function t(key, params = {}, fallback) {
    return i18n.t(key, params, fallback);
  }

  class ControlPanel {
    constructor(diagnostics) {
      const storedViewState = readStoredPanelViewState();

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
      this.isOpen = storedViewState.isOpen;
      this.isHidden = storedViewState.isHidden;
      this.activeTab = this.normalizeTab(storedViewState.activeTab);
      this.theme = this.normalizeTheme(storedViewState.theme);
      this.panelSize = this.normalizePanelSize(storedViewState.panelSize);
      this.position = this.normalizePosition(
        storedViewState.position,
        this.getFallbackDimensions()
      );
      this.pendingModeAutoScroll = this.activeTab === TAB_IDS[1];
      this.lastAutoScrolledModeId = "";
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
      this.shadow.innerHTML = buildPanelTemplate();

      this.elements.shell = this.shadow.querySelector(".csp-shell");
      this.elements.launcher = this.shadow.querySelector(".launcher");
      this.elements.badge = this.shadow.querySelector(".badge");
      this.elements.badgeDot = this.shadow.querySelector(".dot");
      this.elements.badgeSummary = this.shadow.querySelector(".badge-summary");
      this.elements.panel = this.shadow.querySelector(".panel");
      this.elements.debugBanner = this.shadow.querySelector(".debug-banner");
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
      element.innerHTML = panelIconMarkup(iconName);
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
            if (this.state?.trace?.recording) {
              this.diagnostics.pushEvent(
                "trace",
                "events.traceExportBlockedWhileRecording",
                "info"
              );
              return;
            }

            this.handlers.exportTrace();
            return;
          }

          if (action === "copy") {
            if (this.state?.trace?.recording) {
              this.diagnostics.pushEvent(
                "trace",
                "events.traceCopyBlockedWhileRecording",
                "info"
              );
              return;
            }

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
