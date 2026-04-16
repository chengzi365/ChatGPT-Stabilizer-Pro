(() => {
  const app = globalThis.__CSP__;

  app.runtime.traceRecorderExportMethods = {
    exportPayload() {
      return {
        appName: "ChatGPT Stabilizer Pro",
        version: app.version,
        exportedAt: new Date().toISOString(),
        routeKey: this.controller.getRouteKey(),
        level: this.controller.state.level,
        targetMode: this.controller.state.targetMode,
        effectiveMode: this.controller.state.effectiveMode,
        trace: {
          ...this.getDiagnosticsState(),
          entrySampleCount: this.runtime.entries.length,
        },
        entries: this.runtime.entries.map((entry) => ({
          ...entry,
        })),
      };
    },

    exportText() {
      return JSON.stringify(this.exportPayload(), null, 2);
    },

    getDiagnosticsState() {
      return {
        recording: this.runtime.recording,
        entryCount: this.runtime.entries.length,
        domEventCount: this.runtime.domEventCount,
        mutationBatchCount: this.runtime.mutationBatchCount,
        snapshotCount: this.runtime.snapshotCount,
        syncEventCount: this.runtime.syncEventCount,
        styleWriteCount: this.runtime.styleWriteCount,
        startedAt: this.runtime.startedAt,
        lastUpdatedAt: this.runtime.lastUpdatedAt,
        lastKind: this.runtime.lastKind,
        lastType: this.runtime.lastType,
      };
    },

    syncDiagnostics() {
      this.controller.diagnostics.setTraceState(this.getDiagnosticsState());
    },
  };
})();
