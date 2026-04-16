(() => {
  const app = globalThis.__CSP__;

  function createEmptyPageSnapshot(routeKey = "") {
    return {
      routeKey: typeof routeKey === "string" ? routeKey : "",
      routeChangedSinceLastSync: false,
      chatRoot: null,
      scrollRoot: null,
      isChatPage: false,
      threadReady: false,
      activeAdapterId: "",
      recognitionConfidence: "none",
    };
  }

  function createEmptyPageCollectionStats() {
    return {
      discovered: 0,
      skipped: 0,
      failures: 0,
      messageTotal: 0,
    };
  }

  function normalizePageSnapshot(snapshot = {}) {
    return {
      routeKey: typeof snapshot.routeKey === "string" ? snapshot.routeKey : "",
      routeChangedSinceLastSync: Boolean(snapshot.routeChangedSinceLastSync),
      chatRoot: snapshot.chatRoot instanceof HTMLElement ? snapshot.chatRoot : null,
      scrollRoot: snapshot.scrollRoot || null,
      isChatPage: Boolean(snapshot.isChatPage),
      threadReady: Boolean(snapshot.threadReady),
      activeAdapterId: String(snapshot.activeAdapterId || "").trim(),
      recognitionConfidence:
        String(snapshot.recognitionConfidence || "none").trim() || "none",
    };
  }

  function normalizePageCollectionStats(stats = {}) {
    return {
      discovered: Number.isFinite(stats.discovered) ? stats.discovered : 0,
      skipped: Number.isFinite(stats.skipped) ? stats.skipped : 0,
      failures: Number.isFinite(stats.failures) ? stats.failures : 0,
      messageTotal: Number.isFinite(stats.messageTotal) ? stats.messageTotal : 0,
    };
  }

  function createPageMessageCollection({
    units = [],
    skipped = 0,
    failures = 0,
    messageTotal = 0,
  } = {}) {
    return {
      units: Array.isArray(units) ? units : [],
      stats: normalizePageCollectionStats({
        discovered: Array.isArray(units) ? units.length : 0,
        skipped,
        failures,
        messageTotal,
      }),
    };
  }

  app.dom.pageState = Object.freeze({
    createEmptyPageSnapshot,
    createEmptyPageCollectionStats,
    normalizePageSnapshot,
    normalizePageCollectionStats,
    createPageMessageCollection,
  });
})();
