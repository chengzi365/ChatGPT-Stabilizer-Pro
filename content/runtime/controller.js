(() => {
  const app = globalThis.__CSP__;
  const config = app.core.config;
  const storage = app.core.storage;
  const capabilities = app.core.capabilities;
  const { formatMode, formatReason } = app.core.runtimeFormatters;

  class Controller {
    constructor() {
      const initialMode = this.loadInitialMode();

      this.registry = new app.dom.MessageRegistry();
      this.baseStyleController = new app.style.BaseStyleController();
      this.modeStyleController = new app.style.ModeStyleController();
      this.diagnostics = app.core.createDiagnosticsStore();
      this.panel = new app.ui.ControlPanel(this.diagnostics);
      this.traceRecorder = null;
      this.traceRecorderInitialized = false;
      this.state = app.runtime.createControllerState({
        targetMode: initialMode.id,
        effectiveMode: initialMode.id,
      });
      this.stateSlices = app.runtime.createControllerStateAccess(this.state);
      this.services = app.runtime.createRuntimeServices(this);
      this.storageUnsubscribe = storage.subscribe((changes, meta) => {
        this.handleStorageChanges(changes, meta);
      });

      this.panel.setHandlers({
        changeLevel: (level) => this.setLevel(level),
        resync: () => this.requestResync("manual-resync"),
        restoreSession: () => this.requestSessionRestore(),
        toggleTrace: () => this.toggleTraceRecording(),
        exportTrace: () => this.downloadTraceRecording(),
        copyTrace: () => this.copyTraceRecording(),
        clearTrace: () => this.clearTraceRecording(),
      });
    }

    init() {
      const startedAt = performance.now();
      this.injectStyleControllers();
      this.captureCapabilities();
      this.syncEffectiveRuntimeLevel();
      this.refreshRuntimeProfile("startup", { force: true });
      this.syncModeStateToDiagnostics();
      this.syncSessionStateToDiagnostics();

      if (this.shouldInitTraceRecorder()) {
        this.initTraceRecorder();
      }

      this.diagnostics.setCapabilities(this.state.runtime.capabilities);
      this.panel.mount();
      this.installRouteWatchers();
      this.installInteractionWatchers();
      this.installLayoutWatchers();
      this.diagnostics.pushEvent("startup", "events.controllerInitialized");
      this.scheduleSync("startup", true);

      this.scheduleRouteFollowups(this.getRouteKey());

      this.diagnostics.setInitDuration(performance.now() - startedAt);
    }

    captureCapabilities() {
      this.state.runtime.capabilities = capabilities.detect();
    }

    setLevel(nextLevel) {
      const runtimeState = this.state.runtime;
      const nextMode = this.selectMode(nextLevel);

      if (!nextMode) {
        this.diagnostics.pushEvent("level", "events.levelUnavailable", "warn", {
          level: formatMode(nextLevel),
        });
        return;
      }

      if (runtimeState.isSwitchingLevel) {
        return;
      }

      if (
        runtimeState.targetMode === nextMode.id &&
        runtimeState.effectiveMode === nextMode.id
      ) {
        return;
      }

      runtimeState.isSwitchingLevel = true;
      const previousMode = runtimeState.targetMode;
      this.applySelectedMode(nextMode.id);
      storage.set(config.storageKeys.level, nextMode.id);
      this.diagnostics.pushEvent("level", "events.levelChanged", "info", {
        previous: formatMode(previousMode),
        next: formatMode(nextMode.id),
      });
      this.scheduleSync("level-change", true);
      runtimeState.isSwitchingLevel = false;
    }

    requestResync(reason) {
      this.refreshRuntimeProfile(reason);
      this.diagnostics.pushEvent("resync", "events.manualResyncRequested", "info", {
        reason: formatReason(reason),
      });
      this.scheduleSync(reason, true);
    }

    requestSessionRestore() {
      const runtimeState = this.state.runtime;
      const activeMode = this.getActiveModeDefinition();

      if (!activeMode || !activeMode.supportsSessionRestore) {
        this.diagnostics.pushEvent("panel", "events.sessionRestoreUnavailable", "warn", {
          mode: formatMode(runtimeState.effectiveMode),
        });
        return;
      }

      this.restoreCurrentSession("manual-restore", {
        forcedModeId: activeMode.fallbackTarget || "standard",
        lock: true,
      });
    }

    sync(reason, isResync) {
      return this.runSyncPipeline(reason, isResync);
    }

    handleStorageChanges(changes, meta = {}) {
      if (!changes || meta.source === "local") {
        return;
      }

      const traceRecordingChange = changes[config.storageKeys.traceRecording];

      if (
        traceRecordingChange &&
        !this.traceRecorder &&
        Boolean(traceRecordingChange.newValue)
      ) {
        this.initTraceRecorder();
      }

      const levelChange = changes[config.storageKeys.level];
      const nextStoredLevel =
        typeof levelChange?.newValue === "string" ? levelChange.newValue : "";

      if (!nextStoredLevel) {
        return;
      }

      const nextMode = this.selectMode(nextStoredLevel);

      if (!nextMode) {
        return;
      }

      const runtimeState = this.state.runtime;

      if (
        runtimeState.isSwitchingLevel ||
        (runtimeState.targetMode === nextMode.id &&
          runtimeState.effectiveMode === nextMode.id)
      ) {
        return;
      }

      this.setLevel(nextMode.id);
    }
  }

  app.runtime.installControllerModules(Controller);

  app.runtime.Controller = Controller;
})();
