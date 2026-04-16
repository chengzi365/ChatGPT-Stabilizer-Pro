(() => {
  const app = globalThis.__CSP__;

  function createEmptySignals() {
    return {
      composerCount: 0,
      turnCount: 0,
      messageCount: 0,
      contentCount: 0,
      contentMessageBalance: 0,
      isChatShell: false,
      threadReady: false,
      score: 0,
      recognitionConfidence: "none",
    };
  }

  function createDiscoveryState() {
    return {
      routeKey: "",
      chatRoot: null,
      isChatPage: false,
      threadReady: false,
      activeAdapterId: "",
      recognitionConfidence: "none",
      signals: createEmptySignals(),
      scanCache: null,
      scanSessionActive: false,
    };
  }

  const discoveryState = createDiscoveryState();

  function getCurrentRouteKey(routeKey) {
    if (typeof routeKey === "string" && routeKey) {
      return routeKey;
    }

    if (typeof app.dom.getNormalizedRouteKey === "function") {
      return app.dom.getNormalizedRouteKey();
    }

    return `${globalThis.location.pathname}${globalThis.location.search}${globalThis.location.hash}`;
  }

  function createScanCache(routeKey = "") {
    return {
      routeKey: getCurrentRouteKey(routeKey),
      adapterRoots: new WeakMap(),
    };
  }

  function beginDiscoverySync(routeKey = "") {
    discoveryState.scanSessionActive = true;
    discoveryState.scanCache = createScanCache(routeKey);
    return discoveryState.scanCache;
  }

  function endDiscoverySync() {
    discoveryState.scanSessionActive = false;
    discoveryState.scanCache = null;
  }

  function withDiscoveryScanCache(routeKey = "", callback) {
    const currentRouteKey = getCurrentRouteKey(routeKey);
    const ownsCache = !discoveryState.scanSessionActive;

    if (
      !discoveryState.scanCache ||
      discoveryState.scanCache.routeKey !== currentRouteKey
    ) {
      discoveryState.scanCache = createScanCache(currentRouteKey);
    }

    try {
      return typeof callback === "function" ? callback() : null;
    } finally {
      if (ownsCache) {
        discoveryState.scanCache = null;
      }
    }
  }

  function getDiscoveryScanCache(routeKey = "") {
    const currentRouteKey = getCurrentRouteKey(routeKey);

    if (
      !discoveryState.scanCache ||
      discoveryState.scanCache.routeKey !== currentRouteKey
    ) {
      discoveryState.scanCache = createScanCache(currentRouteKey);
    }

    return discoveryState.scanCache;
  }

  const discoveryCache = {
    state: discoveryState,
    createEmptySignals,
    createDiscoveryState,
    createScanCache,
    getCurrentRouteKey,
    beginDiscoverySync,
    endDiscoverySync,
    withDiscoveryScanCache,
    getDiscoveryScanCache,
  };

  app.dom.discoveryCache = discoveryCache;
  Object.assign(app.dom, {
    beginDiscoverySync,
    endDiscoverySync,
  });
})();
