(() => {
  const app = globalThis.__CSP__;
  const discoveryCache = app.dom.discoveryCache;
  const pageRecognition = app.dom.pageRecognition;
  const messageCollection = app.dom.messageCollection;
  const pageState = app.dom.pageState;
  const {
    createEmptyPageSnapshot,
    createEmptyPageCollectionStats,
    normalizePageSnapshot,
    normalizePageCollectionStats,
    createPageMessageCollection,
  } = pageState;

  app.dom.pageAdapterControllerMethods = {
    endPageAdapterSync() {
      discoveryCache.endDiscoverySync();
    },

    applyPageSnapshot(snapshot) {
      const currentPageState = this.state.page;
      const normalizedSnapshot = normalizePageSnapshot(snapshot);

      currentPageState.chatRoot = normalizedSnapshot.chatRoot;
      currentPageState.scrollRoot = normalizedSnapshot.scrollRoot;
      currentPageState.isChatPage = normalizedSnapshot.isChatPage;
      currentPageState.threadReady = normalizedSnapshot.threadReady;
      currentPageState.activeAdapterId = normalizedSnapshot.activeAdapterId;
      currentPageState.recognitionConfidence =
        normalizedSnapshot.recognitionConfidence;

      return normalizedSnapshot;
    },

    resolvePageSyncContext({ reason = "", isResync = false, routeKey = "" } = {}) {
      const currentPageState = this.state.page;
      const nextRouteKey =
        typeof routeKey === "string" && routeKey ? routeKey : this.getRouteKey();
      discoveryCache.beginDiscoverySync(nextRouteKey);
      const routeChangedSinceLastSync =
        nextRouteKey !== currentPageState.lastSyncedRouteKey;
      const discovery = pageRecognition.resolveDiscovery({
        reason,
        isResync,
        routeKey: nextRouteKey,
        routeChangedSinceLastSync,
      });
      const isChatPage = Boolean(discovery?.isChatPage);
      const chatRoot =
        discovery?.chatRoot instanceof HTMLElement ? discovery.chatRoot : null;
      const snapshot = normalizePageSnapshot({
        routeKey: nextRouteKey,
        routeChangedSinceLastSync,
        chatRoot,
        scrollRoot: isChatPage ? pageRecognition.findScrollRoot(chatRoot) : null,
        isChatPage,
        threadReady: discovery?.threadReady,
        activeAdapterId: discovery?.activeAdapterId,
        recognitionConfidence: discovery?.recognitionConfidence,
      });

      this.applyPageSnapshot(snapshot);
      return snapshot;
    },

    clearPageCollectionStats() {
      const clearedStats = createEmptyPageCollectionStats();

      this.state.page.lastCollectionStats = clearedStats;
      return clearedStats;
    },

    collectPageSyncCollection(pageSnapshot = null) {
      const snapshot =
        pageSnapshot && typeof pageSnapshot === "object"
          ? pageSnapshot
          : createEmptyPageSnapshot(this.getRouteKey());
      const routeKey =
        typeof snapshot.routeKey === "string" && snapshot.routeKey
          ? snapshot.routeKey
          : this.getRouteKey();
      const chatRoot =
        snapshot.chatRoot instanceof HTMLElement
          ? snapshot.chatRoot
          : this.state.page.chatRoot;
      const collection = messageCollection.collectMessageUnits(chatRoot, routeKey);
      const messageTotal = messageCollection.collectMessageElements(
        chatRoot,
        routeKey
      ).length;
      const collectionResult = createPageMessageCollection({
        units: collection.units,
        skipped: collection.skipped,
        failures: collection.failures,
        messageTotal,
      });

      this.state.page.lastCollectionStats = normalizePageCollectionStats(
        collectionResult.stats
      );
      return collectionResult;
    },

    commitPageSyncRoute(routeKey = "") {
      const currentPageState = this.state.page;
      const nextRouteKey =
        typeof routeKey === "string" && routeKey
          ? routeKey
          : currentPageState.lastObservedRouteKey || this.getRouteKey();

      currentPageState.lastObservedRouteKey = nextRouteKey;
      currentPageState.lastSyncedRouteKey = nextRouteKey;
    },
  };
})();
