(() => {
  const app = globalThis.__CSP__;
  const config = app.core.config;
  const storage = app.core.storage;

  function createEmptyModeStrategySession() {
    return app.runtime.createModeSessionsMap();
  }

  function normalizeModeStrategySession(sessionState) {
    return sessionState && typeof sessionState === "object"
      ? sessionState
      : createEmptyModeStrategySession();
  }

  function modeUsesStrategySession(mode) {
    return Boolean(
      mode &&
        (typeof mode.createSessionState === "function" ||
          typeof mode.syncSession === "function")
    );
  }

  app.runtime.modeRunnerMethods = {
    loadInitialMode() {
      const storedMode = storage.get(config.storageKeys.level, config.defaultLevel);
      return app.modes.resolveSelection(storedMode);
    },

    getModeDefinition(modeId) {
      return app.modes.get(modeId) || app.modes.resolveSelection(modeId) || null;
    },

    getActiveModeDefinition() {
      const runtimeState = this.state.runtime;

      return (
        this.getModeDefinition(runtimeState.effectiveMode) ||
        this.getModeDefinition(runtimeState.targetMode) ||
        this.getModeDefinition(config.defaultLevel)
      );
    },

    getEffectiveLevelConfig() {
      const runtimeState = this.state.runtime;

      return runtimeState.effectiveLevelConfig || config.levels[runtimeState.level];
    },

    getEffectiveSyncConfig() {
      const runtimeState = this.state.runtime;

      return runtimeState.effectiveSyncConfig || config.sync;
    },

    syncEffectiveRuntimeLevel() {
      const runtimeState = this.state.runtime;
      const strategyState = this.state.strategy;
      const effectiveMode = this.getActiveModeDefinition();

      runtimeState.level = effectiveMode ? effectiveMode.runtimeLevel : config.defaultLevel;
      strategyState.activeSessionModeId = effectiveMode ? effectiveMode.id : "";
      this.rebuildEffectiveRuntimeConfig();
      this.syncDiagnosticsCollectionPolicy();
      return effectiveMode;
    },

    syncDiagnosticsCollectionPolicy() {
      const runtimeLevel = this.state.runtime.level;
      const dataCollectionEnabled = runtimeLevel !== "off";

      this.diagnostics.setCollectionPolicy({
        metricsEnabled: dataCollectionEnabled,
        sessionEnabled: dataCollectionEnabled,
        traceEnabled: dataCollectionEnabled,
        eventsEnabled: dataCollectionEnabled,
      });

      if (dataCollectionEnabled) {
        return;
      }

      storage.set(config.storageKeys.traceRecording, false);

      if (!this.traceRecorder) {
        return;
      }

      this.stopTraceRecording("mode-off");
      this.clearTraceRecording();
    },

    getModeStrategySessionsStore() {
      const strategyState = this.state.strategy;

      if (!strategyState.modeSessions || typeof strategyState.modeSessions !== "object") {
        strategyState.modeSessions = createEmptyModeStrategySession();
      }

      return strategyState.modeSessions;
    },

    createModeStrategySession(modeId) {
      const mode =
        typeof modeId === "string" ? this.getModeDefinition(modeId) : modeId || null;

      if (!mode || !modeUsesStrategySession(mode)) {
        return null;
      }

      if (typeof mode.createSessionState !== "function") {
        return createEmptyModeStrategySession();
      }

      return normalizeModeStrategySession(
        mode.createSessionState({
          app,
          controller: this,
          services: this.services,
          stateSlices: this.stateSlices,
          mode,
        })
      );
    },

    getModeStrategySession(modeId) {
      const normalizedModeId = String(modeId || "").trim();

      if (!normalizedModeId) {
        return null;
      }

      return this.getModeStrategySessionsStore()[normalizedModeId] || null;
    },

    ensureModeStrategySession(modeId) {
      const strategyState = this.state.strategy;
      const mode = this.getModeDefinition(modeId);

      if (!mode) {
        return null;
      }

      strategyState.activeSessionModeId = mode.id;
      const existingSession = this.getModeStrategySession(mode.id);

      if (existingSession) {
        return existingSession;
      }

      const nextSession = this.createModeStrategySession(mode);

      if (!nextSession) {
        return null;
      }

      this.getModeStrategySessionsStore()[mode.id] = nextSession;
      return nextSession;
    },

    invokeModeHook(modeId, hookName, hookContext = {}, { ensureSession = false } = {}) {
      const mode =
        typeof modeId === "string"
          ? this.getModeDefinition(modeId)
          : modeId || this.getActiveModeDefinition();

      if (!mode || typeof mode[hookName] !== "function") {
        return undefined;
      }

      const strategySession = ensureSession
        ? this.ensureModeStrategySession(mode.id) || this.getModeStrategySession(mode.id)
        : this.getModeStrategySession(mode.id);

      return mode[hookName]({
        app,
        controller: this,
        services: this.services,
        stateSlices: this.stateSlices,
        mode,
        strategySession,
        ...hookContext,
      });
    },

    invokeActiveModeCapabilityHook(
      hookName,
      hookContext = {},
      { ensureSession = false } = {}
    ) {
      const activeMode = this.getActiveModeDefinition();

      if (!activeMode || typeof activeMode[hookName] !== "function") {
        return undefined;
      }

      return this.invokeModeHook(
        activeMode,
        hookName,
        {
          ...hookContext,
          ensure: ensureSession,
        },
        { ensureSession }
      );
    },

    getActiveModeObserverHints() {
      return this.invokeActiveModeCapabilityHook("getObserverHints") || null;
    },

    isActiveModeForegroundBusyHintActive(now = performance.now()) {
      return Boolean(
        this.invokeActiveModeCapabilityHook("getForegroundBusyHint", {
          now,
        })
      );
    },

    markActiveModeSelfMutationSuppressed() {
      return (
        this.invokeActiveModeCapabilityHook(
          "markSelfMutationSuppressed",
          {},
          { ensureSession: true }
        ) || 0
      );
    },

    queueActiveModeMeasurementBacklog(recordId) {
      if (!Number.isFinite(recordId)) {
        return false;
      }

      return Boolean(
        this.invokeActiveModeCapabilityHook(
          "queueMeasurementBacklog",
          { recordId },
          { ensureSession: true }
        )
      );
    },

    collectActiveModeMeasurementBacklog({ allowBacklogFill = false } = {}) {
      return (
        this.invokeActiveModeCapabilityHook(
          "collectMeasurementBacklog",
          { allowBacklogFill },
          { ensureSession: true }
        ) || []
      );
    },

    pruneActiveModeMeasurementBacklog() {
      return (
        this.invokeActiveModeCapabilityHook(
          "pruneMeasurementBacklog",
          {},
          { ensureSession: true }
        ) || 0
      );
    },

    recordActiveModeSlowSync(durationMs, thresholdMs) {
      if (!Number.isFinite(durationMs)) {
        return null;
      }

      const nextCount = this.invokeActiveModeCapabilityHook(
        "recordSlowSync",
        {
          durationMs,
          thresholdMs,
        },
        { ensureSession: true }
      );

      return Number.isFinite(nextCount) ? nextCount : null;
    },

    getActiveModeSearchNoticeState() {
      return this.invokeActiveModeCapabilityHook("getSearchNoticeState") || null;
    },

    markActiveModeSearchNotice(now = performance.now()) {
      return (
        this.invokeActiveModeCapabilityHook(
          "markSearchNotice",
          { now },
          { ensureSession: true }
        ) || null
      );
    },

    commitActiveModeSyncTelemetry(telemetry = {}) {
      return (
        this.invokeActiveModeCapabilityHook(
          "commitSyncTelemetry",
          telemetry,
          { ensureSession: true }
        ) || null
      );
    },

    setModeCyclePrepared(modeId = null, prepared, { ensure = false } = {}) {
      const result = this.invokeModeHook(
        modeId,
        "setCyclePrepared",
        {
          prepared,
          ensure,
        },
        { ensureSession: ensure }
      );

      return typeof result === "undefined" ? false : Boolean(result);
    },

    clearModeStrategySession(modeId) {
      const strategyState = this.state.strategy;
      const normalizedModeId = String(modeId || "").trim();

      if (!normalizedModeId) {
        return;
      }

      const sessions = this.getModeStrategySessionsStore();

      if (Object.prototype.hasOwnProperty.call(sessions, normalizedModeId)) {
        delete sessions[normalizedModeId];
      }

      if (strategyState.activeSessionModeId === normalizedModeId) {
        const activeMode = this.getActiveModeDefinition();
        strategyState.activeSessionModeId = activeMode ? activeMode.id : "";
      }
    },

    clearAllModeStrategySessions() {
      const strategyState = this.state.strategy;

      strategyState.modeSessions = createEmptyModeStrategySession();
      strategyState.activeSessionModeId = "";
    },

    syncActiveModeStrategySession(sessionContext) {
      const strategyState = this.state.strategy;
      const activeMode = this.getActiveModeDefinition();

      if (!activeMode) {
        strategyState.activeSessionModeId = "";
        return null;
      }

      strategyState.activeSessionModeId = activeMode.id;

      if (typeof activeMode.syncSession !== "function") {
        return this.getModeStrategySession(activeMode.id);
      }

      const strategySession =
        this.ensureModeStrategySession(activeMode.id) ||
        createEmptyModeStrategySession();
      const nextSession = activeMode.syncSession({
        app,
        controller: this,
        services: this.services,
        stateSlices: this.stateSlices,
        strategySession,
        ...sessionContext,
      });

      if (nextSession && nextSession !== strategySession) {
        this.getModeStrategySessionsStore()[activeMode.id] =
          normalizeModeStrategySession(nextSession);
      }

      return this.getModeStrategySession(activeMode.id) || strategySession;
    },

    selectMode(nextModeId) {
      const nextMode = this.getModeDefinition(nextModeId);

      if (!nextMode || !nextMode.selectable) {
        return null;
      }

      return nextMode;
    },

    injectStyleControllers() {
      this.baseStyleController.injectBaseStyles();
      this.modeStyleController.injectModeStyles();
    },

    prepareForModeSwitch(previousModeId, nextModeId) {
      this.clearLowPrioritySync();
      this.resetBaseRuntimeTracking();
      this.clearBottomFollow();

      const records = this.registry.getOrderedRecords();
      this.clearObservedRecordTracking(records);

      const previousMode = this.getModeDefinition(previousModeId);
      const nextMode = this.getModeDefinition(nextModeId);

      if (previousMode) {
        this.setModeCyclePrepared(previousMode.id, false, { ensure: false });
        this.invokeModeHook(previousMode, "prepareModeSwitch", {
          previousModeId,
          nextModeId,
          records,
        });
      }

      if (nextMode && (!previousMode || previousMode.id !== nextMode.id)) {
        this.setModeCyclePrepared(nextMode.id, false, { ensure: false });
        this.invokeModeHook(nextMode, "prepareModeSwitch", {
          previousModeId,
          nextModeId,
          records,
        });
      }
    },

    clearRecordModeRuntime(record) {
      const modes = app.modes.list();

      for (let index = 0; index < modes.length; index += 1) {
        this.invokeModeHook(modes[index], "clearRecordRuntime", { record });
      }
    },

    clearRecordStyles(record) {
      const traceRecord =
        this.traceRecorder &&
        typeof this.traceRecorder.buildTraceRecordSummary === "function"
          ? this.traceRecorder.buildTraceRecordSummary(record)
          : null;

      if (
        (record.baseStyleOptimized || record.baseStyleKeepAlive || record.modeState)
      ) {
        this.recordTraceEntry(
          "style",
          "clear-record-styles",
          {
            record: traceRecord,
            turnHash: traceRecord?.turnHash || "",
            contentId: record.baseStyleId || String(record.id),
            optimized: Boolean(record.baseStyleOptimized),
            keepAlive: Boolean(record.baseStyleKeepAlive),
            modeId: record.modeState?.modeId || "",
          },
          { includeSnapshot: false }
        );
      }

      this.baseStyleController.clear(record);
      this.modeStyleController.clearModeState(record);
      this.clearRecordModeRuntime(record);
      record.selfMutationUntil = 0;
      record.observedMessageElement = null;
      record.warmObservedMessageElement = null;

      if (record.measureDeferred) {
        record.measureDeferred = false;
        record.needsMeasure = true;
      }
    },

    clearAllRecordStyles(records) {
      records.forEach((record) => this.clearRecordStyles(record));
    },

    applyRecordStyles(record, decision) {
      const traceRecord =
        this.traceRecorder &&
        typeof this.traceRecorder.buildTraceRecordSummary === "function"
          ? this.traceRecorder.buildTraceRecordSummary(record)
          : null;

      if (decision && Number.isFinite(decision.selfMutationDurationMs)) {
        record.selfMutationUntil = performance.now() + decision.selfMutationDurationMs;
      }

      this.recordTraceEntry(
        "style",
        "apply-record-styles",
        {
          record: traceRecord,
          turnHash: traceRecord?.turnHash || "",
          optimize: Boolean(decision.optimize),
          keepAlive: Boolean(decision.keepAlive),
          modeId: decision.modeState?.modeId || "",
          distanceTier: decision.modeState?.distanceTier || "",
          eligible: Boolean(decision.eligible),
          requiresMeasurementFollowup: Boolean(decision.requiresMeasurementFollowup),
        },
        { includeSnapshot: false }
      );

      this.baseStyleController.apply(
        record,
        Boolean(decision.optimize),
        Boolean(decision.keepAlive)
      );
      this.modeStyleController.applyModeState(record, decision.modeState || null);
    },

    createDefaultRecordDecision({
      record,
      levelConfig,
      canApplyOptimizationClasses,
    }) {
      const eligible =
        canApplyOptimizationClasses &&
        this.isRecordOptimizationCandidate(record, levelConfig);

      return {
        eligible,
        optimize: eligible && !record.protected,
        keepAlive: eligible && record.protected,
        modeState: null,
        controlledNodeEstimate: record.nodeCountEstimate,
        estimatedSkippedHeight: record.lastMeasuredHeight || 0,
      };
    },

    evaluateRecordDecision(params) {
      const defaultDecision = this.createDefaultRecordDecision(params);
      const activeMode = this.getActiveModeDefinition();
      const { record, reason, isResync } = params;

      if (this.canReuseModeDecision(record, reason, isResync)) {
        return this.getCachedModeDecision(record, defaultDecision);
      }

      if (!activeMode || typeof activeMode.evaluateRecord !== "function") {
        return defaultDecision;
      }

      const strategySession =
        this.ensureModeStrategySession(activeMode.id) ||
        this.getModeStrategySession(activeMode.id);

      const modeDecision = activeMode.evaluateRecord({
        app,
        controller: this,
        services: this.services,
        stateSlices: this.stateSlices,
        strategySession,
        defaultDecision,
        ...params,
      });

      return {
        ...defaultDecision,
        ...(modeDecision || {}),
      };
    },

    canReuseModeDecision(record, reason, isResync) {
      return Boolean(
        this.invokeModeHook(null, "canReuseDecision", {
          record,
          reason,
          isResync,
        })
      );
    },

    cacheModeDecision(record, decision) {
      this.invokeModeHook(
        null,
        "cacheDecision",
        {
          record,
          decision,
        },
        { ensureSession: true }
      );
    },

    markRecordForModeDecision(record) {
      if (!record) {
        return;
      }

      this.invokeModeHook(null, "markRecordDecisionDirty", { record });
    },

    collectModeDecisionWorkset(records, reason, isResync) {
      return (
        this.invokeModeHook(
          null,
          "collectDecisionWorkset",
          {
            records,
            reason,
            isResync,
          },
          { ensureSession: true }
        ) || null
      );
    },

    collectModeStateRefreshSet(params) {
      return (
        this.invokeModeHook(
          null,
          "collectStateRefreshSet",
          params,
          { ensureSession: true }
        ) || null
      );
    },

    buildModeEvaluationOrder(records, workset) {
      return (
        this.invokeModeHook(
          null,
          "buildEvaluationOrder",
          {
            records,
            workset,
          },
          { ensureSession: true }
        ) || null
      );
    },

    getCachedModeDecision(record, defaultDecision) {
      const cachedDecision = this.invokeModeHook(null, "getCachedDecision", {
        record,
        defaultDecision,
      });

      if (cachedDecision) {
        return cachedDecision;
      }

      return {
        ...defaultDecision,
        optimize: Boolean(record?.optimized),
        modeState: record?.modeState || null,
      };
    },

    evaluateModeSession(sessionContext) {
      const activeMode = this.getActiveModeDefinition();

      if (!activeMode || typeof activeMode.evaluateSession !== "function") {
        return null;
      }

      const strategySession =
        this.ensureModeStrategySession(activeMode.id) ||
        this.getModeStrategySession(activeMode.id);

      return activeMode.evaluateSession({
        app,
        controller: this,
        services: this.services,
        stateSlices: this.stateSlices,
        strategySession,
        ...sessionContext,
      });
    },
  };
})();
