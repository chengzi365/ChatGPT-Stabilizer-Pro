(() => {
  const app = globalThis.__CSP__;
  const i18n = app.core.i18n;

  function formatReason(reason) {
    return i18n.t(`syncReasons.${reason}`, {}, reason);
  }

  function countUniqueMessageElements(records) {
    const seenElements = new Set();

    for (let index = 0; index < records.length; index += 1) {
      const messageElement = records[index]?.messageElement;

      if (messageElement) {
        seenElements.add(messageElement);
      }
    }

    return seenElements.size;
  }

  function createDisabledMetricsSnapshot() {
    return {
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
    };
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

  function accumulatePerformanceDecisionMetrics(metrics, decision) {
    const diagnostics = decision?.performanceDiagnostics;

    if (!metrics || !diagnostics) {
      return;
    }

    if (diagnostics.far) {
      metrics.performanceFarCount += 1;
    }

    if (diagnostics.benefitEligible) {
      metrics.performanceBenefitEligibleCount += 1;
    }

    if (diagnostics.collapsePending) {
      metrics.performanceCollapsePendingCount += 1;
    }

    if (diagnostics.collapsedStable) {
      metrics.performanceCollapsedStableCount += 1;
    }

    if (diagnostics.blockedByBenefit) {
      metrics.performanceBlockedByBenefitCount += 1;
    }

    if (diagnostics.blockedByWriteWindow) {
      metrics.performanceBlockedByWriteWindowCount += 1;
    }

    if (diagnostics.blockedByBudget) {
      metrics.performanceBlockedByBudgetCount += 1;
    }

    if (diagnostics.blockedByDwell) {
      metrics.performanceBlockedByDwellCount += 1;
    }

    if (diagnostics.expandedByProtection) {
      metrics.performanceExpandedByProtectionCount += 1;
    }
  }

  function createSyncPipelineContext({
    reason,
    isResync,
    pageService,
    routeKey,
    pageSnapshot,
    sessionRouteChanged,
  }) {
    return {
      begin: {
        reason,
        isResync,
        routeKey,
        now: performance.now(),
        sessionRouteChanged,
        streamingOnlyDomContent: false,
      },
      page: {
        service: pageService,
        snapshot: pageSnapshot,
        chatRoot: pageSnapshot.chatRoot,
        isChatPage: pageSnapshot.isChatPage,
      },
      records: {
        items: [],
        collectionStats: null,
        messageTotal: 0,
        structureDiff: null,
        latestAssistantRecord: null,
        focusedRecord: null,
        selectedRecord: null,
        rootRect: null,
        didRescanStructure: false,
      },
      runtime: {
        levelConfig: null,
        optimizationSupported: false,
        thresholdReached: false,
        canApplyOptimizationClasses: false,
        shouldMeasureRecords: false,
      },
      measurement: {
        result: { pending: 0 },
        modeStateRefreshSet: null,
        baseStateRefreshSet: null,
        baseStateRefreshRecords: null,
      },
      decision: {
        modeDecisionWorkset: null,
        baseDecisionWorkset: null,
        styleTasks: [],
        pendingAnchorAdjustment: 0,
        pendingMeasureFollowup: false,
      },
      metrics: {
        keepAliveCount: 0,
        protectedCount: 0,
        visibleCount: 0,
        nearViewportCount: 0,
        optimizableCount: 0,
        optimizedCount: 0,
        estimatedSkippedHeight: 0,
        estimatedControlledNodes: 0,
        warmStartIndex: -1,
        warmEndIndex: -1,
        performanceDecisionMetrics: null,
      },
    };
  }

  function getTraceRecordSummary(controller, record) {
    if (
      !controller?.traceRecorder ||
      typeof controller.traceRecorder.buildTraceRecordSummary !== "function"
    ) {
      return null;
    }

    return controller.traceRecorder.buildTraceRecordSummary(record);
  }

  function getSetSize(value) {
    return value instanceof Set ? value.size : 0;
  }

  function buildPipelineTraceDetail(controller, pipelineContext, extra = {}) {
    const pageSnapshot = pipelineContext?.page?.snapshot || {};
    const routeSummary =
      controller?.traceRecorder &&
      typeof controller.traceRecorder.buildRouteSummary === "function"
        ? controller.traceRecorder.buildRouteSummary(
            globalThis.location,
            pipelineContext?.page?.chatRoot
          )
        : {};

    return {
      reason: pipelineContext?.begin?.reason || "",
      isResync: Boolean(pipelineContext?.begin?.isResync),
      sessionRouteChanged: Boolean(pipelineContext?.begin?.sessionRouteChanged),
      routeHash: routeSummary.routeHash || "",
      pathHash: routeSummary.pathHash || "",
      activeAdapter: pageSnapshot.activeAdapterId || "",
      isChatPage: Boolean(pipelineContext?.page?.isChatPage),
      threadReady: Boolean(pageSnapshot.threadReady),
      ...extra,
    };
  }

  function recordPipelineStage(controller, type, pipelineContext, extra = {}) {
    controller.recordTraceEntry(
      "pipeline",
      type,
      buildPipelineTraceDetail(controller, pipelineContext, extra),
      { includeSnapshot: false }
    );
  }

  app.runtime.syncPipelineShared = Object.freeze({
    formatReason,
    countUniqueMessageElements,
    createDisabledMetricsSnapshot,
    createEmptyPerformanceDecisionMetrics,
    accumulatePerformanceDecisionMetrics,
    createSyncPipelineContext,
    getTraceRecordSummary,
    getSetSize,
    buildPipelineTraceDetail,
    recordPipelineStage,
  });
})();
