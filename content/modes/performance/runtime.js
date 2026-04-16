(() => {
  const app = globalThis.__CSP__;
  const i18n = app.core.i18n;
  const performanceMode = app.modes.performance || (app.modes.performance = {});

  const PERFORMANCE_CONSTANTS = Object.freeze({
    collapseBudget: 12,
    collapseBudgetResync: 24,
    restoreBudget: 4,
    restoreBudgetUrgent: 12,
    collapseDwellMs: 360,
    expandedHoldMs: 900,
    transitionGapMs: 220,
    emergencyHoldMs: 1200,
    benefitHeightMinimum: 144,
    benefitHeightStructured: 440,
    benefitHeightTextLarge: 900,
    benefitHeightTextExtreme: 1280,
    benefitNodeCombo: 120,
    benefitStructureStrong: 128,
    benefitStructureCombo: 42,
    benefitStructureTallCombo: 34,
    benefitRichContentMinimum: 2,
    benefitTextLarge: 5200,
    collapsedHeightRatio: 0.18,
    collapsedHeightMin: 72,
    collapsedHeightMax: 220,
    warmViewportScreens: 1.5,
    warmViewportScreensForward: 2.5,
    warmViewportScreensBackward: 1.25,
    backlogFollowupLimit: 6,
    backlogWindowMs: 1000,
    selfMutationWindowMs: 180,
    localFreezeRadius: 2,
    localFreezeDurationMs: 10000,
    sessionBlockEmergencyThreshold: 3,
    localFreezeEmergencyThreshold: 2,
  });

  function t(key, params = {}, fallback) {
    return i18n.t(key, params, fallback);
  }

  function createEmptyPerformanceDecisionMetrics() {
    return {
      performanceFarCount: 0,
      performanceBenefitEligibleCount: 0,
      performanceCollapsePendingCount: 0,
      performanceCollapsedStableCount: 0,
      performanceBlockedByBenefitCount: 0,
      performanceBlockedByWriteWindowCount: 0,
      performanceBlockedByBudgetCount: 0,
      performanceBlockedByDwellCount: 0,
      performanceExpandedByProtectionCount: 0,
    };
  }

  function createPerformanceRuntime() {
    return {
      scrollRoot: null,
      lastScrollOffset: 0,
      scrollDirection: 0,
      lastScrollActivityAt: 0,
      warmMarginScale: 1,
      cycleNow: 0,
      collapseWriteAllowed: false,
      collapseBudgetRemaining: 0,
      restoreBudgetRemaining: 0,
      hasPendingBacklog: false,
      backlogStartedAt: 0,
      followupCount: 0,
      nextLocalFreezeZoneId: 1,
      localFreezeZones: [],
      collapseQueueIds: [],
      collapseQueueSet: new Set(),
      restoreQueueIds: [],
      restoreQueueSet: new Set(),
      measureBacklogIds: [],
      measureBacklogSet: new Set(),
      warmStartIndex: -1,
      warmEndIndex: -1,
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
      lastNativeSearchNoticeAt: 0,
      ...createEmptyPerformanceDecisionMetrics(),
    };
  }

  function createPerformanceSessionState() {
    return {
      cyclePrepared: false,
      runtime: createPerformanceRuntime(),
      lastSyncReason: "",
      lastBacklogReason: "",
    };
  }

  function resolvePerformanceStrategySession({
    controller,
    strategySession,
    mode,
    ensure = false,
  }) {
    if (strategySession) {
      return strategySession;
    }

    if (!controller || !mode?.id) {
      return null;
    }

    return ensure
      ? controller.ensureModeStrategySession(mode.id) ||
          controller.getModeStrategySession(mode.id)
      : controller.getModeStrategySession(mode.id);
  }

  function getPerformanceRuntime(strategySession) {
    if (!strategySession.runtime) {
      strategySession.runtime = createPerformanceRuntime();
    }

    return strategySession.runtime;
  }

  function queueRecord(queue, queueSet, recordId) {
    if (queueSet) {
      if (queueSet.has(recordId)) {
        return;
      }

      queueSet.add(recordId);
      queue.push(recordId);
      return;
    }

    if (!queue.includes(recordId)) {
      queue.push(recordId);
    }
  }

  function pruneFreezeZones(runtime, now) {
    runtime.localFreezeZones = runtime.localFreezeZones.filter(
      (zone) => zone.expiresAt > now
    );
  }

  function preparePerformanceCycle(
    strategySession,
    pageState,
    protectionService,
    reason,
    isResync
  ) {
    const runtime = getPerformanceRuntime(strategySession);
    const scrollRoot = pageState?.scrollRoot || null;
    const nextScrollOffset = app.dom.getScrollOffset(scrollRoot);
    const now = performance.now();
    const foregroundBusy = Boolean(protectionService?.isForegroundBusy?.());

    if (runtime.scrollRoot !== scrollRoot) {
      strategySession.runtime = {
        ...createPerformanceRuntime(),
        scrollRoot,
        lastScrollOffset: nextScrollOffset,
        lastScrollActivityAt: now,
      };
      return preparePerformanceCycle(
        strategySession,
        pageState,
        protectionService,
        reason,
        isResync
      );
    }

    const delta = nextScrollOffset - runtime.lastScrollOffset;

    if (Math.abs(delta) >= 4) {
      runtime.scrollDirection = delta > 0 ? 1 : -1;
      runtime.lastScrollActivityAt = now;
    } else if (now - (runtime.lastScrollActivityAt || 0) >= 140) {
      runtime.scrollDirection = 0;
    }

    runtime.lastScrollOffset = nextScrollOffset;
    runtime.cycleNow = now;
    runtime.warmMarginScale = foregroundBusy ? 0.8 : 0.92;
    runtime.collapseWriteAllowed =
      !foregroundBusy &&
      (
        reason === "measurement-backlog" ||
        reason === "startup" ||
        reason === "route-change" ||
        reason === "manual-resync" ||
        reason === "level-change"
      );
    runtime.collapseBudgetRemaining = isResync
      ? PERFORMANCE_CONSTANTS.collapseBudgetResync
      : PERFORMANCE_CONSTANTS.collapseBudget;
    runtime.restoreBudgetRemaining =
      reason === "interaction" || reason === "visibility-change"
        ? PERFORMANCE_CONSTANTS.restoreBudgetUrgent
        : PERFORMANCE_CONSTANTS.restoreBudget;
    runtime.hasPendingBacklog = false;
    runtime.collapseQueueIds = [];
    runtime.collapseQueueSet.clear();
    runtime.restoreQueueIds = [];
    runtime.restoreQueueSet.clear();
    runtime.warmStartIndex = -1;
    runtime.warmEndIndex = -1;
    runtime.collapsedCount = 0;
    runtime.collapseQueueSize = 0;
    runtime.restoreQueueSize = 0;
    runtime.stateTransitionCount = 0;
    runtime.selfMutationSuppressedCount = 0;
    runtime.anchorCorrectionCount = 0;
    runtime.anchorCorrectionFailureCount = 0;
    runtime.sessionCollapseBlockedCount = 0;
    runtime.benefitRejectedCount = 0;
    Object.assign(runtime, createEmptyPerformanceDecisionMetrics());

    pruneFreezeZones(runtime, runtime.cycleNow);
    runtime.localFreezeZoneCount = runtime.localFreezeZones.length;

    if (reason !== "measurement-backlog") {
      runtime.followupCount = 0;
    }

    return runtime;
  }

  function getWarmMargins(viewportHeight, scrollDirection, scale = 1) {
    if (scrollDirection > 0) {
      return {
        above:
          viewportHeight *
          PERFORMANCE_CONSTANTS.warmViewportScreensBackward *
          scale,
        below:
          viewportHeight *
          PERFORMANCE_CONSTANTS.warmViewportScreensForward *
          scale,
      };
    }

    if (scrollDirection < 0) {
      return {
        above:
          viewportHeight *
          PERFORMANCE_CONSTANTS.warmViewportScreensForward *
          scale,
        below:
          viewportHeight *
          PERFORMANCE_CONSTANTS.warmViewportScreensBackward *
          scale,
      };
    }

    return {
      above: viewportHeight * PERFORMANCE_CONSTANTS.warmViewportScreens * scale,
      below: viewportHeight * PERFORMANCE_CONSTANTS.warmViewportScreens * scale,
    };
  }

  function getDistanceBand(record, rootRect, scrollDirection, warmMarginScale = 1) {
    if (record.protected) {
      return "protected";
    }

    if (record.performanceWarmObserved) {
      return "warm";
    }

    if (record.lastViewportHeight > 0) {
      return "far";
    }

    const viewportHeight = Math.max(1, rootRect.bottom - rootRect.top);
    const warmMargins = getWarmMargins(
      viewportHeight,
      scrollDirection,
      warmMarginScale
    );
    const distanceAbove = rootRect.top - record.lastViewportBottom;
    const distanceBelow = record.lastViewportTop - rootRect.bottom;

    if (distanceAbove > warmMargins.above || distanceBelow > warmMargins.below) {
      return "far";
    }

    return "warm";
  }

  function getPerformanceRuntimeStateForModeHook(context) {
    const strategySession = resolvePerformanceStrategySession(context);

    if (!strategySession) {
      return null;
    }

    return getPerformanceRuntime(strategySession);
  }

  function buildPerformanceMetricsProjection(runtime) {
    if (!runtime) {
      return null;
    }

    return {
      collapsedCount: runtime.collapsedCount || 0,
      collapseQueueSize: runtime.collapseQueueSize || 0,
      restoreQueueSize: runtime.restoreQueueSize || 0,
      stateTransitionCount: runtime.stateTransitionCount || 0,
      selfMutationSuppressedCount: runtime.selfMutationSuppressedCount || 0,
      anchorCorrectionCount: runtime.anchorCorrectionCount || 0,
      anchorCorrectionFailureCount: runtime.anchorCorrectionFailureCount || 0,
      sessionCollapseBlockedCount: runtime.sessionCollapseBlockedCount || 0,
      localFreezeZoneCount: runtime.localFreezeZoneCount || 0,
      benefitRejectedCount: runtime.benefitRejectedCount || 0,
      structureRescanCount: runtime.structureRescanCount || 0,
      consecutiveSlowSyncCount: runtime.consecutiveSlowSyncCount || 0,
      nativeSearchDegradeNoticeCount: runtime.nativeSearchDegradeNoticeCount || 0,
      performanceFarCount: runtime.performanceFarCount || 0,
      performanceBenefitEligibleCount: runtime.performanceBenefitEligibleCount || 0,
      performanceCollapsePendingCount: runtime.performanceCollapsePendingCount || 0,
      performanceCollapsedStableCount: runtime.performanceCollapsedStableCount || 0,
      performanceBlockedByBenefitCount:
        runtime.performanceBlockedByBenefitCount || 0,
      performanceBlockedByWriteWindowCount:
        runtime.performanceBlockedByWriteWindowCount || 0,
      performanceBlockedByBudgetCount: runtime.performanceBlockedByBudgetCount || 0,
      performanceBlockedByDwellCount: runtime.performanceBlockedByDwellCount || 0,
      performanceExpandedByProtectionCount:
        runtime.performanceExpandedByProtectionCount || 0,
    };
  }

  function getPerformanceObserverHintsForModeHook(context) {
    const runtime = getPerformanceRuntimeStateForModeHook(context);

    if (!runtime) {
      return null;
    }

    return {
      scrollDirection: runtime.scrollDirection || 0,
      warmMarginScale: runtime.warmMarginScale || 1,
    };
  }

  function getPerformanceForegroundBusyHintForModeHook(context) {
    const runtime = getPerformanceRuntimeStateForModeHook(context);

    if (!runtime) {
      return false;
    }

    const now = Number.isFinite(context.now) ? context.now : performance.now();
    const lastScrollActivityAt = runtime.lastScrollActivityAt || 0;
    return lastScrollActivityAt > 0 && now - lastScrollActivityAt < 220;
  }

  function markPerformanceSelfMutationSuppressedForModeHook(context) {
    const runtime = getPerformanceRuntimeStateForModeHook(context);

    if (!runtime) {
      return 0;
    }

    runtime.selfMutationSuppressedCount += 1;
    return runtime.selfMutationSuppressedCount;
  }

  function queuePerformanceMeasurementBacklogForModeHook(context) {
    if (!Number.isFinite(context.recordId)) {
      return false;
    }

    const runtime = getPerformanceRuntimeStateForModeHook(context);

    if (!runtime) {
      return false;
    }

    queueRecord(runtime.measureBacklogIds, runtime.measureBacklogSet, context.recordId);
    return true;
  }

  function syncPerformanceMeasurementBacklog(runtime, controller, allowBacklogFill = false) {
    const nextBacklogIds = [];
    const nextBacklogSet = new Set();
    const backlogRecords = [];

    for (let index = 0; index < runtime.measureBacklogIds.length; index += 1) {
      const recordId = runtime.measureBacklogIds[index];
      const record = controller?.registry?.getById?.(recordId) || null;

      if (!record || (!record.needsMeasure && !record.needsContentProfile)) {
        continue;
      }

      nextBacklogIds.push(recordId);
      nextBacklogSet.add(recordId);

      if (allowBacklogFill) {
        backlogRecords.push(record);
      }
    }

    runtime.measureBacklogIds = nextBacklogIds;
    runtime.measureBacklogSet = nextBacklogSet;
    return backlogRecords;
  }

  function collectPerformanceMeasurementBacklogForModeHook(context) {
    const runtime = getPerformanceRuntimeStateForModeHook(context);

    if (!runtime) {
      return [];
    }

    return syncPerformanceMeasurementBacklog(
      runtime,
      context.controller,
      Boolean(context.allowBacklogFill)
    );
  }

  function prunePerformanceMeasurementBacklogForModeHook(context) {
    const runtime = getPerformanceRuntimeStateForModeHook(context);

    if (!runtime) {
      return 0;
    }

    syncPerformanceMeasurementBacklog(runtime, context.controller, false);
    return runtime.measureBacklogIds.length;
  }

  function recordPerformanceSlowSyncForModeHook(context) {
    const runtime = getPerformanceRuntimeStateForModeHook(context);

    if (!runtime || !Number.isFinite(context.durationMs)) {
      return 0;
    }

    const threshold = Math.max(1, context.thresholdMs || 32);
    runtime.consecutiveSlowSyncCount =
      context.durationMs >= threshold ? runtime.consecutiveSlowSyncCount + 1 : 0;
    return runtime.consecutiveSlowSyncCount;
  }

  function getPerformanceSearchNoticeStateForModeHook(context) {
    const runtime = getPerformanceRuntimeStateForModeHook(context);

    if (!runtime) {
      return null;
    }

    return {
      lastNoticeAt: runtime.lastNativeSearchNoticeAt || 0,
      noticeCount: runtime.nativeSearchDegradeNoticeCount || 0,
    };
  }

  function markPerformanceSearchNoticeForModeHook(context) {
    const runtime = getPerformanceRuntimeStateForModeHook(context);

    if (!runtime) {
      return null;
    }

    runtime.lastNativeSearchNoticeAt = Number.isFinite(context.now)
      ? context.now
      : performance.now();
    runtime.nativeSearchDegradeNoticeCount += 1;
    return {
      lastNoticeAt: runtime.lastNativeSearchNoticeAt,
      noticeCount: runtime.nativeSearchDegradeNoticeCount,
    };
  }

  function commitPerformanceSyncTelemetryForModeHook(context) {
    const runtime = getPerformanceRuntimeStateForModeHook(context);

    if (!runtime) {
      return null;
    }

    if (context.didRescanStructure) {
      runtime.structureRescanCount += 1;
    }

    runtime.warmStartIndex = Number.isInteger(context.warmStartIndex)
      ? context.warmStartIndex
      : -1;
    runtime.warmEndIndex = Number.isInteger(context.warmEndIndex)
      ? context.warmEndIndex
      : -1;

    if (context.performanceDecisionMetrics) {
      Object.assign(
        runtime,
        createEmptyPerformanceDecisionMetrics(),
        context.performanceDecisionMetrics
      );
    }

    return buildPerformanceMetricsProjection(runtime);
  }

  function isPerformanceCyclePreparedForModeHook({ strategySession }) {
    return Boolean(strategySession?.cyclePrepared);
  }

  function setPerformanceCyclePreparedForModeHook(context) {
    const strategySession = resolvePerformanceStrategySession(context);

    if (!strategySession) {
      return false;
    }

    strategySession.cyclePrepared = Boolean(context.prepared);
    return true;
  }

  Object.assign(performanceMode, {
    PERFORMANCE_CONSTANTS,
    t,
    createEmptyPerformanceDecisionMetrics,
    createPerformanceRuntime,
    createPerformanceSessionState,
    resolvePerformanceStrategySession,
    getPerformanceRuntime,
    queueRecord,
    pruneFreezeZones,
    preparePerformanceCycle,
    getWarmMargins,
    getDistanceBand,
    getPerformanceRuntimeStateForModeHook,
    buildPerformanceMetricsProjection,
    getPerformanceObserverHintsForModeHook,
    getPerformanceForegroundBusyHintForModeHook,
    markPerformanceSelfMutationSuppressedForModeHook,
    queuePerformanceMeasurementBacklogForModeHook,
    collectPerformanceMeasurementBacklogForModeHook,
    prunePerformanceMeasurementBacklogForModeHook,
    recordPerformanceSlowSyncForModeHook,
    getPerformanceSearchNoticeStateForModeHook,
    markPerformanceSearchNoticeForModeHook,
    commitPerformanceSyncTelemetryForModeHook,
    isPerformanceCyclePreparedForModeHook,
    setPerformanceCyclePreparedForModeHook,
  });
})();
