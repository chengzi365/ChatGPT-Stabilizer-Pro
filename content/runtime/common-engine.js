(() => {
  const app = globalThis.__CSP__;

  const BASE_WORKSET_FULL_RESYNC_REASONS = new Set([
    "startup",
    "route-change",
    "level-change",
    "manual-resync",
    "manual-restore",
    "dom-structure",
    "dom-mutation",
  ]);

  function shouldSkipBaseWorksetBuild(runtimeState, reason, isResync) {
    if (runtimeState.effectiveMode === "performance") {
      return true;
    }

    return isResync || BASE_WORKSET_FULL_RESYNC_REASONS.has(reason);
  }

  app.runtime.commonEngineControllerMethods = {
    resetBaseRuntimeTracking() {
      const measurementState = this.state.measurement;
      const records = this.registry.getOrderedRecords();

      for (let index = 0; index < records.length; index += 1) {
        records[index].baseStateDirty = true;
        records[index].baseMetricsSnapshot =
          app.runtime.createEmptyBaseMetricsTotals();
      }

      this.clearPendingGlobalLayoutChange();

      measurementState.baseStateRefreshIds.clear();
      measurementState.baseRefreshActiveIds.clear();
      measurementState.measureBacklogIds = [];
      measurementState.measureBacklogSet = new Set();
      measurementState.baseMetricsTotals = app.runtime.createEmptyBaseMetricsTotals();
    },

    markRecordForBaseStateRefresh(record) {
      const measurementState = this.state.measurement;

      if (!record || !Number.isFinite(record.id)) {
        return;
      }

      record.baseStateDirty = true;
      measurementState.baseStateRefreshIds.add(record.id);
      this.syncRecordBaseRefreshMembership(record);
    },

    clearRecordBaseStateRefresh(record) {
      const measurementState = this.state.measurement;

      if (!record || !Number.isFinite(record.id)) {
        return;
      }

      record.baseStateDirty = false;
      measurementState.baseStateRefreshIds.delete(record.id);
      this.syncRecordBaseRefreshMembership(record);
    },

    recordNeedsBaseRefresh(record) {
      if (!record) {
        return false;
      }

      return Boolean(
        record.baseStateDirty ||
          record.visible ||
          record.nearViewport ||
          record.protected ||
          record.hovered ||
          record.streaming ||
          record.pinned ||
          record.needsMeasure ||
          record.measureDeferred
      );
    },

    syncRecordBaseRefreshMembership(record) {
      const measurementState = this.state.measurement;

      if (!record || !Number.isFinite(record.id)) {
        return;
      }

      if (this.recordNeedsBaseRefresh(record)) {
        measurementState.baseRefreshActiveIds.add(record.id);
        return;
      }

      measurementState.baseRefreshActiveIds.delete(record.id);
    },

    collectBaseStateRefreshSet(
      records,
      reason,
      isResync,
      focusedRecordId,
      selectedRecordId,
      latestAssistantRecordId
    ) {
      const runtimeState = this.state.runtime;
      const measurementState = this.state.measurement;

      if (shouldSkipBaseWorksetBuild(runtimeState, reason, isResync)) {
        return null;
      }

      const refreshSet = new Set(measurementState.baseStateRefreshIds);

      measurementState.baseRefreshActiveIds.forEach((recordId) => {
        refreshSet.add(recordId);
      });

      if (focusedRecordId > 0) {
        refreshSet.add(focusedRecordId);
      }

      if (selectedRecordId > 0) {
        refreshSet.add(selectedRecordId);
      }

      if (latestAssistantRecordId > 0) {
        refreshSet.add(latestAssistantRecordId);
      }

      return refreshSet.size > 0 ? refreshSet : new Set();
    },

    collectBaseDecisionWorkset(baseStateRefreshSet, reason, isResync) {
      const runtimeState = this.state.runtime;

      if (
        !baseStateRefreshSet ||
        shouldSkipBaseWorksetBuild(runtimeState, reason, isResync)
      ) {
        return null;
      }

      return baseStateRefreshSet.size > 0 ? new Set(baseStateRefreshSet) : new Set();
    },

    resolveOrderedBaseWorksetRecords(recordIds) {
      if (!recordIds) {
        return null;
      }

      if (!(recordIds instanceof Set) || recordIds.size === 0) {
        return [];
      }

      const orderedRecords = [];

      recordIds.forEach((recordId) => {
        const record = this.registry.getById(recordId);

        if (record) {
          orderedRecords.push(record);
        }
      });

      orderedRecords.sort(
        (left, right) => (left.orderIndex || 0) - (right.orderIndex || 0)
      );

      return orderedRecords;
    },

    createBaseMetricsContribution(record, decision) {
      const optimized = Boolean(decision?.optimize);

      return {
        keepAlive: record.pinned ? 1 : 0,
        protected: record.protected ? 1 : 0,
        visible: record.visible ? 1 : 0,
        nearViewport: record.nearViewport ? 1 : 0,
        optimizable: decision?.eligible ? 1 : 0,
        optimized: optimized ? 1 : 0,
        estimatedSkippedHeight: optimized
          ? decision?.estimatedSkippedHeight || record.lastMeasuredHeight || 0
          : 0,
        estimatedControlledNodes: optimized
          ? Number.isFinite(decision?.controlledNodeEstimate)
            ? decision.controlledNodeEstimate
            : record.nodeCountEstimate || 0
          : 0,
      };
    },

    updateBaseMetricsContribution(record, decision) {
      const runtimeState = this.state.runtime;
      const measurementState = this.state.measurement;

      if (runtimeState.effectiveMode === "performance" || !record) {
        return;
      }

      const totals = measurementState.baseMetricsTotals;
      const previous =
        record.baseMetricsSnapshot || app.runtime.createEmptyBaseMetricsTotals();
      const next = this.createBaseMetricsContribution(record, decision);
      const keys = Object.keys(next);

      for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        totals[key] += next[key] - (previous[key] || 0);
      }

      record.baseMetricsSnapshot = next;
    },

    clearBaseMetricsContribution(record) {
      const runtimeState = this.state.runtime;
      const measurementState = this.state.measurement;

      if (!record || runtimeState.effectiveMode === "performance") {
        return;
      }

      const totals = measurementState.baseMetricsTotals;
      const snapshot =
        record.baseMetricsSnapshot || app.runtime.createEmptyBaseMetricsTotals();
      const keys = Object.keys(snapshot);

      for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        totals[key] -= snapshot[key] || 0;
      }

      record.baseMetricsSnapshot = app.runtime.createEmptyBaseMetricsTotals();
      measurementState.baseStateRefreshIds.delete(record.id);
      measurementState.baseRefreshActiveIds.delete(record.id);
      measurementState.measureBacklogSet.delete(record.id);
      measurementState.measureBacklogIds = measurementState.measureBacklogIds.filter(
        (queuedId) => queuedId !== record.id
      );
    },

    getBenefitLevel(coverageRate, estimatedSkippedHeight) {
      if (coverageRate >= 0.8 || estimatedSkippedHeight >= 30000) {
        return "high";
      }

      if (coverageRate >= 0.4 || estimatedSkippedHeight >= 10000) {
        return "medium";
      }

      return "low";
    },

    getRuntimeStatus({
      isChatPage,
      optimizationSupported,
      thresholdReached,
      recognitionFailures,
    }) {
      const runtimeState = this.state.runtime;

      if (!isChatPage || runtimeState.level === "off") {
        return "disabled";
      }

      if (runtimeState.level !== "monitor" && !optimizationSupported) {
        return "fallback";
      }

      if (recognitionFailures >= 5) {
        return "degraded";
      }

      if (!thresholdReached && runtimeState.level !== "monitor") {
        return "disabled";
      }

      return "active";
    },

    applyScrollAnchorAdjustment(offsetDelta) {
      const scrollRoot = this.state.page.scrollRoot;

      if (!Number.isFinite(offsetDelta) || offsetDelta === 0) {
        return false;
      }

      if (
        !scrollRoot ||
        scrollRoot === document.body ||
        scrollRoot === document.documentElement ||
        scrollRoot === document.scrollingElement
      ) {
        const nextTop = app.dom.getScrollOffset(scrollRoot) + offsetDelta;
        globalThis.scrollTo(0, nextTop);
        return true;
      }

      scrollRoot.scrollTop += offsetDelta;
      return true;
    },
  };
})();
