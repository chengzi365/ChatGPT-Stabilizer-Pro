(() => {
  const app = globalThis.__CSP__;

  function createStandardSessionState() {
    return {
      syncCount: 0,
      lastSyncReason: "",
      lastRuntimeStatus: "disabled",
      lastFallbackReason: "",
      lastOptimizationEnabled: false,
      lastThresholdReached: false,
      lastEligibleCount: 0,
      lastOptimizedCount: 0,
      lastKeepAliveCount: 0,
      lastProtectedCount: 0,
      lastVisibleCount: 0,
      lastNearViewportCount: 0,
      lastCoverageRate: 0,
      lastBenefitLevel: "none",
      lastEstimatedSkippedHeight: 0,
      lastEstimatedControlledNodes: 0,
    };
  }

  app.modes.register({
    id: "standard",
    order: 20,
    tier: 0,
    family: "runtime",
    status: "implemented",
    selectable: true,
    runtimeLevel: "standard",
    fallbackTarget: "standard",
    riskTag: "low",
    labelFallback: "Standard",
    descriptionFallback:
      "Default mode. Optimizes medium-sized offscreen content while keeping interaction safety first.",
    riskFallback:
      "Low risk and intended to stay within interaction, search, and selection safety constraints.",
    createSessionState() {
      return createStandardSessionState();
    },
    evaluateRecord({
      services,
      record,
      levelConfig,
      canApplyOptimizationClasses,
      defaultDecision,
    }) {
      const eligible =
        canApplyOptimizationClasses &&
        services?.measurement?.isOptimizationCandidate?.(record, levelConfig);

      return {
        ...defaultDecision,
        eligible: Boolean(eligible),
        optimize: Boolean(eligible) && !record.protected,
        keepAlive: Boolean(eligible) && record.protected,
        modeState: null,
        controlledNodeEstimate: record.nodeCountEstimate,
        estimatedSkippedHeight: record.lastMeasuredHeight || 0,
      };
    },
    syncSession({
      strategySession,
      runtimeStatus,
      fallbackReason,
      reason,
      canApplyOptimizationClasses,
      thresholdReached,
      optimizableCount,
      optimizedCount,
      keepAliveCount,
      protectedCount,
      visibleCount,
      nearViewportCount,
      estimatedSkippedHeight,
      estimatedControlledNodes,
      coverageRate,
      benefitLevel,
    }) {
      const session = strategySession || createStandardSessionState();

      session.syncCount += 1;
      session.lastSyncReason = reason || "";
      session.lastRuntimeStatus = runtimeStatus || "disabled";
      session.lastFallbackReason = fallbackReason || "";
      session.lastOptimizationEnabled =
        Boolean(canApplyOptimizationClasses) && runtimeStatus === "active";
      session.lastThresholdReached = Boolean(thresholdReached);
      session.lastEligibleCount = optimizableCount || 0;
      session.lastOptimizedCount = optimizedCount || 0;
      session.lastKeepAliveCount = keepAliveCount || 0;
      session.lastProtectedCount = protectedCount || 0;
      session.lastVisibleCount = visibleCount || 0;
      session.lastNearViewportCount = nearViewportCount || 0;
      session.lastCoverageRate = coverageRate || 0;
      session.lastBenefitLevel = benefitLevel || "none";
      session.lastEstimatedSkippedHeight = estimatedSkippedHeight || 0;
      session.lastEstimatedControlledNodes = estimatedControlledNodes || 0;

      return session;
    },
  });
})();
