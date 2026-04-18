(() => {
  const app = globalThis.__CSP__;
  const config = app.core.config;

  function createModeCatalogSnapshot() {
    if (app.modes && typeof app.modes.getDiagnosticsCatalog === "function") {
      return app.modes.getDiagnosticsCatalog();
    }

    return {
      modes: [],
      availableLevels: [config.defaultLevel],
      plannedLevels: [],
    };
  }

  function createPanelBadgeSnapshot(state) {
    return {
      runtimeStatus: state.runtimeStatus,
      level: state.level,
      effectiveMode: state.effectiveMode,
      messageTotal: state.metrics.messageTotal,
      unitTotal: state.metrics.unitTotal,
      optimized: state.metrics.optimized,
      coverageRate: state.metrics.coverageRate,
    };
  }

  function createPanelOverlaySnapshot(state) {
    return {
      overlayVisible: Boolean(state.activity.overlayVisible),
      overlayJobId: state.activity.overlayJobId || "",
      overlayKind: state.activity.overlayKind || "",
      overlayStage: state.activity.overlayStage || "",
      overlayProgress: state.activity.overlayProgress || 0,
    };
  }

  function createTraceStatusSnapshot(state) {
    return {
      recording: Boolean(state.trace.recording),
      entryCount: state.trace.entryCount || 0,
      entryLimit: state.trace.entryLimit || 0,
      entryLimitReached: Boolean(state.trace.entryLimitReached),
      stopReason: state.trace.stopReason || "",
      lastUpdatedAt: state.trace.lastUpdatedAt || 0,
    };
  }

  function createDiagnosticsState() {
    const modeCatalog = createModeCatalogSnapshot();
    const state = {
      level: config.defaultLevel,
      targetMode: config.defaultLevel,
      effectiveMode: config.defaultLevel,
      runtimeStatus: "disabled",
      availableLevels: [...modeCatalog.availableLevels],
      plannedLevels: [...modeCatalog.plannedLevels],
      modes: modeCatalog.modes.map((mode) => ({
        ...mode,
      })),
      page: {
        isChatPage: false,
        threadReady: false,
        scrollRootReady: false,
        path: globalThis.location.pathname,
        optimizationEnabled: false,
        runtimeProfile: "balanced",
        deviceTier: "normal",
        activeAdapter: "",
        recognitionConfidence: "none",
        lastSyncReason: "startup",
      },
      capabilities: {
        contentVisibility: false,
        containIntrinsicSize: false,
      },
      metrics: {
        messageTotal: 0,
        unitTotal: 0,
        discovered: 0,
        registered: 0,
        observed: 0,
        optimizable: 0,
        optimized: 0,
        keepAlive: 0,
        protected: 0,
        visible: 0,
        nearViewport: 0,
        pendingMeasurements: 0,
        recognitionFailures: 0,
        skippedMessages: 0,
        coverageRate: 0,
        protectedShare: 0,
        estimatedSkippedHeight: 0,
        estimatedControlledNodes: 0,
        benefitLevel: "low",
        collapsedCount: 0,
        collapseQueueSize: 0,
        restoreQueueSize: 0,
        stateTransitionCount: 0,
        selfMutationSuppressedCount: 0,
        anchorCorrectionCount: 0,
        anchorCorrectionFailureCount: 0,
        sessionCollapseBlockedCount: 0,
        localFreezeZoneCount: 0,
        benefitRejectedCount: 0,
        structureRescanCount: 0,
        consecutiveSlowSyncCount: 0,
        nativeSearchDegradeNoticeCount: 0,
        performanceFarCount: 0,
        performanceBenefitEligibleCount: 0,
        performanceCollapsePendingCount: 0,
        performanceCollapsedStableCount: 0,
        performanceBlockedByBenefitCount: 0,
        performanceBlockedByWriteWindowCount: 0,
        performanceBlockedByBudgetCount: 0,
        performanceBlockedByDwellCount: 0,
        performanceExpandedByProtectionCount: 0,
        initDurationMs: 0,
        lastSyncDurationMs: 0,
        avgSyncDurationMs: 0,
        lastResyncDurationMs: 0,
        resyncCount: 0,
      },
      fallback: {
        enabled: false,
        reason: "",
        lastError: "",
      },
      activity: {
        busy: false,
        phase: "idle",
        reason: "",
        lowPriority: false,
        overlayVisible: false,
        overlayJobId: "",
        overlayKind: "",
        overlayStage: "",
        overlayProgress: 0,
      },
      session: {
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
      },
      trace: app.runtime.createTraceDiagnosticsState
        ? app.runtime.createTraceDiagnosticsState()
        : {
            recording: false,
            entryCount: 0,
            entryLimit: 0,
            captureLimit: 0,
            entryLimitReached: false,
            stopReason: "",
            domEventCount: 0,
            mutationBatchCount: 0,
            snapshotCount: 0,
            syncEventCount: 0,
            styleWriteCount: 0,
            startedAt: 0,
            lastUpdatedAt: 0,
            lastKind: "",
            lastType: "",
            traceSessionId: "",
          },
      events: [],
    };

    state.panelBadge = createPanelBadgeSnapshot(state);
    state.panelOverlay = createPanelOverlaySnapshot(state);
    state.traceStatus = createTraceStatusSnapshot(state);

    return state;
  }

  function cloneModeState(state) {
    return {
      level: state.level,
      targetMode: state.targetMode,
      effectiveMode: state.effectiveMode,
      availableLevels: [...state.availableLevels],
      plannedLevels: [...state.plannedLevels],
      modes: state.modes.map((mode) => ({
        ...mode,
      })),
    };
  }

  function cloneEvents(state) {
    return state.events.map((event) => ({
      ...event,
      detailParams: {
        ...(event.detailParams || {}),
      },
    }));
  }

  function cloneDiagnosticsSlice(state, sliceName) {
    switch (sliceName) {
      case "modeState":
        return cloneModeState(state);
      case "runtimeStatus":
        return state.runtimeStatus;
      case "page":
        return {
          ...state.page,
        };
      case "panelBadge":
        return {
          ...state.panelBadge,
        };
      case "panelOverlay":
        return {
          ...state.panelOverlay,
        };
      case "traceStatus":
        return {
          ...state.traceStatus,
        };
      case "capabilities":
        return {
          ...state.capabilities,
        };
      case "metrics":
        return {
          ...state.metrics,
        };
      case "fallback":
        return {
          ...state.fallback,
        };
      case "activity":
        return {
          ...state.activity,
        };
      case "session":
        return {
          ...state.session,
        };
      case "trace":
        return {
          ...state.trace,
        };
      case "events":
        return cloneEvents(state);
      default:
        return undefined;
    }
  }

  app.core.diagnosticsState = Object.freeze({
    createDiagnosticsState,
    createPanelBadgeSnapshot,
    createPanelOverlaySnapshot,
    createTraceStatusSnapshot,
    cloneDiagnosticsSlice,
  });
})();
