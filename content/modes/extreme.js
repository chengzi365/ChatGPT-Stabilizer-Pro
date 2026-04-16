(() => {
  const app = globalThis.__CSP__;

  function createExtremeSessionState() {
    return {
      syncCount: 0,
      lastSyncReason: "",
      planned: true,
    };
  }

  app.modes.register({
    id: "extreme",
    order: 50,
    tier: 3,
    family: "runtime",
    status: "planned",
    selectable: false,
    runtimeLevel: "extreme",
    fallbackTarget: "performance",
    riskTag: "high",
    supportsSessionRestore: true,
    labelFallback: "Extreme",
    descriptionFallback:
      "A more aggressive optimization strategy than Performance, with stronger optimization results. Coming in the next version.",
    riskFallback:
      "Planned high-risk mode. Metadata is registered, but runtime behavior is not implemented yet.",
    createSessionState() {
      return createExtremeSessionState();
    },
    syncSession({ strategySession, reason }) {
      const session = strategySession || createExtremeSessionState();

      session.syncCount += 1;
      session.lastSyncReason = reason || "";
      return session;
    },
  });
})();
