(() => {
  const app = globalThis.__CSP__;
  const { createSyncPipelineContext } = app.runtime.syncPipelineShared;
  const syncPipelineControllerMethods =
    app.runtime.syncPipelineControllerMethods ||
    (app.runtime.syncPipelineControllerMethods = {});

  Object.assign(syncPipelineControllerMethods, {
    beginSyncPipeline(reason, isResync) {
      const pageState = this.state.page;
      const runtimeState = this.state.runtime;
      const pageService = this.services.page;
      const routeKey = pageService.getRouteKey();
      const pageSnapshot = pageService.resolveSyncContext({
        reason,
        isResync,
        routeKey,
      });

      const pipelineContext = createSyncPipelineContext({
        reason,
        isResync,
        pageService,
        routeKey,
        pageSnapshot,
        sessionRouteChanged:
          pageSnapshot.routeChangedSinceLastSync &&
          Boolean(pageState.lastSyncedRouteKey),
      });

      pipelineContext.begin.level = runtimeState.level;
      pipelineContext.begin.effectiveMode = runtimeState.effectiveMode;
      return pipelineContext;
    },

    endSyncPipeline(pipelineContext) {
      const pageService = pipelineContext?.page?.service || this.services.page;

      pageService.endSync();
    },

    commitSyncPipelineRoute(pageService, routeKey) {
      pageService.commitSyncRoute(routeKey);
    },
  });
})();
