(() => {
  const app = globalThis.__CSP__;
  const config = app.core.config;
  const layoutCache = app.dom.layoutCache;
  const contentProfile = app.dom.contentProfile;

  app.dom.measurementControllerMethods = Object.assign(
    {},
    app.dom.layoutWatcherControllerMethods,
    {
      getMeasurementBudget(reason, isResync) {
        const runtimeState = this.state.runtime;
        const syncConfig = this.getEffectiveSyncConfig();

        if (runtimeState.effectiveMode === "performance") {
          const foregroundBusy = this.isForegroundBusy();

          if (foregroundBusy) {
            if (reason === "measurement-backlog") {
              return 0;
            }

            if (reason === "dom-content") {
              return 2;
            }
          }

          if (isResync || reason === "startup" || reason === "route-change") {
            return 32;
          }

          return 12;
        }

        if (isResync || reason === "startup" || reason === "route-change") {
          return syncConfig.resyncMeasurementBatchSize;
        }

        return syncConfig.measurementBatchSize;
      },

      getMeasurementPriority(record) {
        if (record.optimized) {
          return 0;
        }

        if (!record.protected) {
          return 1;
        }

        if (record.nearViewport) {
          return 2;
        }

        if (record.visible || record.streaming || record.pinned) {
          return 3;
        }

        return 4;
      },

      appendMeasurementPriorityRecords(records, predicate, appendRecord) {
        const buckets = [[], [], [], [], []];

        for (let index = 0; index < records.length; index += 1) {
          const record = records[index];

          if (typeof predicate === "function" && !predicate(record)) {
            continue;
          }

          const priority = Math.max(
            0,
            Math.min(4, this.getMeasurementPriority(record))
          );

          buckets[priority].push(record);
        }

        for (let priority = 0; priority < buckets.length; priority += 1) {
          const bucket = buckets[priority];

          for (let index = 0; index < bucket.length; index += 1) {
            appendRecord(bucket[index]);
          }
        }
      },

      buildMeasurementPriorityList(records, predicate) {
        const prioritized = [];

        this.appendMeasurementPriorityRecords(records, predicate, (record) => {
          prioritized.push(record);
        });

        return prioritized;
      },

      countPendingMeasurements(records) {
        let pending = 0;

        for (let index = 0; index < records.length; index += 1) {
          if (records[index].needsMeasure || records[index].needsContentProfile) {
            pending += 1;
          }
        }

        return pending;
      },

      markRecordLayoutDirty(record, reason = "") {
        if (!record) {
          return;
        }

        record.needsMeasure = true;
        record.measureDeferred = false;
        record.measureAttempts = 0;
        record.layoutInvalidationReason = reason || "";
        this.markRecordForBaseStateRefresh(record);
        this.markRecordForModeDecision(record);
        record.performanceDecisionCache = null;
        this.queueMeasurementRecord(record.id);
      },

      markRecordContentProfileDirty(record, reason = "") {
        if (!record) {
          return;
        }

        contentProfile.clearContentProfileCache(record);
        record.contentProfileInvalidationReason = reason || "";
        this.markRecordLayoutDirty(record, reason || "content-profile");
      },

      confirmRecordLayoutMeasurement(record) {
        if (
          !record ||
          !record.needsMeasure ||
          record.measureDeferred ||
          !record.lastMeasuredHeight ||
          !(record.contentElement instanceof HTMLElement)
        ) {
          return false;
        }

        const nextSignature = layoutCache.buildLayoutSignature(record.contentElement);
        const previousSignature = record.layoutCache?.signature || "";

        if (!previousSignature) {
          record.layoutCache = {
            ...(record.layoutCache || layoutCache.createEmptyLayoutCache()),
            signature: nextSignature,
          };
          return false;
        }

        if (
          record.layoutInvalidationReason === "viewport-resize" &&
          nextSignature &&
          previousSignature === nextSignature
        ) {
          record.needsMeasure = false;
          record.measureDeferred = false;
          record.measureAttempts = 0;
          record.layoutInvalidationReason = "";
          return true;
        }

        return false;
      },

      queueMeasurementRecord(recordId) {
        const measurementState = this.state.measurement;
        const runtimeState = this.state.runtime;

        if (!Number.isFinite(recordId)) {
          return;
        }

        const queue = measurementState.measureBacklogIds;
        const queueSet = measurementState.measureBacklogSet;

        if (!queueSet.has(recordId)) {
          queue.push(recordId);
          queueSet.add(recordId);
        }

        if (runtimeState.effectiveMode !== "performance") {
          return;
        }

      this.queueActiveModeMeasurementBacklog(recordId);
      },

      buildPerformanceMeasurementQueue(records, reason, isResync) {
        const prioritized = [];
        const seenIds = new Set();
        const allowBacklogFill =
          isResync ||
          reason === "measurement-backlog" ||
          reason === "startup" ||
          reason === "route-change";
        const appendRecord = (record) => {
          if (
            !record ||
            (!record.needsMeasure && !record.needsContentProfile) ||
            seenIds.has(record.id)
          ) {
            return;
          }

          seenIds.add(record.id);
          prioritized.push(record);
        };

        this.appendMeasurementPriorityRecords(
          records,
          (record) =>
            (record.needsMeasure || record.needsContentProfile) &&
            (record.visible ||
              record.nearViewport ||
              record.protected ||
              record.streaming ||
              record.pinned),
          appendRecord
        );

      const backlogRecords = this.collectActiveModeMeasurementBacklog({
          allowBacklogFill,
        });

        for (let index = 0; index < backlogRecords.length; index += 1) {
          appendRecord(backlogRecords[index]);
        }

        if (allowBacklogFill) {
          this.appendMeasurementPriorityRecords(
            records,
            (record) => record.needsMeasure || record.needsContentProfile,
            appendRecord
          );
        }

        return prioritized;
      },

      buildBaseMeasurementQueue(records, reason, isResync) {
        const measurementState = this.state.measurement;
        const prioritized = [];
        const seenIds = new Set();
        const allowBacklogFill =
          isResync ||
          reason === "measurement-backlog" ||
          reason === "startup" ||
          reason === "route-change" ||
          reason === "level-change" ||
          reason === "manual-resync" ||
          reason === "manual-restore" ||
          reason === "dom-structure" ||
          reason === "dom-mutation";
        const appendRecord = (record) => {
          if (
            !record ||
            (!record.needsMeasure && !record.needsContentProfile) ||
            seenIds.has(record.id)
          ) {
            return;
          }

          seenIds.add(record.id);
          prioritized.push(record);
        };
        const nextBacklogIds = [];
        const nextBacklogSet = new Set();

        for (
          let index = 0;
          index < measurementState.measureBacklogIds.length;
          index += 1
        ) {
          const recordId = measurementState.measureBacklogIds[index];
          const record = this.registry.getById(recordId);

          if (!record || (!record.needsMeasure && !record.needsContentProfile)) {
            continue;
          }

          nextBacklogIds.push(recordId);
          nextBacklogSet.add(recordId);
          appendRecord(record);
        }

        measurementState.measureBacklogIds = nextBacklogIds;
        measurementState.measureBacklogSet = nextBacklogSet;

        if (allowBacklogFill) {
          this.appendMeasurementPriorityRecords(
            records,
            (record) => record.needsMeasure || record.needsContentProfile,
            appendRecord
          );
        }

        return prioritized;
      },

      measurePendingRecords(records, reason, isResync) {
        const runtimeState = this.state.runtime;
        const measurementState = this.state.measurement;
        let remainingBudget = this.getMeasurementBudget(reason, isResync);

        if (remainingBudget <= 0) {
          return {
            pending: this.countPendingMeasurements(records),
          };
        }

        const pendingRecords =
          runtimeState.effectiveMode === "performance"
            ? this.buildPerformanceMeasurementQueue(records, reason, isResync)
            : this.buildBaseMeasurementQueue(records, reason, isResync);

        for (let index = 0; index < pendingRecords.length; index += 1) {
          const record = pendingRecords[index];

          if (remainingBudget <= 0) {
            break;
          }

          this.measureRecord(record);

          if (!record.needsMeasure) {
            remainingBudget -= 1;
          }
        }

        if (runtimeState.effectiveMode === "performance") {
        this.pruneActiveModeMeasurementBacklog();
        }

        if (runtimeState.effectiveMode !== "performance") {
          const nextBacklogIds = [];
          const nextBacklogSet = new Set();

          for (let index = 0; index < pendingRecords.length; index += 1) {
            const record = pendingRecords[index];

            if (
              !record ||
              (!record.needsMeasure && !record.needsContentProfile) ||
              nextBacklogSet.has(record.id)
            ) {
              continue;
            }

            nextBacklogIds.push(record.id);
            nextBacklogSet.add(record.id);
          }

          measurementState.measureBacklogIds = nextBacklogIds;
          measurementState.measureBacklogSet = nextBacklogSet;
        }

        return {
          pending: this.countPendingMeasurements(records),
        };
      },

      updateStreamingState(record, isLatestAssistant, now) {
        if (!isLatestAssistant) {
          if (!record.lastTextSignature) {
            record.lastTextSignature = app.dom.getTextSignature(record.contentElement);
          }

          record.streaming = false;
          return;
        }

        const nextSignature = app.dom.getTextSignature(record.contentElement);
        const hasTextChanged =
          Boolean(record.lastTextSignature) && record.lastTextSignature !== nextSignature;
        const hasStreamingSignal = app.dom.hasStreamingSignal(
          record.messageElement,
          record.contentElement
        );

        if (hasTextChanged || hasStreamingSignal) {
          record.lastTextChangeAt = now;
        }

        record.lastTextSignature = nextSignature;
        record.streaming =
          hasStreamingSignal ||
          (record.lastTextChangeAt > 0 &&
            now - record.lastTextChangeAt <= config.protection.streamingGraceMs);
      },

      findLatestAssistantRecord(records) {
        for (let index = records.length - 1; index >= 0; index -= 1) {
          if (records[index].authorRole === "assistant") {
            return records[index];
          }
        }

        return records[records.length - 1] || null;
      },

      isRecordOptimizationCandidate(record, levelConfig) {
        return record.lastMeasuredHeight >= (levelConfig.minimumContentHeight || 0);
      },

      measureRecord(record) {
        const runtimeState = this.state.runtime;

        if (
          !record.needsMeasure &&
          !record.needsContentProfile &&
          record.lastMeasuredHeight > 0
        ) {
          return;
        }

        if (
          record.needsMeasure &&
          record.performanceCollapsed &&
          record.lastMeasuredHeight > 0
        ) {
          record.measureDeferred = true;
          record.needsMeasure = false;
          record.measureAttempts = 0;
        }

        if (record.needsMeasure) {
          if (this.confirmRecordLayoutMeasurement(record)) {
            this.syncRecordBaseRefreshMembership(record);
            return;
          }

          const height = Math.round(
            record.contentElement.getBoundingClientRect().height ||
              record.contentElement.offsetHeight ||
              0
          );

          if (height > 0) {
            const measuredAt = performance.now();
            const layoutSignature = layoutCache.buildLayoutSignature(
              record.contentElement
            );

            layoutCache.applyLayoutCache(
              record,
              height,
              layoutSignature,
              measuredAt
            );
            record.needsMeasure = false;
            record.measureDeferred = false;
            record.measureAttempts = 0;
            record.layoutInvalidationReason = "";
            this.markRecordForModeDecision(record);
            record.performanceDecisionCache = null;
            record.contentElement.style.setProperty(
              "--csp-fallback-size",
              `${Math.max(160, height)}px`
            );
          } else {
            record.measureAttempts += 1;
            this.queueMeasurementRecord(record.id);

            if (record.measureAttempts >= 3) {
              record.needsMeasure = false;
            }
          }
        }

        if (record.needsContentProfile) {
          const profiledAt = performance.now();
          const profile = contentProfile.estimateContentProfile(record.contentElement);

          contentProfile.applyContentProfileCache(record, profile, profiledAt);

          if (runtimeState.effectiveMode === "performance") {
            this.markRecordForModeDecision(record);
            record.performanceDecisionCache = null;
          }
        }

        this.syncRecordBaseRefreshMembership(record);
      },
    }
  );
})();
