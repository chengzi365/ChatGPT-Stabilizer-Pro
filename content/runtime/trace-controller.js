(() => {
  const app = globalThis.__CSP__;
  const config = app.core.config;
  const storage = app.core.storage;

  app.runtime.traceControllerMethods = {
    shouldInitTraceRecorder() {
      return Boolean(storage.get(config.storageKeys.traceRecording, false));
    },

    ensureTraceRecorder() {
      if (!this.traceRecorder) {
        this.traceRecorder = new app.runtime.TraceRecorder(this);
        this.traceRecorderInitialized = false;
      }

      return this.traceRecorder;
    },

    initTraceRecorder() {
      const traceRecorder = this.ensureTraceRecorder();

      if (this.traceRecorderInitialized) {
        return traceRecorder;
      }

      traceRecorder.init();
      this.traceRecorderInitialized = true;
      return traceRecorder;
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
      const traceRecorder = this.initTraceRecorder();

      if (!traceRecorder) {
        return false;
      }

      return traceRecorder.start(options);
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
