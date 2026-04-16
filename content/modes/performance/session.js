(() => {
  const app = globalThis.__CSP__;
  const performanceMode = app.modes.performance || (app.modes.performance = {});
  const {
    PERFORMANCE_CONSTANTS,
    createPerformanceSessionState,
    getPerformanceRuntime,
  } = performanceMode;

  function preparePerformanceModeSwitch({
    controller,
    records,
    nextModeId,
    mode,
  }) {
    const switchingIntoPerformance = nextModeId === mode.id;

    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];

      record.performanceWarmObserved = false;
      record.performanceNeedsDecision = true;
      record.performanceDirty = true;
      record.performanceDecisionCache = null;

      if (
        switchingIntoPerformance &&
        (record.needsContentProfile ||
          !record.contentProfileCache?.signature ||
          record.nodeCountEstimate == null ||
          record.structureScoreEstimate == null ||
          record.richContentCountEstimate == null ||
          record.textLengthEstimate == null ||
          record.plainTextDominant == null)
      ) {
        record.needsContentProfile = true;
        controller.queueMeasurementRecord(record.id);
      }
    }

    controller.clearModeStrategySession(mode.id);
  }

  function clearPerformanceRecordRuntime({ record }) {
    record.performanceCollapsed = false;
    record.performanceBand = "";
    record.performanceState = "expanded";
    record.performanceWarmObserved = false;
    record.performanceNeedsDecision = true;
    record.performanceDirty = true;
    record.performanceDecisionCache = null;
    record.performancePlaceholderHeight = 0;
    record.performanceFarSince = 0;
    record.performanceRestoreReason = "";
    record.performanceNoCollapseUntil = 0;
    record.recentEmergencyRestoreCount = 0;
    record.sessionCollapseBlocked = false;
    record.localFreezeZoneId = "";
  }

  function evaluatePerformanceSession({ services, strategySession }) {
    const performanceSession = strategySession || createPerformanceSessionState();
    const runtime = getPerformanceRuntime(performanceSession);

    runtime.collapseQueueSize = runtime.collapseQueueIds.length;
    runtime.restoreQueueSize = runtime.restoreQueueIds.length;
    runtime.localFreezeZoneCount = runtime.localFreezeZones.length;

    if (!runtime.hasPendingBacklog) {
      runtime.backlogStartedAt = 0;
      runtime.followupCount = 0;
      return null;
    }

    if (!runtime.backlogStartedAt) {
      runtime.backlogStartedAt = runtime.cycleNow || performance.now();
    }

    const backlogAge =
      (runtime.cycleNow || performance.now()) - runtime.backlogStartedAt;
    const hasUrgentRestoreBacklog = runtime.restoreQueueSize > 0;
    const canChainFollowup =
      backlogAge <= PERFORMANCE_CONSTANTS.backlogWindowMs &&
      runtime.followupCount < PERFORMANCE_CONSTANTS.backlogFollowupLimit;

    if (hasUrgentRestoreBacklog && canChainFollowup) {
      runtime.followupCount += 1;
      services?.scheduler?.scheduleSync?.("visibility-change", false);
      return null;
    }

    if (canChainFollowup) {
      runtime.followupCount += 1;
      services?.scheduler?.scheduleLowPrioritySync?.("measurement-backlog");
      return null;
    }

    if (runtime.collapseQueueSize > 0) {
      services?.scheduler?.scheduleSync?.("measurement-backlog", false);
      return null;
    }

    return null;
  }

  function syncPerformanceSession({ strategySession, reason }) {
    const performanceSession = strategySession || createPerformanceSessionState();

    performanceSession.lastSyncReason = reason || "";
    performanceSession.lastBacklogReason = performanceSession.runtime?.hasPendingBacklog
      ? reason || ""
      : performanceSession.lastBacklogReason || "";

    return performanceSession;
  }

  Object.assign(performanceMode, {
    preparePerformanceModeSwitch,
    clearPerformanceRecordRuntime,
    evaluatePerformanceSession,
    syncPerformanceSession,
  });
})();
