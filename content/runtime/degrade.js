(() => {
  const app = globalThis.__CSP__;

  app.runtime.degradeControllerMethods = {
    resolveNextFallbackMode(modeId) {
      const mode = this.getModeDefinition(modeId);

      if (!mode || !mode.fallbackTarget) {
        return null;
      }

      return this.getModeDefinition(mode.fallbackTarget);
    },

    degradeEffectiveMode(reason, { forcedModeId = "", lock = false } = {}) {
      const runtimeState = this.state.runtime;
      const sessionState = this.state.strategy.session;
      const currentModeId = runtimeState.effectiveMode || runtimeState.targetMode;
      const nextMode =
        (forcedModeId ? this.getModeDefinition(forcedModeId) : null) ||
        this.resolveNextFallbackMode(currentModeId);

      if (!nextMode) {
        return false;
      }

      if (runtimeState.effectiveMode === nextMode.id) {
        if (lock && !sessionState.lockedDegradation) {
          sessionState.lockedDegradation = true;
          sessionState.lockedReason = reason;
          this.syncSessionStateToDiagnostics();
        }

        return false;
      }

      const previousModeId = runtimeState.effectiveMode;

      this.prepareForModeSwitch(previousModeId, nextMode.id);

      runtimeState.effectiveMode = nextMode.id;
      this.syncEffectiveRuntimeLevel();
      this.recordModeDegrade(reason, nextMode.id, { lock });
      this.recordTraceEntry(
        "recovery",
        "degrade-effective-mode",
        {
          reason,
          previousModeId,
          nextModeId: nextMode.id,
          forcedModeId: forcedModeId || "",
          lock,
          targetModeId: runtimeState.targetMode || "",
          lockedDegradation: this.state.strategy.session.lockedDegradation,
        },
        { includeSnapshot: true }
      );
      return true;
    },
  };
})();
