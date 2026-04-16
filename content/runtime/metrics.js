(() => {
  const app = globalThis.__CSP__;

  function buildSessionDiagnosticsState(controllerState) {
    const session = controllerState.strategy?.session || {};

    return {
      activeAnomalyReason: session.activeAnomalyReason,
      anomalyCount: session.anomalyCount,
      lastAnomalyReason: session.lastAnomalyReason,
      lastAnomalyAt: session.lastAnomalyAt,
      degradeCount: session.degradeCount,
      lastDegradeReason: session.lastDegradeReason,
      lastDegradeMode: session.lastDegradeMode,
      lastDegradeAt: session.lastDegradeAt,
      recoveryCount: session.recoveryCount,
      lastRecoveryReason: session.lastRecoveryReason,
      lastRecoveryMode: session.lastRecoveryMode,
      lastRecoveryAt: session.lastRecoveryAt,
      lockedDegradation: session.lockedDegradation,
      lockedReason: session.lockedReason,
    };
  }

  app.runtime.metricsControllerMethods = {
    syncModeStateToDiagnostics() {
      const runtimeState = this.state.runtime;

      this.diagnostics.setModeState({
        targetMode: runtimeState.targetMode,
        effectiveMode: runtimeState.effectiveMode,
        level: runtimeState.level,
      });
    },

    syncSessionStateToDiagnostics() {
      this.diagnostics.setSessionState(buildSessionDiagnosticsState(this.state));
    },

    resetSessionRuntimeState({ alignEffectiveMode = true } = {}) {
      const runtimeState = this.state.runtime;
      const strategyState = this.state.strategy;

      strategyState.session = app.runtime.createSessionRuntimeState();

      this.clearAllModeStrategySessions();
      this.clearBottomFollow();
      this.resetBaseRuntimeTracking();

      if (alignEffectiveMode) {
        runtimeState.effectiveMode = runtimeState.targetMode;
        this.syncEffectiveRuntimeLevel();
      }

      this.syncModeStateToDiagnostics();
      this.syncSessionStateToDiagnostics();
    },

    recordSessionAnomaly(reason) {
      const sessionState = this.state.strategy.session;

      if (!reason) {
        return false;
      }

      if (sessionState.activeAnomalyReason === reason) {
        sessionState.stableSyncCount = 0;
        return false;
      }

      sessionState.activeAnomalyReason = reason;
      sessionState.anomalyCount += 1;
      sessionState.lastAnomalyReason = reason;
      sessionState.lastAnomalyAt = Date.now();
      sessionState.stableSyncCount = 0;
      this.syncSessionStateToDiagnostics();
      return true;
    },

    clearSessionAnomaly() {
      const sessionState = this.state.strategy.session;

      if (!sessionState.activeAnomalyReason) {
        return false;
      }

      sessionState.activeAnomalyReason = "";
      sessionState.stableSyncCount = 0;
      this.syncSessionStateToDiagnostics();
      return true;
    },

    markSessionStable() {
      this.state.strategy.session.stableSyncCount += 1;
    },

    recordModeDegrade(reason, nextModeId, { lock = false } = {}) {
      const sessionState = this.state.strategy.session;

      sessionState.degradeCount += 1;
      sessionState.lastDegradeReason = reason;
      sessionState.lastDegradeMode = nextModeId;
      sessionState.lastDegradeAt = Date.now();
      sessionState.stableSyncCount = 0;

      if (lock) {
        sessionState.lockedDegradation = true;
        sessionState.lockedReason = reason;
      }

      this.syncModeStateToDiagnostics();
      this.syncSessionStateToDiagnostics();
    },

    recordModeRecovery(reason, nextModeId, { unlock = true } = {}) {
      const sessionState = this.state.strategy.session;

      sessionState.recoveryCount += 1;
      sessionState.lastRecoveryReason = reason;
      sessionState.lastRecoveryMode = nextModeId;
      sessionState.lastRecoveryAt = Date.now();
      sessionState.stableSyncCount = 0;

      if (unlock) {
        sessionState.lockedDegradation = false;
        sessionState.lockedReason = "";
      }

      this.syncModeStateToDiagnostics();
      this.syncSessionStateToDiagnostics();
    },

    observeRuntimeHealth({ runtimeStatus, fallbackReason }) {
      if (runtimeStatus === "error") {
        this.recordSessionAnomaly("runtime-error");
        return;
      }

      if (fallbackReason) {
        this.recordSessionAnomaly(fallbackReason);
        return;
      }

      const hadActiveAnomaly = this.clearSessionAnomaly();
      this.markSessionStable();

      if (!hadActiveAnomaly) {
        this.syncSessionStateToDiagnostics();
      }

      this.maybeRecoverEffectiveMode("stability");
    },
  };
})();
