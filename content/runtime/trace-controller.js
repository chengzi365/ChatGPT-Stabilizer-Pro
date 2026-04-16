(() => {
  const app = globalThis.__CSP__;

  app.runtime.traceControllerMethods = {
    initTraceRecorder() {
      if (!this.traceRecorder) {
        this.traceRecorder = new app.runtime.TraceRecorder(this);
      }

      this.traceRecorder.init();
    },

    getTraceRecorderState() {
      if (!this.traceRecorder) {
        return app.runtime.createTraceDiagnosticsState
          ? app.runtime.createTraceDiagnosticsState()
          : {
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

      return this.traceRecorder.getDiagnosticsState();
    },

    isTraceRecording() {
      return Boolean(this.traceRecorder && this.traceRecorder.isRecording());
    },

    recordTraceEntry(kind, type, detail = {}, options = {}) {
      if (!this.traceRecorder) {
        return null;
      }

      return this.traceRecorder.record(kind, type, detail, options);
    },

    startTraceRecording(options = {}) {
      if (!this.traceRecorder) {
        return false;
      }

      return this.traceRecorder.start(options);
    },

    stopTraceRecording(reason = "manual") {
      if (!this.traceRecorder) {
        return false;
      }

      return this.traceRecorder.stop(reason);
    },

    toggleTraceRecording() {
      if (this.isTraceRecording()) {
        return this.stopTraceRecording("manual-toggle");
      }

      return this.startTraceRecording({
        clear: true,
        reason: "manual-toggle",
      });
    },

    clearTraceRecording() {
      if (!this.traceRecorder) {
        return false;
      }

      this.traceRecorder.clear();
      return true;
    },

    exportTraceRecording() {
      if (!this.traceRecorder) {
        return "";
      }

      return this.traceRecorder.exportText();
    },

    copyTraceRecording() {
      const traceText = this.exportTraceRecording();

      if (!traceText) {
        return false;
      }

      return app.core.utils.copyText(traceText);
    },

    downloadTraceRecording() {
      const traceText = this.exportTraceRecording();

      if (!traceText) {
        return false;
      }

      const stamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-");

      return app.core.utils.downloadText(
        `csp-trace-${stamp}.json`,
        traceText,
        "application/json;charset=utf-8"
      );
    },
  };
})();
