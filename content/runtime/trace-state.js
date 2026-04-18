(() => {
  const app = globalThis.__CSP__;

  function createTraceDiagnosticsState() {
    return {
      recording: false,
      entryCount: 0,
      entryLimit: 0,
      captureLimit: 0,
      entryLimitReached: false,
      stopReason: "",
      domEventCount: 0,
      mutationBatchCount: 0,
      snapshotCount: 0,
      syncEventCount: 0,
      styleWriteCount: 0,
      startedAt: 0,
      lastUpdatedAt: 0,
      lastKind: "",
      lastType: "",
      traceSessionId: "",
    };
  }

  function createTraceRuntimeState(recording = false) {
    return {
      recording,
      traceSessionId: "",
      exportSalt: "",
      startedAt: 0,
      baseNow: 0,
      nextSeq: 1,
      nextSyncSeq: 1,
      activeSyncSeq: 0,
      activeSyncEntrySeq: 0,
      activeSyncCauseSeq: 0,
      lastTriggerSeq: 0,
      entries: [],
      lastSnapshot: null,
      domEventCount: 0,
      mutationBatchCount: 0,
      snapshotCount: 0,
      syncEventCount: 0,
      styleWriteCount: 0,
      lastUpdatedAt: 0,
      lastKind: "",
      lastType: "",
      pendingStyleBatch: null,
      entryLimitReached: false,
      stopReason: "",
      stoppingForEntryLimit: false,
    };
  }

  app.runtime.traceState = Object.freeze({
    createTraceDiagnosticsState,
    createTraceRuntimeState,
  });
  app.runtime.createTraceDiagnosticsState = createTraceDiagnosticsState;
})();
