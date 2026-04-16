(() => {
  const app = globalThis.__CSP__;

  function createPageServices(controller) {
    return Object.freeze({
      getRouteKey: () => controller.getRouteKey(),
      endSync: () => controller.endPageAdapterSync(),
      resolveSyncContext: (options) => controller.resolvePageSyncContext(options),
      commitSyncRoute: (routeKey) => controller.commitPageSyncRoute(routeKey),
      clearCollectionStats: () => controller.clearPageCollectionStats(),
      collectSyncCollection: (pageSnapshot) =>
        controller.collectPageSyncCollection(pageSnapshot),
    });
  }

  function createMeasurementServices(controller) {
    return Object.freeze({
      queueRecord: (recordId) => controller.queueMeasurementRecord(recordId),
      isOptimizationCandidate: (record, levelConfig) =>
        controller.isRecordOptimizationCandidate(record, levelConfig),
    });
  }

  function createProtectionServices(controller) {
    return Object.freeze({
      isBottomFollowActive: () => controller.isBottomFollowActive(),
    });
  }

  function createSchedulerServices(controller) {
    return Object.freeze({
      scheduleSync: (reason, isResync) => controller.scheduleSync(reason, isResync),
      scheduleLowPrioritySync: (reason) => controller.scheduleLowPrioritySync(reason),
    });
  }

  function createRuntimeServices(controller) {
    return Object.freeze({
      page: createPageServices(controller),
      measurement: createMeasurementServices(controller),
      protection: createProtectionServices(controller),
      scheduler: createSchedulerServices(controller),
    });
  }

  app.runtime.createRuntimeServices = createRuntimeServices;
})();
