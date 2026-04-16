(() => {
  const app = globalThis.__CSP__;
  const i18n = app.core.i18n;
  const {
    formatEnabled,
    formatFallbackState,
    formatMode,
    formatPageType,
    formatSessionReason,
    formatStatus,
    formatYesNo,
    formatLockState,
  } = app.core.runtimeFormatters;
  const {
    formatDuration,
    formatNumber,
    formatPercent,
    formatPixels,
    nowLabel,
  } = app.core.utils;

  function t(key, params = {}, fallback) {
    return i18n.t(key, params, fallback);
  }

  function buildDiagnosticsSnapshotText(state) {
    return [
      t("snapshot.header", {
        appName: t("meta.appName"),
        version: app.version,
      }),
      t("snapshot.time", { value: nowLabel() }),
      t("snapshot.status", { value: formatStatus(state.runtimeStatus) }),
      t("snapshot.level", { value: formatMode(state.level) }),
      t(
        "snapshot.targetMode",
        {
          value: formatMode(state.targetMode),
        },
        "target mode: {value}"
      ),
      t(
        "snapshot.effectiveMode",
        {
          value: formatMode(state.effectiveMode),
        },
        "effective mode: {value}"
      ),
      t("snapshot.page", {
        pageType: formatPageType(state.page.isChatPage),
        path: state.page.path,
      }),
      `active adapter: ${state.page.activeAdapter || "none"}`,
      `recognition confidence: ${state.page.recognitionConfidence || "none"}`,
      t("snapshot.optimization", {
        value: formatEnabled(state.page.optimizationEnabled),
      }),
      t("snapshot.contentVisibility", {
        value: formatYesNo(state.capabilities.contentVisibility),
      }),
      t("snapshot.containIntrinsicSize", {
        value: formatYesNo(state.capabilities.containIntrinsicSize),
      }),
      t("snapshot.messages", {
        value: formatNumber(state.metrics.messageTotal),
      }),
      t("snapshot.units", {
        value: formatNumber(state.metrics.unitTotal),
      }),
      t("snapshot.optimized", {
        value: formatNumber(state.metrics.optimized),
      }),
      t("snapshot.coverage", {
        value: formatPercent(state.metrics.coverageRate),
      }),
      t("snapshot.skippedHeight", {
        value: formatPixels(state.metrics.estimatedSkippedHeight),
      }),
      t("snapshot.controlledNodes", {
        value: formatNumber(state.metrics.estimatedControlledNodes),
      }),
      t("snapshot.init", {
        value: formatDuration(state.metrics.initDurationMs),
      }),
      t("snapshot.lastSync", {
        value: formatDuration(state.metrics.lastSyncDurationMs),
      }),
      t("snapshot.avgSync", {
        value: formatDuration(state.metrics.avgSyncDurationMs),
      }),
      t("snapshot.lastResync", {
        value: formatDuration(state.metrics.lastResyncDurationMs),
      }),
      t("snapshot.resyncCount", {
        value: formatNumber(state.metrics.resyncCount),
      }),
      t("snapshot.fallback", {
        value: formatFallbackState(state.fallback),
      }),
      t(
        "snapshot.lastAnomaly",
        {
          value: formatSessionReason(state.session.lastAnomalyReason),
        },
        "last anomaly: {value}"
      ),
      t(
        "snapshot.degradeCount",
        {
          value: formatNumber(state.session.degradeCount),
        },
        "degrade count: {value}"
      ),
      t(
        "snapshot.recoveryCount",
        {
          value: formatNumber(state.session.recoveryCount),
        },
        "recovery count: {value}"
      ),
      t(
        "snapshot.lockedDegradation",
        {
          value: formatLockState(state.session.lockedDegradation),
        },
        "locked degradation: {value}"
      ),
      `trace recording: ${formatEnabled(Boolean(state.trace.recording))}`,
      `trace entries: ${formatNumber(state.trace.entryCount || 0)}`,
      `trace DOM events: ${formatNumber(state.trace.domEventCount || 0)}`,
      `trace mutation batches: ${formatNumber(
        state.trace.mutationBatchCount || 0
      )}`,
      `trace snapshots: ${formatNumber(state.trace.snapshotCount || 0)}`,
      `trace sync samples: ${formatNumber(state.trace.syncEventCount || 0)}`,
      `trace style writes: ${formatNumber(state.trace.styleWriteCount || 0)}`,
      `trace last entry: ${
        state.trace.lastKind || state.trace.lastType
          ? `${state.trace.lastKind}:${state.trace.lastType}`
          : t("common.none")
      }`,
      t("snapshot.lastError", {
        value: state.fallback.lastError || t("common.none"),
      }),
    ].join("\n");
  }

  app.core.diagnosticsSnapshot = Object.freeze({
    buildDiagnosticsSnapshotText,
  });
})();
