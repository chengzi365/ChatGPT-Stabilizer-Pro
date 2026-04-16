(() => {
  const app = globalThis.__CSP__;
  const config = app.core.config;
  const registry = new Map();

  function toTitleCase(value) {
    return String(value)
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function normalizeMode(mode) {
    if (!mode || typeof mode.id !== "string" || !mode.id.trim()) {
      throw new Error("Mode registration requires a non-empty id.");
    }

    const id = mode.id.trim();
    const status = mode.status || "implemented";
    const runtimeLevel = mode.runtimeLevel || id;

    return Object.freeze({
      id,
      order: Number.isFinite(mode.order) ? mode.order : registry.size,
      tier: Number.isFinite(mode.tier) ? mode.tier : 0,
      family: mode.family || "runtime",
      status,
      visible: mode.visible !== false,
      selectable: mode.selectable ?? status === "implemented",
      runtimeLevel,
      fallbackTarget: mode.fallbackTarget || config.defaultLevel,
      riskTag: mode.riskTag || "low",
      labelKey: mode.labelKey || `levels.${id}.label`,
      descriptionKey: mode.descriptionKey || `levels.${id}.description`,
      riskKey: mode.riskKey || `levels.${id}.risk`,
      labelFallback: mode.labelFallback || toTitleCase(id),
      descriptionFallback: mode.descriptionFallback || toTitleCase(id),
      riskFallback: mode.riskFallback || "",
      supportsSessionRestore: Boolean(mode.supportsSessionRestore),
      createSessionState:
        typeof mode.createSessionState === "function"
          ? mode.createSessionState
          : null,
      getRuntimeState:
        typeof mode.getRuntimeState === "function" ? mode.getRuntimeState : null,
      getObserverHints:
        typeof mode.getObserverHints === "function" ? mode.getObserverHints : null,
      getForegroundBusyHint:
        typeof mode.getForegroundBusyHint === "function"
          ? mode.getForegroundBusyHint
          : null,
      markSelfMutationSuppressed:
        typeof mode.markSelfMutationSuppressed === "function"
          ? mode.markSelfMutationSuppressed
          : null,
      queueMeasurementBacklog:
        typeof mode.queueMeasurementBacklog === "function"
          ? mode.queueMeasurementBacklog
          : null,
      collectMeasurementBacklog:
        typeof mode.collectMeasurementBacklog === "function"
          ? mode.collectMeasurementBacklog
          : null,
      pruneMeasurementBacklog:
        typeof mode.pruneMeasurementBacklog === "function"
          ? mode.pruneMeasurementBacklog
          : null,
      recordSlowSync:
        typeof mode.recordSlowSync === "function" ? mode.recordSlowSync : null,
      getSearchNoticeState:
        typeof mode.getSearchNoticeState === "function"
          ? mode.getSearchNoticeState
          : null,
      markSearchNotice:
        typeof mode.markSearchNotice === "function" ? mode.markSearchNotice : null,
      commitSyncTelemetry:
        typeof mode.commitSyncTelemetry === "function"
          ? mode.commitSyncTelemetry
          : null,
      isCyclePrepared:
        typeof mode.isCyclePrepared === "function" ? mode.isCyclePrepared : null,
      setCyclePrepared:
        typeof mode.setCyclePrepared === "function" ? mode.setCyclePrepared : null,
      prepareModeSwitch:
        typeof mode.prepareModeSwitch === "function" ? mode.prepareModeSwitch : null,
      clearRecordRuntime:
        typeof mode.clearRecordRuntime === "function" ? mode.clearRecordRuntime : null,
      canReuseDecision:
        typeof mode.canReuseDecision === "function" ? mode.canReuseDecision : null,
      cacheDecision:
        typeof mode.cacheDecision === "function" ? mode.cacheDecision : null,
      markRecordDecisionDirty:
        typeof mode.markRecordDecisionDirty === "function"
          ? mode.markRecordDecisionDirty
          : null,
      collectDecisionWorkset:
        typeof mode.collectDecisionWorkset === "function"
          ? mode.collectDecisionWorkset
          : null,
      collectStateRefreshSet:
        typeof mode.collectStateRefreshSet === "function"
          ? mode.collectStateRefreshSet
          : null,
      buildEvaluationOrder:
        typeof mode.buildEvaluationOrder === "function"
          ? mode.buildEvaluationOrder
          : null,
      getCachedDecision:
        typeof mode.getCachedDecision === "function" ? mode.getCachedDecision : null,
      evaluateRecord:
        typeof mode.evaluateRecord === "function" ? mode.evaluateRecord : null,
      evaluateSession:
        typeof mode.evaluateSession === "function" ? mode.evaluateSession : null,
      syncSession:
        typeof mode.syncSession === "function" ? mode.syncSession : null,
    });
  }

  function sortModes(left, right) {
    if (left.order !== right.order) {
      return left.order - right.order;
    }

    return left.id.localeCompare(right.id);
  }

  function listModes() {
    return Array.from(registry.values()).sort(sortModes);
  }

  function listVisibleModes() {
    return listModes().filter((mode) => mode.visible);
  }

  function listImplementedModes() {
    return listVisibleModes().filter((mode) => mode.selectable);
  }

  function listPlannedModes() {
    return listVisibleModes().filter((mode) => !mode.selectable);
  }

  function createModeSnapshot(mode) {
    return {
      id: mode.id,
      tier: mode.tier,
      family: mode.family,
      status: mode.status,
      selectable: mode.selectable,
      visible: mode.visible,
      runtimeLevel: mode.runtimeLevel,
      fallbackTarget: mode.fallbackTarget,
      riskTag: mode.riskTag,
      labelKey: mode.labelKey,
      descriptionKey: mode.descriptionKey,
      riskKey: mode.riskKey,
      labelFallback: mode.labelFallback,
      descriptionFallback: mode.descriptionFallback,
      riskFallback: mode.riskFallback,
      supportsSessionRestore: mode.supportsSessionRestore,
    };
  }

  function getMode(id) {
    return registry.get(String(id || "").trim()) || null;
  }

  function resolveFallbackMode(mode) {
    const visited = new Set();
    let currentMode = mode;

    while (currentMode && currentMode.fallbackTarget && !visited.has(currentMode.id)) {
      visited.add(currentMode.id);

      const fallbackMode = getMode(currentMode.fallbackTarget);

      if (!fallbackMode) {
        break;
      }

      if (fallbackMode.selectable) {
        return fallbackMode;
      }

      currentMode = fallbackMode;
    }

    return null;
  }

  function resolveModeSelection(id) {
    const requestedId = String(id || "").trim();
    const requestedMode = getMode(requestedId);

    if (requestedMode && requestedMode.selectable) {
      return requestedMode;
    }

    if (requestedMode && requestedMode.fallbackTarget) {
      const fallbackMode = resolveFallbackMode(requestedMode);

      if (fallbackMode) {
        return fallbackMode;
      }
    }

    return (
      getMode(config.defaultLevel) ||
      listImplementedModes()[0] ||
      null
    );
  }

  function getDiagnosticsCatalog() {
    const visibleModes = listVisibleModes();

    return {
      modes: visibleModes.map(createModeSnapshot),
      availableLevels: listImplementedModes().map((mode) => mode.id),
      plannedLevels: listPlannedModes().map((mode) => mode.id),
    };
  }

  function registerBuiltinUtilityModes() {
    [
      {
        id: "off",
        order: 0,
        tier: -20,
        family: "utility",
        status: "implemented",
        selectable: true,
        runtimeLevel: "off",
        fallbackTarget: "standard",
        riskTag: "none",
      },
      {
        id: "monitor",
        order: 10,
        tier: -10,
        family: "utility",
        status: "implemented",
        selectable: true,
        runtimeLevel: "monitor",
        fallbackTarget: "standard",
        riskTag: "very-low",
      },
    ].forEach((mode) => {
      const normalizedMode = normalizeMode(mode);
      registry.set(normalizedMode.id, normalizedMode);
    });
  }

  function register(mode) {
    const normalizedMode = normalizeMode(mode);
    registry.set(normalizedMode.id, normalizedMode);
    return normalizedMode;
  }

  registerBuiltinUtilityModes();

  app.modes.register = register;
  app.modes.get = getMode;
  app.modes.list = listModes;
  app.modes.listVisible = listVisibleModes;
  app.modes.listImplemented = listImplementedModes;
  app.modes.listPlanned = listPlannedModes;
  app.modes.resolveSelection = resolveModeSelection;
  app.modes.getDiagnosticsCatalog = getDiagnosticsCatalog;
})();
