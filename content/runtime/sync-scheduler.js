(() => {
  const app = globalThis.__CSP__;
  const config = app.core.config;
  const i18n = app.core.i18n;
  const logger = app.core.logger;

  function t(key, params = {}, fallback) {
    return i18n.t(key, params, fallback);
  }

  app.runtime.syncControllerMethods = {
    isBackgroundPanelActivityReason(reason) {
      return reason === "measurement-backlog";
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

    scheduleSync(reason, isResync = false) {
      const schedulerState = this.state.scheduler;

      if (reason !== "measurement-backlog") {
        this.clearLowPrioritySync();
      }

      if (
        this.getSyncReasonPriority(reason) >=
        this.getSyncReasonPriority(schedulerState.scheduledReason)
      ) {
        schedulerState.scheduledReason = reason;
      }

      schedulerState.scheduledResync = schedulerState.scheduledResync || isResync;
      this.syncPanelActivityState(reason);

      if (schedulerState.syncScheduled) {
        return;
      }

      schedulerState.syncScheduled = true;

      globalThis.requestAnimationFrame(() => {
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

    runSync(reason, isResync) {
      const schedulerState = this.state.scheduler;
      const runtimeState = this.state.runtime;

      if (schedulerState.isSyncing) {
        this.scheduleSync(reason, isResync);
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
            routeKey: this.getRouteKey(),
            level: runtimeState.level,
            effectiveMode: runtimeState.effectiveMode,
          },
          { includeSnapshot: true }
        );

      try {
        this.sync(reason, isResync);
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
