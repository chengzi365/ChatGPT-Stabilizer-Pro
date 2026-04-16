(() => {
  const app = globalThis.__CSP__;
  const i18n = app.core.i18n;

  function t(key, params = {}, fallback) {
    return i18n.t(key, params, fallback);
  }

  function formatLevel(level) {
    return t(`levels.${level}.label`, {}, level);
  }

  function resolveMode(modeOrId) {
    if (!modeOrId) {
      return null;
    }

    if (typeof modeOrId === "object") {
      return modeOrId;
    }

    if (app.modes && typeof app.modes.get === "function") {
      return app.modes.get(modeOrId);
    }

    return null;
  }

  function formatMode(modeId) {
    const mode = resolveMode(modeId);

    if (mode) {
      return t(mode.labelKey, {}, mode.labelFallback || mode.id);
    }

    return formatLevel(modeId);
  }

  function formatModeLabel(mode) {
    const resolvedMode = resolveMode(mode);

    if (!resolvedMode) {
      return formatLevel(typeof mode === "string" ? mode : "");
    }

    return t(
      resolvedMode.labelKey,
      {},
      resolvedMode.labelFallback || resolvedMode.id
    );
  }

  function formatModeDescription(mode) {
    const resolvedMode = resolveMode(mode);

    if (!resolvedMode) {
      return typeof mode === "string" ? mode : "";
    }

    return t(
      resolvedMode.descriptionKey,
      {},
      resolvedMode.descriptionFallback ||
        resolvedMode.labelFallback ||
        resolvedMode.id
    );
  }

  function formatModeRisk(mode) {
    const resolvedMode = resolveMode(mode);

    if (!resolvedMode) {
      return "";
    }

    return t(
      resolvedMode.riskKey,
      {},
      resolvedMode.riskFallback || ""
    );
  }

  function formatStatus(status) {
    return t(`runtimeStatus.${status}`, {}, status);
  }

  function formatYesNo(value) {
    return t(value ? "common.yes" : "common.no");
  }

  function formatEnabled(value) {
    return t(value ? "common.enabled" : "common.disabled");
  }

  function formatReady(value) {
    return t(value ? "common.ready" : "common.missing");
  }

  function formatReason(reason) {
    if (!reason) {
      return t("common.none");
    }

    return t(`syncReasons.${reason}`, {}, reason);
  }

  function formatRuntimeProfile(profile) {
    if (!profile) {
      return t("common.none");
    }

    return t(`panel.runtimeProfile.${profile}`, {}, profile);
  }

  function formatDeviceTier(deviceTier) {
    if (!deviceTier) {
      return t("common.none");
    }

    return t(`panel.deviceTier.${deviceTier}`, {}, deviceTier);
  }

  function formatRecognitionConfidence(confidence) {
    if (!confidence) {
      return t("common.none");
    }

    return t(`panel.recognitionConfidence.${confidence}`, {}, confidence);
  }

  function formatRuntimeAdapter(adapterId) {
    if (!adapterId) {
      return t("common.none");
    }

    return t(`panel.runtimeAdapter.${adapterId}`, {}, adapterId);
  }

  function formatFallbackState(fallbackState) {
    if (!fallbackState || !fallbackState.enabled) {
      return t("common.disabled");
    }

    if (!fallbackState.reason) {
      return t("common.enabled");
    }

    return t(
      `fallbackReasons.${fallbackState.reason}`,
      {},
      fallbackState.reason
    );
  }

  function formatPageType(isChatPage) {
    return t(isChatPage ? "snapshot.pageChat" : "snapshot.pageNonChat");
  }

  function formatSessionReason(reason) {
    if (!reason) {
      return t("common.none");
    }

    return t(
      `sessionReasons.${reason}`,
      {},
      t(`fallbackReasons.${reason}`, {}, reason)
    );
  }

  function formatLockState(locked) {
    return t(
      locked ? "common.locked" : "common.unlocked",
      {},
      locked ? "Locked" : "Unlocked"
    );
  }

  app.core.runtimeFormatters = Object.freeze({
    formatLevel,
    formatMode,
    formatModeLabel,
    formatModeDescription,
    formatModeRisk,
    formatStatus,
    formatYesNo,
    formatEnabled,
    formatReady,
    formatReason,
    formatRuntimeProfile,
    formatDeviceTier,
    formatRecognitionConfidence,
    formatRuntimeAdapter,
    formatFallbackState,
    formatPageType,
    formatSessionReason,
    formatLockState,
  });
})();
