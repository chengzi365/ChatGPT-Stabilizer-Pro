(() => {
  const app = globalThis.__CSP__;

  function createDefaultCapabilities() {
    return {
      contentVisibility: false,
      containIntrinsicSize: false,
    };
  }

  function createEmptyCollectionStats() {
    return {
      discovered: 0,
      skipped: 0,
      failures: 0,
      messageTotal: 0,
    };
  }

  function createEmptyBaseMetricsTotals() {
    return {
      keepAlive: 0,
      protected: 0,
      visible: 0,
      nearViewport: 0,
      optimizable: 0,
      optimized: 0,
      estimatedSkippedHeight: 0,
      estimatedControlledNodes: 0,
    };
  }

  function createSessionRuntimeState() {
    return {
      activeAnomalyReason: "",
      anomalyCount: 0,
      lastAnomalyReason: "",
      lastAnomalyAt: 0,
      degradeCount: 0,
      lastDegradeReason: "",
      lastDegradeMode: "",
      lastDegradeAt: 0,
      recoveryCount: 0,
      lastRecoveryReason: "",
      lastRecoveryMode: "",
      lastRecoveryAt: 0,
      lockedDegradation: false,
      lockedReason: "",
      stableSyncCount: 0,
    };
  }

  function createModeSessionsMap() {
    return Object.create(null);
  }

  function createRuntimeSlice({
    targetMode,
    effectiveMode,
    level = effectiveMode,
  }) {
    const runtimeProfileState =
      typeof app.runtime.createRuntimeProfileState === "function"
        ? app.runtime.createRuntimeProfileState(level)
        : {
            runtimeProfile: "balanced",
            deviceTier: "normal",
            profileRevision: 0,
            effectiveLevelConfig: null,
            effectiveSyncConfig: null,
          };

    return {
      level,
      targetMode,
      effectiveMode,
      isSwitchingLevel: false,
      capabilities: createDefaultCapabilities(),
      ...runtimeProfileState,
    };
  }

  function createPageSlice() {
    return {
      chatRoot: null,
      scrollRoot: null,
      isChatPage: false,
      threadReady: false,
      activeAdapterId: "",
      recognitionConfidence: "none",
      lastObservedRouteKey: "",
      lastSyncedRouteKey: "",
      lastCollectionStats: createEmptyCollectionStats(),
    };
  }

  function createObserverSlice() {
    return {
      mutationObserver: null,
      mutationObserverRoot: null,
      bootstrapMutationObserver: null,
      bootstrapMutationObserverRoot: null,
      intersectionObserver: null,
      intersectionRoot: null,
      intersectionMargin: null,
      warmIntersectionObserver: null,
      warmIntersectionRoot: null,
      warmIntersectionMargin: null,
      observedIds: new Set(),
      warmObservedIds: new Set(),
      routeWatchersInstalled: false,
      interactionWatchersInstalled: false,
    };
  }

  function createSchedulerSlice() {
    return {
      syncScheduled: false,
      scheduledReason: "startup",
      scheduledResync: false,
      lowPrioritySyncScheduled: false,
      lowPrioritySyncReason: "measurement-backlog",
      lowPrioritySyncHandle: 0,
      lowPrioritySyncKind: "",
      isSyncing: false,
      currentSyncReason: "",
      routeFollowupTimers: [],
      runtimeProfileTimer: 0,
      runtimeProfileTimerReason: "",
      overlayJobSeq: 0,
      activeOverlayJob: null,
      overlayCompletionTimer: 0,
    };
  }

  function createProtectionSlice() {
    return {
      focusedRecordId: 0,
      selectedRecordId: 0,
      hoveredRecordId: 0,
      interactionQuietUntil: 0,
      bottomFollowActive: false,
      bottomFollowUntil: 0,
      bottomFollowReason: "",
      protectionTimer: null,
      protectionTimerAt: 0,
      protectionTimerReason: "",
      protectionTimerScrollOffset: 0,
    };
  }

  function createMeasurementSlice() {
    return {
      layoutWatchersInstalled: false,
      pendingGlobalLayoutChangeTimer: null,
      pendingGlobalLayoutChangeSources: new Set(),
      baseStateRefreshIds: new Set(),
      baseRefreshActiveIds: new Set(),
      measureBacklogIds: [],
      measureBacklogSet: new Set(),
      baseMetricsTotals: createEmptyBaseMetricsTotals(),
    };
  }

  function createStrategySlice() {
    return {
      session: createSessionRuntimeState(),
      modeSessions: createModeSessionsMap(),
      activeSessionModeId: "",
    };
  }

  function createControllerStateAccess(state) {
    return Object.freeze({
      runtime: state.runtime,
      page: state.page,
      observers: state.observers,
      scheduler: state.scheduler,
      protection: state.protection,
      measurement: state.measurement,
      strategy: state.strategy,
    });
  }

  function createControllerState({
    targetMode,
    effectiveMode,
    level = effectiveMode,
  }) {
    const state = {
      runtime: createRuntimeSlice({
        targetMode,
        effectiveMode,
        level,
      }),
      page: createPageSlice(),
      observers: createObserverSlice(),
      scheduler: createSchedulerSlice(),
      protection: createProtectionSlice(),
      measurement: createMeasurementSlice(),
      strategy: createStrategySlice(),
    };

    return state;
  }

  app.runtime.createDefaultCapabilities = createDefaultCapabilities;
  app.runtime.createEmptyCollectionStats = createEmptyCollectionStats;
  app.runtime.createEmptyBaseMetricsTotals = createEmptyBaseMetricsTotals;
  app.runtime.createSessionRuntimeState = createSessionRuntimeState;
  app.runtime.createModeSessionsMap = createModeSessionsMap;
  app.runtime.createControllerState = createControllerState;
  app.runtime.createControllerStateAccess = createControllerStateAccess;
})();
