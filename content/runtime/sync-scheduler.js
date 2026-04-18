(() => {
  const app = globalThis.__CSP__;
  const config = app.core.config;
  const i18n = app.core.i18n;
  const logger = app.core.logger;

  function t(key, params = {}, fallback) {
    return i18n.t(key, params, fallback);
  }

  function scheduleAfterNextPaint(callback) {
    if (typeof globalThis.requestAnimationFrame === "function") {
      globalThis.requestAnimationFrame(() => {
        globalThis.setTimeout(callback, 0);
      });
      return;
    }

    globalThis.setTimeout(callback, 16);
  }

  function clampProgress(value, minimum = 0, maximum = 100) {
    if (!Number.isFinite(value)) {
      return minimum;
    }

    return Math.max(minimum, Math.min(maximum, Math.round(value)));
  }

  app.runtime.syncControllerMethods = {
    isBackgroundPanelActivityReason(reason) {
      return reason === "measurement-backlog";
    },

    clearStreamingContentSync() {
      const schedulerState = this.state.scheduler;

      if (schedulerState.streamingContentSyncHandle) {
        globalThis.clearTimeout(schedulerState.streamingContentSyncHandle);
      }

      schedulerState.streamingContentSyncHandle = 0;
      schedulerState.streamingContentSyncRecordId = 0;
      schedulerState.streamingContentSyncRouteKey = "";
      schedulerState.streamingContentSyncLevel = "";
      schedulerState.streamingContentSyncEffectiveMode = "";
    },

    clearPendingStreamingDomContentSync() {
      const schedulerState = this.state.scheduler;

      schedulerState.pendingStreamingDomContentSync = false;
      schedulerState.pendingStreamingDomContentRouteKey = "";
      schedulerState.pendingStreamingDomContentLevel = "";
      schedulerState.pendingStreamingDomContentEffectiveMode = "";
    },

    consumePendingStreamingDomContentSync(
      routeKey = "",
      level = "",
      effectiveMode = ""
    ) {
      const schedulerState = this.state.scheduler;
      const isMatch =
        schedulerState.pendingStreamingDomContentSync &&
        schedulerState.pendingStreamingDomContentRouteKey === routeKey &&
        schedulerState.pendingStreamingDomContentLevel === level &&
        schedulerState.pendingStreamingDomContentEffectiveMode === effectiveMode;

      this.clearPendingStreamingDomContentSync();
      return isMatch;
    },

    scheduleStreamingContentSync(recordId, delayMs = 96) {
      const schedulerState = this.state.scheduler;
      const runtimeState = this.state.runtime;
      const routeKey = this.services.page.getRouteKey();

      if (
        runtimeState.level === "off" ||
        !Number.isFinite(recordId) ||
        recordId <= 0
      ) {
        this.clearStreamingContentSync();
        return;
      }

      if (schedulerState.streamingContentSyncHandle) {
        return;
      }

      schedulerState.streamingContentSyncRecordId = recordId;
      schedulerState.streamingContentSyncRouteKey = routeKey;
      schedulerState.streamingContentSyncLevel = runtimeState.level;
      schedulerState.streamingContentSyncEffectiveMode = runtimeState.effectiveMode;
      schedulerState.streamingContentSyncHandle = globalThis.setTimeout(() => {
        const pendingRouteKey = schedulerState.streamingContentSyncRouteKey;
        const pendingLevel = schedulerState.streamingContentSyncLevel;
        const pendingEffectiveMode =
          schedulerState.streamingContentSyncEffectiveMode;

        this.clearStreamingContentSync();

        if (
          this.services.page.getRouteKey() !== pendingRouteKey ||
          this.state.runtime.level !== pendingLevel ||
          this.state.runtime.effectiveMode !== pendingEffectiveMode
        ) {
          return;
        }

        this.scheduleSync("dom-content", false, {
          streamingOnly: true,
          routeKey: pendingRouteKey,
          level: pendingLevel,
          effectiveMode: pendingEffectiveMode,
        });
      }, Math.max(16, delayMs));
    },

    waitForNextPaint() {
      return new Promise((resolve) => {
        scheduleAfterNextPaint(resolve);
      });
    },

    getCurrentDiagnosticsOptimizedCount() {
      const metrics =
        this.diagnostics && typeof this.diagnostics.getSliceState === "function"
          ? this.diagnostics.getSliceState("metrics")
          : null;

      return Math.max(metrics?.optimized || 0, 0);
    },

    getCurrentDiagnosticsUnitTotal() {
      const metrics =
        this.diagnostics && typeof this.diagnostics.getSliceState === "function"
          ? this.diagnostics.getSliceState("metrics")
          : null;

      return Math.max(metrics?.unitTotal || 0, 0);
    },

    clearOverlayCompletionTimer() {
      const schedulerState = this.state.scheduler;

      if (!schedulerState.overlayCompletionTimer) {
        return;
      }

      globalThis.clearTimeout(schedulerState.overlayCompletionTimer);
      schedulerState.overlayCompletionTimer = 0;
    },

    createOptimizationOverlayJob(projectedUnitTotal, routeKey = "") {
      const runtimeState = this.state.runtime;
      const schedulerState = this.state.scheduler;
      const currentOptimized = this.getCurrentDiagnosticsOptimizedCount();
      const totalUnits = Math.max(
        projectedUnitTotal || 0,
        this.getCurrentDiagnosticsUnitTotal(),
        1
      );
      const activeJob = schedulerState.activeOverlayJob;

      if (
        runtimeState.level === "off" ||
        runtimeState.level === "monitor"
      ) {
        this.clearOptimizationOverlayJob(activeJob);
        return null;
      }

      if (
        activeJob &&
        (activeJob.routeKey !== routeKey ||
          activeJob.level !== runtimeState.level ||
          activeJob.effectiveMode !== runtimeState.effectiveMode)
      ) {
        this.clearOptimizationOverlayJob(activeJob);
      }

      if (
        schedulerState.activeOverlayJob &&
        schedulerState.activeOverlayJob.routeKey === routeKey &&
        schedulerState.activeOverlayJob.level === runtimeState.level &&
        schedulerState.activeOverlayJob.effectiveMode === runtimeState.effectiveMode
      ) {
        const reusableJob = schedulerState.activeOverlayJob;

        this.clearOverlayCompletionTimer();
        reusableJob.totalUnits = Math.max(reusableJob.totalUnits || 0, totalUnits);
        reusableJob.currentOptimized = Math.max(
          reusableJob.currentOptimized || 0,
          currentOptimized
        );
        reusableJob.completed = false;

        this.diagnostics.setActivityState({
          overlayVisible: true,
          overlayJobId: reusableJob.id,
          overlayKind: "optimizing",
          overlayStage: "applyOptimization",
          overlayProgress: reusableJob.lastProgress || 0,
        });

        return reusableJob;
      }

      this.clearOverlayCompletionTimer();
      schedulerState.overlayJobSeq += 1;
      const job = {
        id: `${Date.now()}-${schedulerState.overlayJobSeq}`,
        routeKey,
        level: runtimeState.level,
        effectiveMode: runtimeState.effectiveMode,
        currentOptimized,
        totalUnits,
        lastProgress: 0,
        completed: false,
      };
      schedulerState.activeOverlayJob = job;

      this.diagnostics.setActivityState({
        overlayVisible: true,
        overlayJobId: job.id,
        overlayKind: "optimizing",
        overlayStage: "applyOptimization",
        overlayProgress: 0,
      });

      return job;
    },

    updateOptimizationOverlayJob(
      job,
      currentOptimized,
      currentUnitTotal = 0,
      stage = "applyOptimization"
    ) {
      if (!job || job.completed) {
        return;
      }

      const totalUnits = Math.max(
        job.totalUnits || 0,
        currentUnitTotal || 0,
        this.getCurrentDiagnosticsUnitTotal(),
        1
      );
      const optimized = Math.max(job.currentOptimized || 0, currentOptimized || 0);
      const progress = clampProgress((optimized / totalUnits) * 90, 0, 90);
      const nextProgress = Math.max(job.lastProgress || 0, progress);

      job.totalUnits = totalUnits;
      job.currentOptimized = optimized;
      job.lastProgress = nextProgress;

      this.diagnostics.setActivityState({
        overlayJobId: job.id,
        overlayStage: stage,
        overlayProgress: nextProgress,
      });
    },

    finishOptimizationOverlayJob(job, currentOptimized = 0, currentUnitTotal = 0) {
      if (!job || job.completed) {
        return;
      }

      const schedulerState = this.state.scheduler;

      this.updateOptimizationOverlayJob(
        job,
        currentOptimized,
        currentUnitTotal,
        "settleState"
      );
      job.lastProgress = Math.max(job.lastProgress || 0, 90);
      job.completed = true;
      this.clearOverlayCompletionTimer();
      this.diagnostics.setActivityState({
        overlayJobId: job.id,
        overlayStage: "settleState",
        overlayProgress: job.lastProgress,
      });

      schedulerState.overlayCompletionTimer = globalThis.setTimeout(() => {
        if (schedulerState.activeOverlayJob?.id !== job.id) {
          schedulerState.overlayCompletionTimer = 0;
          return;
        }

        this.diagnostics.setActivityState({
          overlayJobId: job.id,
          overlayStage: "settleState",
          overlayProgress: 100,
        });

        schedulerState.overlayCompletionTimer = globalThis.setTimeout(() => {
          schedulerState.overlayCompletionTimer = 0;
          this.clearOptimizationOverlayJob(job);
        }, 100);
      }, 100);
    },

    clearOptimizationOverlayJob(job = null) {
      const schedulerState = this.state.scheduler;

      if (
        job &&
        schedulerState.activeOverlayJob?.id &&
        schedulerState.activeOverlayJob.id !== job.id
      ) {
        return;
      }

      this.clearOverlayCompletionTimer();
      schedulerState.activeOverlayJob = null;
      this.diagnostics.setActivityState({
        overlayVisible: false,
        overlayJobId: "",
        overlayKind: "",
        overlayStage: "",
        overlayProgress: 0,
      });
    },

    getPanelActivityPhase(reason) {
      if (reason === "startup" || reason === "route-change") {
        return "loading";
      }

      return "optimizing";
    },

    resolvePanelActivityReason(reason = "") {
      const schedulerState = this.state.scheduler;
      const currentReason = schedulerState.currentSyncReason || "";
      const scheduledReason = schedulerState.syncScheduled
        ? schedulerState.scheduledReason
        : "";
      const lowPriorityReason = schedulerState.lowPrioritySyncScheduled
        ? schedulerState.lowPrioritySyncReason
        : "";

      let activeReason = currentReason || reason || scheduledReason || lowPriorityReason;

      if (
        scheduledReason &&
        this.getSyncReasonPriority(scheduledReason) >
          this.getSyncReasonPriority(activeReason)
      ) {
        activeReason = scheduledReason;
      }

      return activeReason;
    },

    syncPanelActivityState(reason = "") {
      const schedulerState = this.state.scheduler;
      const hasPendingWork =
        schedulerState.syncScheduled ||
        schedulerState.isSyncing ||
        schedulerState.lowPrioritySyncScheduled;

      if (!hasPendingWork) {
        this.diagnostics.setActivityState({
          busy: false,
          phase: "idle",
          reason: "",
          lowPriority: false,
        });
        return;
      }

      const activeReason = this.resolvePanelActivityReason(reason);
      const isBackgroundReason = this.isBackgroundPanelActivityReason(activeReason);

      this.diagnostics.setActivityState({
        busy: true,
        phase: this.getPanelActivityPhase(activeReason),
        reason: activeReason,
        lowPriority:
          isBackgroundReason ||
          !schedulerState.isSyncing &&
          !schedulerState.syncScheduled &&
          schedulerState.lowPrioritySyncScheduled,
      });
    },

    scheduleSync(reason, isResync = false, options = null) {
      const schedulerState = this.state.scheduler;
      const streamingOnlyDomContent =
        reason === "dom-content" &&
        !isResync &&
        Boolean(options?.streamingOnly);

      if (reason !== "dom-content" || isResync) {
        this.clearStreamingContentSync();
      }

      if (reason !== "measurement-backlog") {
        this.clearLowPrioritySync();
      }

      if (
        this.getSyncReasonPriority(reason) >=
        this.getSyncReasonPriority(schedulerState.scheduledReason)
      ) {
        schedulerState.scheduledReason = reason;
      }

      if (streamingOnlyDomContent && schedulerState.scheduledReason === "dom-content") {
        schedulerState.pendingStreamingDomContentSync = true;
        schedulerState.pendingStreamingDomContentRouteKey =
          options?.routeKey || this.services.page.getRouteKey();
        schedulerState.pendingStreamingDomContentLevel =
          options?.level || this.state.runtime.level;
        schedulerState.pendingStreamingDomContentEffectiveMode =
          options?.effectiveMode || this.state.runtime.effectiveMode;
      } else {
        this.clearPendingStreamingDomContentSync();
      }

      if (schedulerState.syncScheduled) {
        schedulerState.scheduledResync = schedulerState.scheduledResync || isResync;
        this.syncPanelActivityState(reason);
        return;
      }

      schedulerState.syncScheduled = true;
      schedulerState.scheduledResync = schedulerState.scheduledResync || isResync;
      this.syncPanelActivityState(reason);

      scheduleAfterNextPaint(() => {
        schedulerState.syncScheduled = false;
        const nextReason = schedulerState.scheduledReason;
        const nextResync = schedulerState.scheduledResync;
        schedulerState.scheduledReason = "idle";
        schedulerState.scheduledResync = false;
        this.runSync(nextReason, nextResync);
      });
    },

    scheduleLowPrioritySync(reason = "measurement-backlog") {
      const schedulerState = this.state.scheduler;

      if (schedulerState.lowPrioritySyncScheduled) {
        if (
          this.getSyncReasonPriority(reason) >
          this.getSyncReasonPriority(schedulerState.lowPrioritySyncReason)
        ) {
          schedulerState.lowPrioritySyncReason = reason;
        }

        return;
      }

      schedulerState.lowPrioritySyncScheduled = true;
      schedulerState.lowPrioritySyncReason = reason;
      this.syncPanelActivityState(reason);

      const flushLowPrioritySync = () => {
        if (this.isForegroundBusy()) {
          schedulerState.lowPrioritySyncKind = "timeout";
          schedulerState.lowPrioritySyncHandle = globalThis.setTimeout(
            flushLowPrioritySync,
            120
          );
          return;
        }

        schedulerState.lowPrioritySyncScheduled = false;
        schedulerState.lowPrioritySyncHandle = 0;
        schedulerState.lowPrioritySyncKind = "";
        this.scheduleSync(schedulerState.lowPrioritySyncReason, false);
        schedulerState.lowPrioritySyncReason = "measurement-backlog";
      };

      if (typeof globalThis.requestIdleCallback === "function") {
        schedulerState.lowPrioritySyncKind = "idle";
        schedulerState.lowPrioritySyncHandle = globalThis.requestIdleCallback(
          () => flushLowPrioritySync(),
          { timeout: 120 }
        );
        return;
      }

      schedulerState.lowPrioritySyncKind = "timeout";
      schedulerState.lowPrioritySyncHandle = globalThis.setTimeout(
        flushLowPrioritySync,
        48
      );
    },

    clearLowPrioritySync() {
      const schedulerState = this.state.scheduler;

      if (!schedulerState.lowPrioritySyncScheduled) {
        return;
      }

      if (
        schedulerState.lowPrioritySyncKind === "idle" &&
        typeof globalThis.cancelIdleCallback === "function"
      ) {
        globalThis.cancelIdleCallback(schedulerState.lowPrioritySyncHandle);
      } else if (schedulerState.lowPrioritySyncKind === "timeout") {
        globalThis.clearTimeout(schedulerState.lowPrioritySyncHandle);
      }

      schedulerState.lowPrioritySyncScheduled = false;
      schedulerState.lowPrioritySyncHandle = 0;
      schedulerState.lowPrioritySyncKind = "";
      schedulerState.lowPrioritySyncReason = "measurement-backlog";
      this.syncPanelActivityState();
    },

    getSyncReasonPriority(reason) {
      switch (reason) {
        case "manual-restore":
          return 110;
        case "manual-resync":
          return 100;
        case "route-change":
          return 90;
        case "runtime-profile-change":
          return 85;
        case "level-change":
          return 80;
        case "startup":
          return 70;
        case "dom-structure":
          return 60;
        case "dom-content":
          return 55;
        case "interaction":
          return 50;
        case "protection-expiry":
          return 40;
        case "visibility-change":
          return 30;
        case "measurement-backlog":
          return 20;
        case "dom-mutation":
          return 15;
        default:
          return 10;
      }
    },

    shouldRescanStructure(reason, isResync, routeChangedSinceLastSync) {
      return (
        isResync ||
        routeChangedSinceLastSync ||
        reason === "startup" ||
        reason === "route-change" ||
        reason === "level-change" ||
        reason === "manual-restore" ||
        reason === "dom-structure" ||
        reason === "dom-mutation"
      );
    },

    async runSync(reason, isResync) {
      const schedulerState = this.state.scheduler;
      const runtimeState = this.state.runtime;

      if (schedulerState.isSyncing) {
        const rescheduleOptions =
          reason === "dom-content" && schedulerState.pendingStreamingDomContentSync
            ? {
                streamingOnly: true,
                routeKey: schedulerState.pendingStreamingDomContentRouteKey,
                level: schedulerState.pendingStreamingDomContentLevel,
                effectiveMode:
                  schedulerState.pendingStreamingDomContentEffectiveMode,
              }
            : null;

        this.scheduleSync(reason, isResync, rescheduleOptions);
        return;
      }

      schedulerState.isSyncing = true;
      schedulerState.currentSyncReason = reason;
      this.syncPanelActivityState(reason);
      const startedAt = performance.now();

      this.recordTraceEntry(
        "sync",
        "start",
        {
          reason,
          isResync,
          routeHash:
            this.traceRecorder &&
            typeof this.traceRecorder.buildRouteSummary === "function"
              ? this.traceRecorder.buildRouteSummary(globalThis.location).routeHash
              : "",
          activeAdapter: this.state.page.activeAdapterId || "",
          level: runtimeState.level,
          effectiveMode: runtimeState.effectiveMode,
        },
        { includeSnapshot: true }
      );

      try {
        await this.sync(reason, isResync);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(t("logs.syncFailed"), error);
        this.handleSyncFailure(message);
        this.diagnostics.setRuntimeStatus("error");
        this.diagnostics.setFallbackState({
          enabled: true,
          reason: "runtime-error",
          lastError: message,
        });
        this.diagnostics.recordError(message);
      } finally {
        const durationMs = performance.now() - startedAt;

        this.recordTraceEntry(
          "sync",
          "end",
          {
            reason,
            isResync,
            durationMs: Math.round(durationMs * 100) / 100,
            recordCount: this.registry ? this.registry.getOrderedRecords().length : 0,
            activeAdapter: this.state.page.activeAdapterId || "",
            level: runtimeState.level,
            effectiveMode: runtimeState.effectiveMode,
          },
          { includeSnapshot: true }
        );

        this.diagnostics.recordSync({
          durationMs,
          reason,
          isResync,
        });

        if (runtimeState.effectiveMode === "performance") {
          const threshold = Math.max(1, config.diagnostics.slowSyncThresholdMs || 32);
          const consecutiveSlowSyncCount = this.recordActiveModeSlowSync(
            durationMs,
            threshold
          );

          if (Number.isFinite(consecutiveSlowSyncCount)) {
            this.diagnostics.setMetrics({
              consecutiveSlowSyncCount,
            });
          }
        }

        schedulerState.isSyncing = false;
        schedulerState.currentSyncReason = "";
        this.syncPanelActivityState();
      }
    },
  };
})();
