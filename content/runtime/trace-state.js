(() => {
  const app = globalThis.__CSP__;

  function createTraceDiagnosticsState() {
    return {
      recording: false,
      entryCount: 0,
      domEventCount: 0,
      mutationBatchCount: 0,
      snapshotCount: 0,
      syncEventCount: 0,
      styleWriteCount: 0,
      startedAt: 0,
      lastUpdatedAt: 0,
      lastKind: "",
      lastType: "",
    };
  }

  function createTraceRuntimeState(recording = false) {
    return {
      recording,
      startedAt: 0,
      baseNow: 0,
      nextSeq: 1,
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
    };
  }

  app.runtime.traceState = Object.freeze({
    createTraceDiagnosticsState,
    createTraceRuntimeState,
  });
  app.runtime.createTraceDiagnosticsState = createTraceDiagnosticsState;
})();
