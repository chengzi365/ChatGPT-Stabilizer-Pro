(() => {
  const app = globalThis.__CSP__;
  const performanceMode = app.modes.performance || (app.modes.performance = {});

  app.modes.register({
    id: "performance",
    order: 40,
    tier: 2,
    family: "runtime",
    status: "implemented",
    selectable: true,
    runtimeLevel: "performance",
    fallbackTarget: "standard",
    riskTag: "medium",
    supportsSessionRestore: true,
    labelFallback: "Performance",
    descriptionKey: "levels.performance.description",
    descriptionFallback:
      "Higher-yield mode. Lightly collapses far history in place, restores near content on approach, and keeps existing DOM structure intact.",
    riskKey: "levels.performance.risk",
    riskFallback:
      "Medium risk. Folded remote history may need one click and about 0.25 to 0.5 seconds before copy, selection, or links are usable.",
    createSessionState: performanceMode.createPerformanceSessionState,
    getRuntimeState: performanceMode.getPerformanceRuntimeStateForModeHook,
    getObserverHints: performanceMode.getPerformanceObserverHintsForModeHook,
    getForegroundBusyHint: performanceMode.getPerformanceForegroundBusyHintForModeHook,
    markSelfMutationSuppressed:
      performanceMode.markPerformanceSelfMutationSuppressedForModeHook,
    queueMeasurementBacklog:
      performanceMode.queuePerformanceMeasurementBacklogForModeHook,
    collectMeasurementBacklog:
      performanceMode.collectPerformanceMeasurementBacklogForModeHook,
    pruneMeasurementBacklog:
      performanceMode.prunePerformanceMeasurementBacklogForModeHook,
    recordSlowSync: performanceMode.recordPerformanceSlowSyncForModeHook,
    getSearchNoticeState: performanceMode.getPerformanceSearchNoticeStateForModeHook,
    markSearchNotice: performanceMode.markPerformanceSearchNoticeForModeHook,
    commitSyncTelemetry: performanceMode.commitPerformanceSyncTelemetryForModeHook,
    isCyclePrepared: performanceMode.isPerformanceCyclePreparedForModeHook,
    setCyclePrepared: performanceMode.setPerformanceCyclePreparedForModeHook,
    prepareModeSwitch: performanceMode.preparePerformanceModeSwitch,
    clearRecordRuntime: performanceMode.clearPerformanceRecordRuntime,
    canReuseDecision: performanceMode.canReusePerformanceDecision,
    cacheDecision: performanceMode.cachePerformanceDecision,
    markRecordDecisionDirty: performanceMode.markPerformanceRecordDecisionDirty,
    collectDecisionWorkset: performanceMode.collectPerformanceDecisionWorkset,
    collectStateRefreshSet: performanceMode.collectPerformanceStateRefreshSet,
    buildEvaluationOrder: performanceMode.buildPerformanceEvaluationOrder,
    getCachedDecision: performanceMode.getCachedPerformanceDecision,
    evaluateRecord: performanceMode.evaluatePerformanceRecord,
    evaluateSession: performanceMode.evaluatePerformanceSession,
    syncSession: performanceMode.syncPerformanceSession,
  });
})();
