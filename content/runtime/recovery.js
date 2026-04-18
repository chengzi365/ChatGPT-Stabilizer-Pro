(() => {
  const app = globalThis.__CSP__;
  const i18n = app.core.i18n;

  function formatReason(reason) {
    return i18n.t(
      `syncReasons.${reason}`,
      {},
      i18n.t(`sessionReasons.${reason}`, {}, reason)
    );
  }

  app.runtime.recoveryControllerMethods = {
    unlockDegradation() {
      const sessionState = this.state.strategy.session;

      if (!sessionState.lockedDegradation && !sessionState.lockedReason) {
        return false;
      }

      sessionState.lockedDegradation = false;
      sessionState.lockedReason = "";
      this.syncSessionStateToDiagnostics();
      this.recordTraceEntry(
        "recovery",
        "unlock-degradation",
        {
          reason: "manual-or-recovery",
        },
        { includeSnapshot: true }
      );
      return true;
    },

    applySelectedMode(modeId) {
      const runtimeState = this.state.runtime;
      const sessionState = this.state.strategy.session;
      const nextMode = this.getModeDefinition(modeId);

      if (!nextMode) {
        return null;
      }

      const previousModeId = runtimeState.effectiveMode || runtimeState.targetMode;

      this.prepareForModeSwitch(previousModeId, nextMode.id);

      runtimeState.targetMode = nextMode.id;
      runtimeState.effectiveMode = nextMode.id;
      this.syncEffectiveRuntimeLevel();
      sessionState.stableSyncCount = 0;
      this.unlockDegradation();
      this.clearSessionAnomaly();

      if (nextMode.id === "off") {
        this.resetSessionRuntimeState({ alignEffectiveMode: false });
      }

      this.syncModeStateToDiagnostics();
      this.syncSessionStateToDiagnostics();
      this.recordTraceEntry(
        "recovery",
        "apply-selected-mode",
        {
          previousModeId,
          nextModeId: nextMode.id,
          targetModeId: runtimeState.targetMode || "",
        },
        { includeSnapshot: true }
      );
      return nextMode;
    },

    recoverEffectiveMode(reason, { unlock = true } = {}) {
      const runtimeState = this.state.runtime;
      const sessionState = this.state.strategy.session;
      const targetMode = this.getModeDefinition(runtimeState.targetMode);

      if (!targetMode) {
        return false;
      }

      if (sessionState.lockedDegradation && !unlock) {
        return false;
      }

      if (runtimeState.effectiveMode === targetMode.id) {
        if (unlock) {
          this.unlockDegradation();
        }

        return false;
      }

      this.prepareForModeSwitch(runtimeState.effectiveMode, targetMode.id);

      const previousModeId = runtimeState.effectiveMode;

      runtimeState.effectiveMode = targetMode.id;
      this.syncEffectiveRuntimeLevel();
      this.recordModeRecovery(reason, targetMode.id, { unlock });
      this.recordTraceEntry(
        "recovery",
        "recover-effective-mode",
        {
          reason,
          previousModeId,
          nextModeId: targetMode.id,
          unlock,
          lockedDegradation: this.state.strategy.session.lockedDegradation,
        },
        { includeSnapshot: true }
      );
      return true;
    },

    maybeRecoverEffectiveMode(reason) {
      const sessionState = this.state.strategy.session;

      if (sessionState.lockedDegradation) {
        return false;
      }

      if (sessionState.activeAnomalyReason) {
        return false;
      }

      if (sessionState.stableSyncCount < 3) {
        return false;
      }

      return this.recoverEffectiveMode(reason, { unlock: false });
    },

    restoreCurrentSession(
      reason,
      {
        forcedModeId = "standard",
        lock = true,
        emitRequestedEvent = true,
      } = {}
    ) {
      const records = this.registry.getOrderedRecords();
      const traceRecords =
        this.traceRecorder &&
        typeof this.traceRecorder.buildTraceRecordSummaries === "function"
          ? this.traceRecorder.buildTraceRecordSummaries(records, 6)
          : [];

      if (emitRequestedEvent) {
        this.diagnostics.pushEvent("restore", "events.sessionRestoreRequested", "warn", {
          reason: formatReason(reason),
        });
      }

      this.clearAllRecordStyles(records);
      this.resetTrackedMessages();
      this.recordSessionAnomaly(reason);
      this.degradeEffectiveMode(reason, {
        forcedModeId,
        lock,
      });
      this.syncModeStateToDiagnostics();
      this.syncSessionStateToDiagnostics();
      this.diagnostics.pushEvent("restore", "events.sessionRestoreComplete", "info", {
        reason: formatReason(reason),
      });
      this.recordTraceEntry(
        "recovery",
        "restore-current-session",
        {
          reason,
          forcedModeId,
          lock,
          emitRequestedEvent,
          recordCount: records.length,
          records: traceRecords,
        },
        { includeSnapshot: true }
      );
      this.scheduleSync(reason, true);
      return true;
    },

    handleSyncFailure(message) {
      const runtimeState = this.state.runtime;
      const forcedModeId =
        runtimeState.targetMode === "off" || runtimeState.effectiveMode === "off"
          ? "off"
          : "monitor";

      this.recordSessionAnomaly("runtime-error");
      this.degradeEffectiveMode("runtime-error", {
        forcedModeId,
        lock: true,
      });
      this.syncModeStateToDiagnostics();
      this.syncSessionStateToDiagnostics();
      this.recordTraceEntry(
        "recovery",
        "sync-failure",
        {
          message,
          forcedModeId,
          targetModeId: runtimeState.targetMode || "",
          effectiveModeId: runtimeState.effectiveMode || "",
        },
        { includeSnapshot: true }
      );
    },
  };
})();
