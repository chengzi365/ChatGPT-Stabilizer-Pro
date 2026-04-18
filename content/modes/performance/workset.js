(() => {
  const app = globalThis.__CSP__;
  const config = app.core.config;
  const performanceMode = app.modes.performance || (app.modes.performance = {});
  const { getPerformanceRuntime } = performanceMode;

  function shouldFallbackToFullPerformanceSet(reason, isResync) {
    return (
      isResync ||
      reason === "startup" ||
      reason === "route-change" ||
      reason === "level-change" ||
      reason === "manual-resync" ||
      reason === "manual-restore"
    );
  }

  function addRangeToSet(targetSet, records, startIndex, endIndex, padding = 0) {
    if (
      !(targetSet instanceof Set) ||
      !Array.isArray(records) ||
      records.length === 0 ||
      !Number.isInteger(startIndex) ||
      !Number.isInteger(endIndex)
    ) {
      return;
    }

    const start = Math.max(0, Math.min(startIndex, endIndex) - padding);
    const end = Math.min(
      records.length - 1,
      Math.max(startIndex, endIndex) + padding
    );

    for (let index = start; index <= end; index += 1) {
      targetSet.add(records[index].id);
    }
  }

  function addRecordWindowById(targetSet, records, recordId, padding = 0) {
    if (!(targetSet instanceof Set) || !Number.isFinite(recordId) || recordId <= 0) {
      return;
    }

    for (let index = 0; index < records.length; index += 1) {
      if (records[index]?.id === recordId) {
        addRangeToSet(targetSet, records, index, index, padding);
        return;
      }
    }
  }

  function addRecordWindows(targetSet, records, recordIds, padding = 0) {
    if (!Array.isArray(recordIds)) {
      return;
    }

    for (let index = 0; index < recordIds.length; index += 1) {
      addRecordWindowById(targetSet, records, recordIds[index], padding);
    }
  }

  function buildPerformanceStructureScopedSet({
    controller,
    records,
    structureDiff,
    latestAssistantRecordId = 0,
    previousLatestAssistantRecordId = 0,
    keepAliveCount = 0,
    runtime,
    basePadding = 0,
    warmPadding = 0,
  }) {
    if (!structureDiff || !Array.isArray(records) || records.length === 0) {
      return null;
    }

    const scopedSet = new Set();
    const changedIndexCandidates = [
      structureDiff.firstChangedIndex,
      structureDiff.orderChangedStartIndex,
    ].filter((value) => Number.isInteger(value) && value >= 0);

    if (changedIndexCandidates.length > 0) {
      const firstChangedIndex = Math.min(...changedIndexCandidates);
      addRangeToSet(
        scopedSet,
        records,
        firstChangedIndex,
        records.length - 1,
        basePadding
      );
    }

    addRecordWindows(
      scopedSet,
      records,
      structureDiff.addedRecordIds,
      Math.max(1, basePadding)
    );
    addRecordWindows(
      scopedSet,
      records,
      structureDiff.elementReplacedRecordIds,
      Math.max(1, basePadding)
    );
    addRecordWindowById(
      scopedSet,
      records,
      latestAssistantRecordId,
      Math.max(1, basePadding)
    );
    addRecordWindowById(
      scopedSet,
      records,
      previousLatestAssistantRecordId,
      Math.max(1, basePadding)
    );

    if (keepAliveCount > 0) {
      addRangeToSet(
        scopedSet,
        records,
        Math.max(0, records.length - keepAliveCount),
        records.length - 1,
        1
      );
    }

    addRangeToSet(
      scopedSet,
      records,
      runtime?.warmStartIndex ?? -1,
      runtime?.warmEndIndex ?? -1,
      warmPadding
    );

    return scopedSet;
  }

  function collectPerformanceDecisionWorkset({
    controller,
    strategySession,
    records,
    reason,
    isResync,
    structureDiff,
    latestAssistantRecordId,
    previousLatestAssistantRecordId,
    keepAliveCount,
  }) {
    if (shouldFallbackToFullPerformanceSet(reason, isResync)) {
      return null;
    }

    const runtime = getPerformanceRuntime(strategySession);
    const workset =
      reason === "dom-structure"
        ? buildPerformanceStructureScopedSet({
            controller,
            records,
            structureDiff,
            latestAssistantRecordId,
            previousLatestAssistantRecordId,
            keepAliveCount,
            runtime,
            basePadding: controller.isForegroundBusy() ? 1 : 2,
            warmPadding: controller.isForegroundBusy() ? 1 : 2,
          })
        : new Set();

    if (!(workset instanceof Set)) {
      return null;
    }

    const rangePadding = controller.isForegroundBusy() ? 1 : 2;
    const addRange = (startIndex, endIndex, padding = 0) => {
      addRangeToSet(workset, records, startIndex, endIndex, padding);
    };

    addRange(runtime?.warmStartIndex ?? -1, runtime?.warmEndIndex ?? -1, rangePadding);

    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];

      if (
        record.performanceDirty ||
        record.performanceNeedsDecision ||
        !record.performanceDecisionCache ||
        record.needsMeasure ||
        record.needsContentProfile ||
        record.measureDeferred ||
        record.visible ||
        record.nearViewport ||
        record.protected ||
        record.pinned ||
        record.hovered ||
        record.streaming ||
        record.performanceWarmObserved ||
        record.performanceState === "collapse-pending" ||
        record.performanceState === "restore-pending" ||
        record.performanceState === "restoring"
      ) {
        workset.add(record.id);
      }
    }

    return workset;
  }

  function collectPerformanceStateRefreshSet({
    controller,
    records,
    strategySession,
    reason,
    isResync,
    now,
    focusedRecordId,
    selectedRecordId,
    latestAssistantRecordId,
    keepAliveCount,
    structureDiff,
  }) {
    if (shouldFallbackToFullPerformanceSet(reason, isResync)) {
      return null;
    }

    const runtime = getPerformanceRuntime(strategySession);
    const refreshSet =
      reason === "dom-structure"
        ? buildPerformanceStructureScopedSet({
            controller,
            records,
            structureDiff,
            latestAssistantRecordId,
            previousLatestAssistantRecordId:
              structureDiff?.previousLatestAssistantRecordId || 0,
            keepAliveCount,
            runtime,
            basePadding: controller.isForegroundBusy() ? 2 : 4,
            warmPadding: controller.isForegroundBusy() ? 2 : 4,
          })
        : new Set();

    if (!(refreshSet instanceof Set)) {
      return null;
    }

    const rangePadding = controller.isForegroundBusy() ? 2 : 4;
    const addRange = (startIndex, endIndex, padding = 0) => {
      addRangeToSet(refreshSet, records, startIndex, endIndex, padding);
    };

    addRange(runtime.warmStartIndex, runtime.warmEndIndex, rangePadding);

    const pinnedStartIndex = Math.max(0, records.length - keepAliveCount);

    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      const recentlyInteracted =
        record.lastInteractionAt > 0 &&
        now - record.lastInteractionAt <= config.protection.interactionProtectMs + 120;
      const isPinnedCandidate = index >= pinnedStartIndex;

      if (
        record.visible ||
        record.nearViewport ||
        record.protected ||
        record.hovered ||
        record.streaming ||
        record.pinned ||
        isPinnedCandidate ||
        record.performanceWarmObserved ||
        record.performanceDirty ||
        record.performanceNeedsDecision ||
        !record.performanceDecisionCache ||
        record.needsMeasure ||
        record.needsContentProfile ||
        record.measureDeferred ||
        record.performanceState === "collapse-pending" ||
        record.performanceState === "restore-pending" ||
        record.performanceState === "restoring" ||
        recentlyInteracted ||
        (focusedRecordId > 0 && record.id === focusedRecordId) ||
        (selectedRecordId > 0 && record.id === selectedRecordId) ||
        (latestAssistantRecordId > 0 && record.id === latestAssistantRecordId)
      ) {
        refreshSet.add(record.id);
      }
    }

    return refreshSet;
  }

  function getPerformanceEvaluationPriority(record) {
    if (record.visible) {
      return 0;
    }

    if (record.protected && record.performanceCollapsed) {
      return 1;
    }

    if (record.protected) {
      return 2;
    }

    if (record.performanceCollapsed && record.performanceWarmObserved) {
      return 3;
    }

    if (
      record.performanceState === "restore-pending" ||
      record.performanceState === "restoring"
    ) {
      return 4;
    }

    if (record.nearViewport) {
      return 5;
    }

    if (record.performanceWarmObserved) {
      return 6;
    }

    if (record.performanceState === "collapse-pending") {
      return 20;
    }

    return 10;
  }

  function buildPerformanceEvaluationOrder({
    strategySession,
    records,
    workset,
  }) {
    if (!workset || workset.size === 0) {
      return null;
    }

    const runtime = getPerformanceRuntime(strategySession);
    const warmCenter =
      Number.isInteger(runtime?.warmStartIndex) &&
      Number.isInteger(runtime?.warmEndIndex) &&
      runtime.warmStartIndex >= 0 &&
      runtime.warmEndIndex >= 0
        ? (runtime.warmStartIndex + runtime.warmEndIndex) / 2
        : records.length - 1;
    const priorityOrder = [0, 1, 2, 3, 4, 5, 6, 10, 20];
    const priorityBuckets = new Map(
      priorityOrder.map((priority) => [priority, []])
    );
    const fallbackBucket = [];
    let remaining = workset.size;
    let leftIndex = Math.floor(warmCenter);
    let rightIndex = Math.ceil(warmCenter);

    const appendIndex = (index) => {
      if (index < 0 || index >= records.length || remaining <= 0) {
        return;
      }

      const record = records[index];

      if (!record || !workset.has(record.id)) {
        return;
      }

      const priority = getPerformanceEvaluationPriority(record);
      const bucket = priorityBuckets.get(priority) || fallbackBucket;

      bucket.push(index);
      remaining -= 1;
    };

    while (remaining > 0 && (leftIndex >= 0 || rightIndex < records.length)) {
      if (leftIndex === rightIndex) {
        appendIndex(leftIndex);
      } else {
        appendIndex(leftIndex);
        appendIndex(rightIndex);
      }

      leftIndex -= 1;
      rightIndex += 1;
    }

    const orderedIndices = [];
    const appendBucket = (bucket) => {
      for (let index = 0; index < bucket.length; index += 1) {
        orderedIndices.push(bucket[index]);
      }
    };

    for (let index = 0; index < priorityOrder.length; index += 1) {
      appendBucket(priorityBuckets.get(priorityOrder[index]) || []);
    }

    if (fallbackBucket.length > 0) {
      appendBucket(fallbackBucket);
    }

    return orderedIndices;
  }

  Object.assign(performanceMode, {
    collectPerformanceDecisionWorkset,
    collectPerformanceStateRefreshSet,
    buildPerformanceEvaluationOrder,
  });
})();
