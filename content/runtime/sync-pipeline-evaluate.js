(() => {
  const app = globalThis.__CSP__;
  const {
    createEmptyPerformanceDecisionMetrics,
    accumulatePerformanceDecisionMetrics,
    getSetSize,
    recordPipelineStage,
  } = app.runtime.syncPipelineShared;
  const syncPipelineControllerMethods =
    app.runtime.syncPipelineControllerMethods ||
    (app.runtime.syncPipelineControllerMethods = {});

  Object.assign(syncPipelineControllerMethods, {
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
      const traceChangedRecords = [];
      const captureDecisionRecord = (record, decision) => {
        if (
          traceChangedRecords.length >= 8 ||
          !this.traceRecorder ||
          typeof this.traceRecorder.buildTraceRecordSummary !== "function"
        ) {
          return;
        }

        const summary = this.traceRecorder.buildTraceRecordSummary(record);

        if (!summary) {
          return;
        }

        traceChangedRecords.push({
          ...summary,
          eligible: Boolean(decision?.eligible),
          optimize: Boolean(decision?.optimize),
          keepAlive: Boolean(decision?.keepAlive),
          modeId: decision?.modeState?.modeId || "",
          distanceTier: decision?.modeState?.distanceTier || "",
        });
      };
      const queueStyleTask = (record, decision, previousState) => {
        if (!this.shouldQueueRecordStyleTask(record, decision)) {
          return;
        }

        decisionState.styleTasks.push({
          record,
          decision,
          previousOptimized: Boolean(previousState.optimized),
        });
        captureDecisionRecord(record, decision);
      };
      const performanceDecisionMetrics =
        this.state.runtime.effectiveMode === "performance"
          ? createEmptyPerformanceDecisionMetrics()
          : null;
      const isPerformanceMode = this.state.runtime.effectiveMode === "performance";

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

          const previousTraceState = {
            optimized: Boolean(record.optimized),
            keepAlive: Boolean(record.baseStyleKeepAlive),
            modeId: record.modeState?.modeId || "",
            distanceTier: record.modeState?.distanceTier || "",
          };
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
            queueStyleTask(record, decision, previousTraceState);
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

          if (isPerformanceMode) {
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
          }

          const previousTraceState = {
            optimized: Boolean(record.optimized),
            keepAlive: Boolean(record.baseStyleKeepAlive),
            modeId: record.modeState?.modeId || "",
            distanceTier: record.modeState?.distanceTier || "",
          };
          record.optimized = Boolean(decision.optimize);

          if (isPerformanceMode && decision.eligible) {
            optimizableCount += 1;
          }

          if (isPerformanceMode && record.optimized) {
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

          queueStyleTask(record, decision, previousTraceState);
          this.updateBaseMetricsContribution(record, decision);
        }

        if (!isPerformanceMode) {
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

      recordPipelineStage(this, "evaluate-decisions", pipelineContext, {
        usingModeDecisionWorkset,
        modeDecisionWorksetSize: getSetSize(modeDecisionWorkset),
        baseDecisionWorksetSize: getSetSize(baseDecisionWorkset),
        optimizableCount,
        optimizedCount,
        estimatedSkippedHeight,
        estimatedControlledNodes,
        pendingAnchorAdjustment,
        pendingMeasureFollowup,
        changedRecords: traceChangedRecords,
        performanceDecisionMetrics,
      });
    },
  });
})();
