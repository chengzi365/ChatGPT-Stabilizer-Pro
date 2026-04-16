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

  app.runtime.syncPipelineControllerMethods = {
    beginSyncPipeline(reason, isResync) {
      const pageState = this.state.page;
      const pageService = this.services.page;
      const routeKey = pageService.getRouteKey();
      const pageSnapshot = pageService.resolveSyncContext({
        reason,
        isResync,
        routeKey,
      });

      return createSyncPipelineContext({
        reason,
        isResync,
        pageService,
        routeKey,
        pageSnapshot,
        sessionRouteChanged:
          pageSnapshot.routeChangedSinceLastSync &&
          Boolean(pageState.lastSyncedRouteKey),
      });
    },

    endSyncPipeline(pipelineContext) {
      const pageService = pipelineContext?.page?.service || this.services.page;

      pageService.endSync();
    },

    commitSyncPipelineRoute(pageService, routeKey) {
      pageService.commitSyncRoute(routeKey);
    },

    handleNonChatSyncPipeline(pipelineContext) {
      const pageState = this.state.page;
      const runtimeState = this.state.runtime;
      const pageService = pipelineContext.page.service;
      const pageSnapshot = pipelineContext.page.snapshot;
      const { routeKey, reason } = pipelineContext.begin;

      this.clearRouteFollowups();
      this.teardownObservers();
      this.ensureBootstrapDiscoveryObserver();

      this.clearAllRecordStyles(this.registry.getOrderedRecords());
      this.registry.clear();
      this.resetBaseRuntimeTracking();

      this.diagnostics.setPageState({
        isChatPage: false,
        threadReady: pageSnapshot.threadReady,
        path: globalThis.location.pathname,
        scrollRootReady: false,
        optimizationEnabled: false,
        runtimeProfile: runtimeState.runtimeProfile,
        deviceTier: runtimeState.deviceTier,
        activeAdapter: pageSnapshot.activeAdapterId || "",
        recognitionConfidence: pageSnapshot.recognitionConfidence || "none",
        lastSyncReason: reason,
      });
      this.diagnostics.setRuntimeStatus("disabled");
      this.diagnostics.setFallbackState({
        enabled: false,
        reason: "",
        lastError: "",
      });
      this.observeRuntimeHealth({
        runtimeStatus: "disabled",
        fallbackReason: "",
      });
      this.clearProtectionExpiry();
      this.diagnostics.setMetrics(createDisabledMetricsSnapshot());

      pageService.clearCollectionStats();

      this.syncModeStateToDiagnostics();
      this.syncSessionStateToDiagnostics();
      this.commitSyncPipelineRoute(pageService, routeKey);

      if (
        reason === "startup" ||
        reason === "route-change" ||
        pageSnapshot.routeChangedSinceLastSync
      ) {
        this.scheduleRouteFollowups(routeKey);
      }
    },

    prepareChatSyncPipelineContext(pipelineContext) {
      const pageState = this.state.page;
      const runtimeState = this.state.runtime;
      const pageService = pipelineContext.page.service;
      const pageSnapshot = pipelineContext.page.snapshot;
      const { reason, isResync } = pipelineContext.begin;
      const { chatRoot } = pipelineContext.page;
      const recordsState = pipelineContext.records;
      const runtimeContext = pipelineContext.runtime;

      if (pageSnapshot.routeChangedSinceLastSync) {
        this.resetTrackedMessages();
      }

      this.clearRouteFollowups();
      this.teardownBootstrapDiscoveryObserver();

      const shouldRescanStructure =
        this.registry.size() === 0 ||
        this.shouldRescanStructure(
          reason,
          isResync,
          pageSnapshot.routeChangedSinceLastSync
        );
      const didRescanStructure = shouldRescanStructure;
      let collectionStats = pageState.lastCollectionStats;

      if (shouldRescanStructure) {
        const collectionResult = pageService.collectSyncCollection(pageSnapshot);
        const syncResult = this.registry.sync(collectionResult.units);

        for (let index = 0; index < syncResult.removed.length; index += 1) {
          const removedRecord = syncResult.removed[index];

          this.clearBaseMetricsContribution(removedRecord);
          this.detachRecordObservation(removedRecord);
        }

        collectionStats = collectionResult.stats;
      }

      const records = this.registry.getOrderedRecords();
      const messageTotal =
        collectionStats.messageTotal > 0
          ? collectionStats.messageTotal
          : countUniqueMessageElements(records);
      const optimizationSupported =
        runtimeState.capabilities.contentVisibility &&
        runtimeState.capabilities.containIntrinsicSize;
      const levelConfig = this.getEffectiveLevelConfig();
      const thresholdReached =
        records.length >= levelConfig.minimumUnits || !levelConfig.enableOptimization;
      const canApplyOptimizationClasses =
        levelConfig.enableOptimization &&
        optimizationSupported &&
        thresholdReached;

      this.ensureObservers(
        levelConfig,
        chatRoot,
        pageSnapshot.scrollRoot,
        records
      );

      const latestAssistantRecord = this.findLatestAssistantRecord(records);
      const activeElement = document.activeElement;
      const selectionContainer = app.dom.getSelectionContainer();
      const focusedRecord = activeElement ? this.findRecordFromTarget(activeElement) : null;
      const selectedRecord = selectionContainer
        ? this.findRecordFromTarget(selectionContainer)
        : null;
      recordsState.items = records;
      recordsState.collectionStats = collectionStats;
      recordsState.messageTotal = messageTotal;
      recordsState.latestAssistantRecord = latestAssistantRecord;
      recordsState.focusedRecord = focusedRecord;
      recordsState.selectedRecord = selectedRecord;
      recordsState.rootRect = app.dom.getRootRect(pageSnapshot.scrollRoot);
      recordsState.didRescanStructure = didRescanStructure;
      runtimeContext.optimizationSupported = optimizationSupported;
      runtimeContext.thresholdReached = thresholdReached;
      runtimeContext.canApplyOptimizationClasses = canApplyOptimizationClasses;
      runtimeContext.shouldMeasureRecords =
        levelConfig.enableOptimization &&
        optimizationSupported &&
        thresholdReached;
      runtimeContext.levelConfig = levelConfig;
    },

    refreshChatSyncPipelineState(pipelineContext) {
      const recordsState = pipelineContext.records;
      const runtimeContext = pipelineContext.runtime;
      const measurementState = pipelineContext.measurement;
      const records = recordsState.items;
      const { reason, isResync, now } = pipelineContext.begin;
      const { rootRect, focusedRecord, selectedRecord, latestAssistantRecord } =
        recordsState;
      const { levelConfig, shouldMeasureRecords } = runtimeContext;
      const focusedRecordId = focusedRecord ? focusedRecord.id : 0;
      const selectedRecordId = selectedRecord ? selectedRecord.id : 0;
      const latestAssistantRecordId = latestAssistantRecord
        ? latestAssistantRecord.id
        : 0;
      const modeStateRefreshSet = this.collectModeStateRefreshSet({
        records,
        reason,
        isResync,
        now,
        focusedRecordId,
        selectedRecordId,
        latestAssistantRecordId,
        keepAliveCount: levelConfig.keepAliveCount,
      });
      const usingModeStateRefreshSet = modeStateRefreshSet instanceof Set;
      const baseStateRefreshSet = usingModeStateRefreshSet
        ? null
        : this.collectBaseStateRefreshSet(
            records,
            reason,
            isResync,
            focusedRecordId,
            selectedRecordId,
            latestAssistantRecordId
          );
      const baseStateRefreshRecords = usingModeStateRefreshSet
        ? null
        : this.resolveOrderedBaseWorksetRecords(baseStateRefreshSet);

      if (usingModeStateRefreshSet) {
        for (let index = 0; index < records.length; index += 1) {
          const record = records[index];

          if (!modeStateRefreshSet.has(record.id)) {
            continue;
          }

          this.updateRecordState({
            record,
            index,
            totalRecords: records.length,
            rootRect,
            margin: levelConfig.nearViewportMargin,
            focusedRecordId,
            selectedRecordId,
            latestAssistantRecord,
            now,
            keepAliveCount: levelConfig.keepAliveCount,
            reason,
            isResync,
          });
        }
      } else {
        const refreshRecords = baseStateRefreshRecords || records;

        for (let index = 0; index < refreshRecords.length; index += 1) {
          const record = refreshRecords[index];
          const recordIndex = Number.isFinite(record.orderIndex)
            ? record.orderIndex
            : index;

          this.updateRecordState({
            record,
            index: recordIndex,
            totalRecords: records.length,
            rootRect,
            margin: levelConfig.nearViewportMargin,
            focusedRecordId,
            selectedRecordId,
            latestAssistantRecord,
            now,
            keepAliveCount: levelConfig.keepAliveCount,
            reason,
            isResync,
          });
        }
      }

      const measurementResult = shouldMeasureRecords
        ? this.measurePendingRecords(records, reason, isResync)
        : { pending: 0 };

      if (usingModeStateRefreshSet) {
        this.setModeCyclePrepared(null, false, { ensure: false });
      }
      measurementState.result = measurementResult;
      measurementState.modeStateRefreshSet = modeStateRefreshSet;
      measurementState.baseStateRefreshSet = baseStateRefreshSet;
      measurementState.baseStateRefreshRecords = baseStateRefreshRecords;
      pipelineContext.decision.modeDecisionWorkset = this.collectModeDecisionWorkset(
        records,
        reason,
        isResync
      );
      pipelineContext.decision.baseDecisionWorkset = usingModeStateRefreshSet
        ? null
        : this.collectBaseDecisionWorkset(baseStateRefreshSet, reason, isResync);
    },

    evaluateChatSyncPipelineDecisions(pipelineContext) {
      const recordsState = pipelineContext.records;
      const runtimeContext = pipelineContext.runtime;
      const decisionState = pipelineContext.decision;
      const metricsState = pipelineContext.metrics;
      const records = recordsState.items;
      const { levelConfig, canApplyOptimizationClasses } = runtimeContext;
      const { reason, isResync } = pipelineContext.begin;
      const { rootRect } = recordsState;
      const { modeDecisionWorkset, baseDecisionWorkset } = decisionState;
      const usingModeDecisionWorkset = modeDecisionWorkset instanceof Set;
      const baseDecisionRecords = usingModeDecisionWorkset
        ? null
        : this.resolveOrderedBaseWorksetRecords(baseDecisionWorkset);
      const modeEvaluationOrder =
        modeDecisionWorkset && modeDecisionWorkset.size > 0
          ? this.buildModeEvaluationOrder(records, modeDecisionWorkset)
          : null;
      const preEvaluatedModeDecisions = new Map();
      let keepAliveCount = 0;
      let protectedCount = 0;
      let visibleCount = 0;
      let nearViewportCount = 0;
      let optimizableCount = 0;
      let optimizedCount = 0;
      let estimatedSkippedHeight = 0;
      let estimatedControlledNodes = 0;
      let pendingAnchorAdjustment = 0;
      let pendingMeasureFollowup = false;
      let warmStartIndex = -1;
      let warmEndIndex = -1;
      const performanceDecisionMetrics =
        this.state.runtime.effectiveMode === "performance"
          ? createEmptyPerformanceDecisionMetrics()
          : null;

      if (Array.isArray(modeEvaluationOrder)) {
        modeEvaluationOrder.forEach((recordIndex) => {
          const record = records[recordIndex];

          if (!record) {
            return;
          }

          const decision = this.evaluateRecordDecision({
            record,
            recordIndex,
            totalRecords: records.length,
            levelConfig,
            canApplyOptimizationClasses,
            reason,
            isResync,
            rootRect,
            records,
          });

          this.cacheModeDecision(record, decision);
          preEvaluatedModeDecisions.set(record.id, decision);
        });
      }

      if (usingModeDecisionWorkset) {
        for (let index = 0; index < records.length; index += 1) {
          const record = records[index];
          const defaultDecision = this.createDefaultRecordDecision({
            record,
            levelConfig,
            canApplyOptimizationClasses,
          });

          if (record.pinned) {
            keepAliveCount += 1;
          }

          if (record.protected) {
            protectedCount += 1;
          }

          if (record.visible) {
            visibleCount += 1;
          }

          if (record.nearViewport) {
            nearViewportCount += 1;
          }

          const shouldEvaluateRecord =
            !modeDecisionWorkset || modeDecisionWorkset.has(record.id);
          const hasPreEvaluatedDecision = preEvaluatedModeDecisions.has(record.id);
          const shouldEvaluateInline =
            shouldEvaluateRecord && !hasPreEvaluatedDecision;
          const decision = hasPreEvaluatedDecision
            ? preEvaluatedModeDecisions.get(record.id)
            : shouldEvaluateInline
            ? this.evaluateRecordDecision({
                record,
                recordIndex: index,
                totalRecords: records.length,
                levelConfig,
                canApplyOptimizationClasses,
                reason,
                isResync,
                rootRect,
                records,
              })
            : this.getCachedModeDecision(record, defaultDecision);

          if (shouldEvaluateInline) {
            this.cacheModeDecision(record, decision);
          }

          if (decision.eligible) {
            optimizableCount += 1;
          }

          record.optimized = Boolean(decision.optimize);

          if (record.optimized) {
            optimizedCount += 1;
            estimatedSkippedHeight +=
              decision.estimatedSkippedHeight || record.lastMeasuredHeight || 0;
            estimatedControlledNodes += Number.isFinite(decision.controlledNodeEstimate)
              ? decision.controlledNodeEstimate
              : record.nodeCountEstimate || 0;
          }

          if (Number.isFinite(decision.anchorAdjustment)) {
            pendingAnchorAdjustment += decision.anchorAdjustment;
          }

          if (decision.requiresMeasurementFollowup) {
            pendingMeasureFollowup = true;
          }

          accumulatePerformanceDecisionMetrics(performanceDecisionMetrics, decision);

          if (hasPreEvaluatedDecision || shouldEvaluateInline) {
            this.applyRecordStyles(record, decision);
          }

          if (record.performanceBand !== "far") {
            if (warmStartIndex === -1) {
              warmStartIndex = index;
            }

            warmEndIndex = index;
          }
        }
      } else {
        const decisionRecords = baseDecisionRecords || records;

        for (let index = 0; index < decisionRecords.length; index += 1) {
          const record = decisionRecords[index];
          const recordIndex = Number.isFinite(record.orderIndex)
            ? record.orderIndex
            : index;
          const decision = this.evaluateRecordDecision({
            record,
            recordIndex,
            totalRecords: records.length,
            levelConfig,
            canApplyOptimizationClasses,
            reason,
            isResync,
            rootRect,
            records,
          });

          record.optimized = Boolean(decision.optimize);

          if (Number.isFinite(decision.anchorAdjustment)) {
            pendingAnchorAdjustment += decision.anchorAdjustment;
          }

          if (decision.requiresMeasurementFollowup) {
            pendingMeasureFollowup = true;
          }

          accumulatePerformanceDecisionMetrics(performanceDecisionMetrics, decision);

          this.applyRecordStyles(record, decision);

          this.updateBaseMetricsContribution(record, decision);
        }

        const baseMetrics = this.state.measurement.baseMetricsTotals;

        keepAliveCount = baseMetrics.keepAlive;
        protectedCount = baseMetrics.protected;
        visibleCount = baseMetrics.visible;
        nearViewportCount = baseMetrics.nearViewport;
        optimizableCount = baseMetrics.optimizable;
        optimizedCount = baseMetrics.optimized;
        estimatedSkippedHeight = baseMetrics.estimatedSkippedHeight;
        estimatedControlledNodes = baseMetrics.estimatedControlledNodes;
      }
      metricsState.keepAliveCount = keepAliveCount;
      metricsState.protectedCount = protectedCount;
      metricsState.visibleCount = visibleCount;
      metricsState.nearViewportCount = nearViewportCount;
      metricsState.optimizableCount = optimizableCount;
      metricsState.optimizedCount = optimizedCount;
      metricsState.estimatedSkippedHeight = estimatedSkippedHeight;
      metricsState.estimatedControlledNodes = estimatedControlledNodes;
      metricsState.warmStartIndex = warmStartIndex;
      metricsState.warmEndIndex = warmEndIndex;
      metricsState.performanceDecisionMetrics = performanceDecisionMetrics;
      decisionState.pendingAnchorAdjustment = pendingAnchorAdjustment;
      decisionState.pendingMeasureFollowup = pendingMeasureFollowup;
    },

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

      if (isResync) {
        this.diagnostics.pushEvent("resync", "events.resyncComplete", "info", {
          reason: formatReason(reason),
        });
      } else if (reason !== "visibility-change") {
        this.diagnostics.pushEvent("sync", "events.syncComplete", "info", {
          reason: formatReason(reason),
        });
      }
    },

    runSyncPipeline(reason, isResync) {
      const pipelineContext = this.beginSyncPipeline(reason, isResync);

      try {
        if (pipelineContext.begin.sessionRouteChanged) {
          this.resetSessionRuntimeState();
        }

        if (!pipelineContext.page.isChatPage) {
          this.handleNonChatSyncPipeline(pipelineContext);
          return;
        }

        this.prepareChatSyncPipelineContext(pipelineContext);
        this.refreshChatSyncPipelineState(pipelineContext);
        this.evaluateChatSyncPipelineDecisions(pipelineContext);
        this.finalizeChatSyncPipeline(pipelineContext);
      } finally {
        this.endSyncPipeline(pipelineContext);
      }
    },
  };
})();
