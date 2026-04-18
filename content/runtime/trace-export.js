(() => {
  const app = globalThis.__CSP__;

  app.runtime.traceRecorderExportMethods = {
    exportPayload() {
      if (typeof this.flushPendingStyleBatch === "function") {
        this.flushPendingStyleBatch();
      }

      const runtimeState = this.controller?.state?.runtime || {};
      const routeSummary =
        typeof this.buildRouteSummary === "function"
          ? this.buildRouteSummary(globalThis.location, app.dom.findChatRoot())
          : {};

      return {
        appName: "ChatGPT Stabilizer Pro",
        version: app.version,
        schemaVersion: 2,
        privacyMode: "redacted",
        redaction: {
          removedFields: [
            "snapshot.title",
            "snapshot.path",
            "element.text",
            "element.ariaLabel",
            "element.title",
            "raw turnId",
            "raw messageId",
          ],
          idStrategy: "per-export salted hash",
        },
        exportedAt: new Date().toISOString(),
        traceSessionId: this.runtime.traceSessionId || "",
        route: routeSummary,
        level: runtimeState.level || "",
        targetMode: runtimeState.targetMode || "",
        effectiveMode: runtimeState.effectiveMode || "",
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
        entryLimit: this.getTraceLimits().hardLimit,
        captureLimit: this.getTraceLimits().captureLimit,
        entryLimitReached: Boolean(this.runtime.entryLimitReached),
        stopReason: this.runtime.stopReason || "",
        domEventCount: this.runtime.domEventCount,
        mutationBatchCount: this.runtime.mutationBatchCount,
        snapshotCount: this.runtime.snapshotCount,
        syncEventCount: this.runtime.syncEventCount,
        styleWriteCount: this.runtime.styleWriteCount,
        startedAt: this.runtime.startedAt,
        lastUpdatedAt: this.runtime.lastUpdatedAt,
        lastKind: this.runtime.lastKind,
        lastType: this.runtime.lastType,
        traceSessionId: this.runtime.traceSessionId || "",
      };
    },

    syncDiagnostics() {
      this.controller.diagnostics.setTraceState(this.getDiagnosticsState());
    },
  };
})();
