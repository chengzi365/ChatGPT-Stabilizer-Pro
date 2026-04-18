(() => {
  const app = globalThis.__CSP__;
  const {
    formatReason,
    getTraceRecordSummary,
    recordPipelineStage,
  } = app.runtime.syncPipelineShared;
  const syncPipelineControllerMethods =
    app.runtime.syncPipelineControllerMethods ||
    (app.runtime.syncPipelineControllerMethods = {});

  Object.assign(syncPipelineControllerMethods, {
    finalizeChatSyncPipeline(pipelineContext) {
      const runtimeState = this.state.runtime;
      const observerState = this.state.observers;
      const pageService = pipelineContext.page.service;
      const pageSnapshot = pipelineContext.page.snapshot;
      const recordsState = pipelineContext.records;
      const runtimeContext = pipelineContext.runtime;
      const measurementState = pipelineContext.measurement;
      const decisionState = pipelineContext.decision;
      const metricsState = pipelineContext.metrics;
      const { routeKey, reason, isResync } = pipelineContext.begin;
      const records = recordsState.items;
      const { collectionStats, messageTotal, didRescanStructure } = recordsState;
      const {
        canApplyOptimizationClasses,
        optimizationSupported,
        thresholdReached,
        levelConfig,
      } = runtimeContext;
      const measurementResult = measurementState.result;
      const {
        keepAliveCount,
        protectedCount,
        visibleCount,
        nearViewportCount,
        optimizableCount: initialOptimizableCount,
        optimizedCount: initialOptimizedCount,
        estimatedSkippedHeight: initialEstimatedSkippedHeight,
        estimatedControlledNodes: initialEstimatedControlledNodes,
        warmStartIndex,
        warmEndIndex,
        performanceDecisionMetrics,
      } = metricsState;
      const { pendingAnchorAdjustment, pendingMeasureFollowup } = decisionState;
      let optimizableCount = initialOptimizableCount;
      let optimizedCount = initialOptimizedCount;
      let estimatedSkippedHeight = initialEstimatedSkippedHeight;
      let estimatedControlledNodes = initialEstimatedControlledNodes;
      let anchorAdjustmentApplied = false;

      if (pendingAnchorAdjustment !== 0) {
        anchorAdjustmentApplied = this.applyScrollAnchorAdjustment(
          pendingAnchorAdjustment
        );
      }

      this.applyBottomFollowIfNeeded();

      if (runtimeState.level === "off") {
        this.clearAllRecordStyles(records);
        optimizedCount = 0;
        optimizableCount = 0;
        estimatedSkippedHeight = 0;
        estimatedControlledNodes = 0;
        this.teardownObservers();
      }

      if (runtimeState.level === "monitor") {
        this.clearAllRecordStyles(records);
        optimizedCount = 0;
        estimatedSkippedHeight = 0;
        estimatedControlledNodes = 0;
      }

      let runtimeStatus = this.getRuntimeStatus({
        isChatPage: true,
        optimizationSupported,
        thresholdReached,
        recognitionFailures: collectionStats.failures,
      });
      let fallbackReason =
        runtimeStatus === "fallback"
          ? "css-capability"
          : runtimeStatus === "degraded"
          ? "recognition-failures"
          : "";
      let reportedUnitTotal = records.length;
      let reportedRegistered = this.registry.size();
      let reportedObserved = observerState.observedIds.size;
      let nextKeepAliveCount = keepAliveCount;
      let nextProtectedCount = protectedCount;
      let nextVisibleCount = visibleCount;
      let nextNearViewportCount = nearViewportCount;

      const sessionEvaluation = this.evaluateModeSession({
        records,
        levelConfig,
        canApplyOptimizationClasses,
        runtimeStatus,
        fallbackReason,
        reason,
        isResync,
      });

      if (sessionEvaluation) {
        this.restoreCurrentSession(sessionEvaluation.reason, {
          forcedModeId: sessionEvaluation.forcedModeId,
          lock: sessionEvaluation.lock !== false,
          emitRequestedEvent: false,
        });
        runtimeStatus = "degraded";
        fallbackReason = sessionEvaluation.reason;
        optimizedCount = 0;
        optimizableCount = 0;
        nextKeepAliveCount = 0;
        nextProtectedCount = 0;
        nextVisibleCount = 0;
        nextNearViewportCount = 0;
        estimatedSkippedHeight = 0;
        estimatedControlledNodes = 0;
        reportedUnitTotal = 0;
        reportedRegistered = this.registry.size();
        reportedObserved = observerState.observedIds.size;
      }

      const coverageRate =
        optimizableCount > 0 ? optimizedCount / Math.max(optimizableCount, 1) : 0;
      const protectedShare =
        records.length > 0 ? nextProtectedCount / Math.max(records.length, 1) : 0;
      const benefitLevel = this.getBenefitLevel(coverageRate, estimatedSkippedHeight);
      const performanceMetrics =
        runtimeState.effectiveMode === "performance"
          ? this.commitActiveModeSyncTelemetry({
              didRescanStructure,
              warmStartIndex,
              warmEndIndex,
              performanceDecisionMetrics,
            })
          : null;

      this.syncActiveModeStrategySession({
        records,
        levelConfig,
        canApplyOptimizationClasses,
        runtimeStatus,
        fallbackReason,
        reason,
        isResync,
        pageSnapshot,
        collectionStats,
        thresholdReached,
        messageTotal,
        unitTotal: reportedUnitTotal,
        registeredTotal: reportedRegistered,
        observedTotal: reportedObserved,
        optimizableCount,
        optimizedCount,
        keepAliveCount: nextKeepAliveCount,
        protectedCount: nextProtectedCount,
        visibleCount: nextVisibleCount,
        nearViewportCount: nextNearViewportCount,
        estimatedSkippedHeight,
        estimatedControlledNodes,
        coverageRate,
        protectedShare,
        benefitLevel,
      });

      this.diagnostics.setRuntimeStatus(runtimeStatus);
      this.diagnostics.setFallbackState({
        enabled: runtimeStatus === "fallback" || runtimeStatus === "degraded",
        reason: fallbackReason,
        lastError: "",
      });
      this.diagnostics.setPageState({
        isChatPage: true,
        threadReady: pageSnapshot.threadReady,
        path: globalThis.location.pathname,
        scrollRootReady: Boolean(pageSnapshot.scrollRoot),
        optimizationEnabled: canApplyOptimizationClasses && runtimeStatus === "active",
        runtimeProfile: runtimeState.runtimeProfile,
        deviceTier: runtimeState.deviceTier,
        activeAdapter: pageSnapshot.activeAdapterId || "",
        recognitionConfidence: pageSnapshot.recognitionConfidence || "none",
        lastSyncReason: reason,
      });
      this.diagnostics.setMetrics({
        messageTotal,
        unitTotal: reportedUnitTotal,
        discovered: collectionStats.discovered,
        registered: reportedRegistered,
        observed: reportedObserved,
        optimizable: optimizableCount,
        optimized: optimizedCount,
        keepAlive: nextKeepAliveCount,
        protected: nextProtectedCount,
        visible: nextVisibleCount,
        nearViewport: nextNearViewportCount,
        pendingMeasurements: measurementResult.pending || 0,
        recognitionFailures: collectionStats.failures,
        skippedMessages: collectionStats.skipped,
        coverageRate,
        protectedShare,
        estimatedSkippedHeight,
        estimatedControlledNodes,
        benefitLevel,
        collapsedCount: performanceMetrics?.collapsedCount || 0,
        collapseQueueSize: performanceMetrics?.collapseQueueSize || 0,
        restoreQueueSize: performanceMetrics?.restoreQueueSize || 0,
        stateTransitionCount: performanceMetrics?.stateTransitionCount || 0,
        selfMutationSuppressedCount:
          performanceMetrics?.selfMutationSuppressedCount || 0,
        anchorCorrectionCount:
          performanceMetrics?.anchorCorrectionCount ||
          (anchorAdjustmentApplied ? 1 : 0),
        anchorCorrectionFailureCount:
          performanceMetrics?.anchorCorrectionFailureCount ||
          (pendingAnchorAdjustment !== 0 && !anchorAdjustmentApplied ? 1 : 0),
        sessionCollapseBlockedCount:
          performanceMetrics?.sessionCollapseBlockedCount || 0,
        localFreezeZoneCount: performanceMetrics?.localFreezeZoneCount || 0,
        benefitRejectedCount: performanceMetrics?.benefitRejectedCount || 0,
        structureRescanCount: performanceMetrics?.structureRescanCount || 0,
        consecutiveSlowSyncCount:
          performanceMetrics?.consecutiveSlowSyncCount || 0,
        nativeSearchDegradeNoticeCount:
          performanceMetrics?.nativeSearchDegradeNoticeCount || 0,
        performanceFarCount: performanceMetrics?.performanceFarCount || 0,
        performanceBenefitEligibleCount:
          performanceMetrics?.performanceBenefitEligibleCount || 0,
        performanceCollapsePendingCount:
          performanceMetrics?.performanceCollapsePendingCount || 0,
        performanceCollapsedStableCount:
          performanceMetrics?.performanceCollapsedStableCount || 0,
        performanceBlockedByBenefitCount:
          performanceMetrics?.performanceBlockedByBenefitCount || 0,
        performanceBlockedByWriteWindowCount:
          performanceMetrics?.performanceBlockedByWriteWindowCount || 0,
        performanceBlockedByBudgetCount:
          performanceMetrics?.performanceBlockedByBudgetCount || 0,
        performanceBlockedByDwellCount:
          performanceMetrics?.performanceBlockedByDwellCount || 0,
        performanceExpandedByProtectionCount:
          performanceMetrics?.performanceExpandedByProtectionCount || 0,
      });
      this.commitSyncPipelineRoute(pageService, routeKey);

      if (measurementResult.pending > 0) {
        if (runtimeState.effectiveMode === "performance") {
          this.scheduleLowPrioritySync("measurement-backlog");
        } else {
          this.scheduleSync("measurement-backlog", false);
        }
      }

      if (pendingMeasureFollowup) {
        if (runtimeState.effectiveMode === "performance") {
          this.scheduleLowPrioritySync("measurement-backlog");
        } else {
          this.scheduleSync("measurement-backlog", false);
        }
      }

      if (runtimeState.level === "off") {
        this.clearProtectionExpiry();
      } else {
        this.refreshProtectionExpiry(records, pipelineContext.begin.now);
      }

      this.observeRuntimeHealth({
        runtimeStatus,
        fallbackReason,
      });
      this.syncModeStateToDiagnostics();

      recordPipelineStage(this, "finalize-chat", pipelineContext, {
        runtimeStatus,
        fallbackReason,
        recordCount: records.length,
        registeredCount: reportedRegistered,
        observedCount: reportedObserved,
        messageTotal,
        optimizableCount,
        optimizedCount,
        keepAliveCount: nextKeepAliveCount,
        protectedCount: nextProtectedCount,
        visibleCount: nextVisibleCount,
        nearViewportCount: nextNearViewportCount,
        estimatedSkippedHeight,
        estimatedControlledNodes,
        coverageRate,
        protectedShare,
        benefitLevel,
        measurementPending: measurementResult.pending || 0,
        pendingMeasureFollowup,
        pendingAnchorAdjustment,
        anchorAdjustmentApplied,
        sessionEvaluation: sessionEvaluation
          ? {
              reason: sessionEvaluation.reason || "",
              forcedModeId: sessionEvaluation.forcedModeId || "",
              lock: sessionEvaluation.lock !== false,
            }
          : null,
        performanceMetrics: performanceMetrics
          ? {
              collapsedCount: performanceMetrics.collapsedCount || 0,
              collapseQueueSize: performanceMetrics.collapseQueueSize || 0,
              restoreQueueSize: performanceMetrics.restoreQueueSize || 0,
              stateTransitionCount: performanceMetrics.stateTransitionCount || 0,
              nativeSearchDegradeNoticeCount:
                performanceMetrics.nativeSearchDegradeNoticeCount || 0,
            }
          : null,
        latestAssistantRecord: getTraceRecordSummary(
          this,
          recordsState.latestAssistantRecord
        ),
        focusedRecord: getTraceRecordSummary(this, recordsState.focusedRecord),
        selectedRecord: getTraceRecordSummary(this, recordsState.selectedRecord),
      });

      if (isResync) {
        this.diagnostics.pushEvent("resync", "events.resyncComplete", "info", {
          reason: formatReason(reason),
        });
      } else if (reason !== "visibility-change") {
        this.diagnostics.pushEvent("sync", "events.syncComplete", "info", {
          reason: formatReason(reason),
        });
      }

      return {
        optimizedCount,
        unitTotal: reportedUnitTotal,
        hasContinuationSync:
          (measurementResult.pending || 0) > 0 || Boolean(pendingMeasureFollowup),
      };
    },
  });
})();
