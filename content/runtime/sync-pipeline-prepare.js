(() => {
  const app = globalThis.__CSP__;
  const {
    countUniqueMessageElements,
    createDisabledMetricsSnapshot,
    getTraceRecordSummary,
    getSetSize,
    recordPipelineStage,
  } = app.runtime.syncPipelineShared;
  const syncPipelineControllerMethods =
    app.runtime.syncPipelineControllerMethods ||
    (app.runtime.syncPipelineControllerMethods = {});

  Object.assign(syncPipelineControllerMethods, {
    handleNonChatSyncPipeline(pipelineContext) {
      const pageState = this.state.page;
      const runtimeState = this.state.runtime;
      const pageService = pipelineContext.page.service;
      const pageSnapshot = pipelineContext.page.snapshot;
      const { routeKey, reason } = pipelineContext.begin;
      const clearedRecordCount = this.registry.size();

      this.clearRouteFollowups();
      this.clearOptimizationOverlayJob();
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
      recordPipelineStage(this, "non-chat-exit", pipelineContext, {
        runtimeStatus: "disabled",
        fallbackReason: "",
        clearedRecordCount,
      });
      this.commitSyncPipelineRoute(pageService, routeKey);

      if (
        reason === "startup" ||
        reason === "route-change" ||
        pageSnapshot.routeChangedSinceLastSync
      ) {
        this.scheduleRouteFollowups(routeKey);
      }
    },

    handleOffChatSyncPipeline(pipelineContext) {
      const pageService = pipelineContext.page.service;
      const pageSnapshot = pipelineContext.page.snapshot;
      const runtimeState = this.state.runtime;
      const { routeKey, reason } = pipelineContext.begin;
      const records = this.registry.getOrderedRecords();

      this.clearRouteFollowups();
      this.clearOptimizationOverlayJob();
      this.teardownObservers();
      this.teardownBootstrapDiscoveryObserver();
      this.clearAllRecordStyles(records);
      this.registry.clear();
      this.resetTrackedMessages();
      this.resetBaseRuntimeTracking();
      this.clearProtectionExpiry();

      this.diagnostics.setPageState({
        isChatPage: true,
        threadReady: pageSnapshot.threadReady,
        path: globalThis.location.pathname,
        scrollRootReady: Boolean(pageSnapshot.scrollRoot),
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
      this.diagnostics.setMetrics(createDisabledMetricsSnapshot());
      this.observeRuntimeHealth({
        runtimeStatus: "disabled",
        fallbackReason: "",
      });

      pageService.clearCollectionStats();

      this.syncModeStateToDiagnostics();
      this.syncSessionStateToDiagnostics();
      recordPipelineStage(this, "off-chat-exit", pipelineContext, {
        runtimeStatus: "disabled",
        fallbackReason: "",
        clearedRecordCount: records.length,
      });
      this.commitSyncPipelineRoute(pageService, routeKey);
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

      recordPipelineStage(this, "collect-records", pipelineContext, {
        didRescanStructure,
        recordCount: records.length,
        messageTotal,
        optimizationSupported,
        thresholdReached,
        canApplyOptimizationClasses,
        collectionStats: collectionStats
          ? {
              discovered: collectionStats.discovered,
              skipped: collectionStats.skipped,
              failures: collectionStats.failures,
            }
          : null,
        latestAssistantRecord: getTraceRecordSummary(this, latestAssistantRecord),
        focusedRecord: getTraceRecordSummary(this, focusedRecord),
        selectedRecord: getTraceRecordSummary(this, selectedRecord),
      });
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

      recordPipelineStage(this, "refresh-state", pipelineContext, {
        shouldMeasureRecords,
        measurementPending: measurementResult.pending || 0,
        modeStateRefreshCount: getSetSize(modeStateRefreshSet),
        baseStateRefreshCount: getSetSize(baseStateRefreshSet),
        modeDecisionWorksetSize: getSetSize(pipelineContext.decision.modeDecisionWorkset),
        baseDecisionWorksetSize: getSetSize(pipelineContext.decision.baseDecisionWorkset),
        focusedRecord: getTraceRecordSummary(this, focusedRecord),
        selectedRecord: getTraceRecordSummary(this, selectedRecord),
        latestAssistantRecord: getTraceRecordSummary(this, latestAssistantRecord),
      });
    },
  });
})();
