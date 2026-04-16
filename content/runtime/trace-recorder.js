(() => {
  const app = globalThis.__CSP__;
  const config = app.core.config;
  const storage = app.core.storage;
  const ROUTE_CHANGE_EVENT = "csp:routechange";
  const TRACE_MUTATION_ATTRIBUTES = [
    "class",
    "style",
    "hidden",
    "open",
    "aria-busy",
    "aria-expanded",
    "data-state",
    "data-status",
    "data-testid",
    "data-turn-id",
    "data-scroll-anchor",
    "data-message-id",
    "data-message-author-role",
  ];

  class TraceRecorder {
    constructor(controller) {
      this.controller = controller;
      this.resumeRequested = Boolean(
        storage.get(config.storageKeys.traceRecording, false)
      );
      this.runtime = app.runtime.traceState.createTraceRuntimeState(false);
      this.mutationObserver = null;
      this.observedRoot = null;
      this.handlePointerLikeEvent = this.handlePointerLikeEvent.bind(this);
      this.handleSelectionChange = this.handleSelectionChange.bind(this);
      this.handleRouteChange = this.handleRouteChange.bind(this);
      this.storageUnsubscribe = storage.subscribe((changes, meta) => {
        this.handleStorageChanges(changes, meta);
      });
    }

    init() {
      this.syncDiagnostics();

      if (this.resumeRequested) {
        this.start({ clear: false, reason: "resume" });
      }
    }

    isRecording() {
      return this.runtime.recording;
    }

    start({ clear = true, reason = "manual" } = {}) {
      if (this.runtime.recording) {
        return false;
      }

      if (clear) {
        this.resetEntries();
      }

      this.runtime.recording = true;
      this.resumeRequested = true;
      this.runtime.startedAt = Date.now();
      this.runtime.baseNow = performance.now();
      storage.set(config.storageKeys.traceRecording, true);
      this.installListeners();
      this.rebindMutationObserver();
      this.record(
        "trace",
        "start",
        {
          reason,
          routeKey: this.controller.getRouteKey(),
          level: this.controller.state.level,
          effectiveMode: this.controller.state.effectiveMode,
        },
        { includeSnapshot: true }
      );
      this.syncDiagnostics();
      return true;
    }

    stop(reason = "manual") {
      if (!this.runtime.recording) {
        return false;
      }

      this.record(
        "trace",
        "stop",
        {
          reason,
        },
        { includeSnapshot: true }
      );
      this.runtime.recording = false;
      this.resumeRequested = false;
      storage.set(config.storageKeys.traceRecording, false);
      this.removeListeners();
      this.disconnectMutationObserver();
      this.syncDiagnostics();
      return true;
    }

    handleStorageChanges(changes, meta = {}) {
      if (!changes || meta.source === "local") {
        return;
      }

      const traceChange = changes[config.storageKeys.traceRecording];

      if (!traceChange) {
        return;
      }

      const shouldRecord = Boolean(traceChange.newValue);
      this.resumeRequested = shouldRecord;

      if (shouldRecord === this.isRecording()) {
        return;
      }

      if (shouldRecord) {
        this.start({
          clear: false,
          reason: meta.source === "hydrate" ? "hydrate-resume" : "external-sync",
        });
        return;
      }

      this.stop(meta.source === "hydrate" ? "hydrate-sync" : "external-sync");
    }

    clear() {
      const wasRecording = this.runtime.recording;

      this.resetEntries();
      this.syncDiagnostics();

      if (wasRecording) {
        this.record(
          "trace",
          "clear",
          {
            reason: "manual",
          },
          { includeSnapshot: true }
        );
      }
    }

    resetEntries() {
      this.runtime.entries = [];
      this.runtime.nextSeq = 1;
      this.runtime.lastSnapshot = null;
      this.runtime.startedAt = this.runtime.recording ? Date.now() : 0;
      this.runtime.baseNow = this.runtime.recording ? performance.now() : 0;
      this.runtime.domEventCount = 0;
      this.runtime.mutationBatchCount = 0;
      this.runtime.snapshotCount = 0;
      this.runtime.syncEventCount = 0;
      this.runtime.styleWriteCount = 0;
      this.runtime.lastUpdatedAt = 0;
      this.runtime.lastKind = "";
      this.runtime.lastType = "";
    }

    installListeners() {
      [
        "pointerdown",
        "click",
        "keydown",
        "focusin",
        "focusout",
        "input",
        "change",
      ].forEach((type) => {
        document.addEventListener(type, this.handlePointerLikeEvent, true);
      });
      document.addEventListener(
        "selectionchange",
        this.handleSelectionChange,
        true
      );
      globalThis.addEventListener(ROUTE_CHANGE_EVENT, this.handleRouteChange);
      globalThis.addEventListener("hashchange", this.handleRouteChange);
      globalThis.addEventListener("popstate", this.handleRouteChange);
    }

    removeListeners() {
      [
        "pointerdown",
        "click",
        "keydown",
        "focusin",
        "focusout",
        "input",
        "change",
      ].forEach((type) => {
        document.removeEventListener(type, this.handlePointerLikeEvent, true);
      });
      document.removeEventListener(
        "selectionchange",
        this.handleSelectionChange,
        true
      );
      globalThis.removeEventListener(ROUTE_CHANGE_EVENT, this.handleRouteChange);
      globalThis.removeEventListener("hashchange", this.handleRouteChange);
      globalThis.removeEventListener("popstate", this.handleRouteChange);
    }

    handlePointerLikeEvent(event) {
      if (!this.runtime.recording) {
        return;
      }

      const target = event.target instanceof Node ? event.target : null;
      const element = target instanceof Element ? target : target?.parentElement || null;

      if (
        element &&
        config.panel?.hostId &&
        element.closest(`#${config.panel.hostId}`)
      ) {
        return;
      }

      if (event.type === "pointerdown" || event.type === "click") {
        this.rebindMutationObserver();
      }

      this.record("dom-event", event.type, this.buildEventDetail(event), {
        includeSnapshot: true,
      });
    }

    handleSelectionChange() {
      if (!this.runtime.recording) {
        return;
      }

      const selection = globalThis.getSelection();
      const anchorElement =
        selection?.anchorNode instanceof Node
          ? selection.anchorNode instanceof Element
            ? selection.anchorNode
            : selection.anchorNode.parentElement
          : null;

      this.record(
        "dom-event",
        "selectionchange",
        {
          collapsed: selection ? selection.isCollapsed : true,
          type: selection?.type || "",
          anchor:
            anchorElement && typeof this.buildEventDetail === "function"
              ? this.buildEventDetail({ target: anchorElement }).target
              : null,
        },
        { includeSnapshot: true }
      );
    }

    handleRouteChange(event) {
      if (!this.runtime.recording) {
        return;
      }

      this.rebindMutationObserver();
      this.record(
        "route",
        event?.type || "routechange",
        {
          routeKey: this.controller.getRouteKey(),
          path: globalThis.location.pathname,
        },
        { includeSnapshot: true }
      );
    }

    disconnectMutationObserver() {
      if (this.mutationObserver) {
        this.mutationObserver.disconnect();
      }

      this.mutationObserver = null;
      this.observedRoot = null;
    }

    rebindMutationObserver() {
      if (!this.runtime.recording) {
        return;
      }

      const nextRoot = app.dom.findChatRoot() || document.body;

      if (!(nextRoot instanceof Element)) {
        return;
      }

      if (this.observedRoot === nextRoot && this.mutationObserver) {
        return;
      }

      this.disconnectMutationObserver();
      this.observedRoot = nextRoot;
      this.mutationObserver = new MutationObserver((mutations) => {
        this.handleMutationBatch(mutations);
      });
      this.mutationObserver.observe(nextRoot, {
        childList: true,
        characterData: true,
        subtree: true,
        attributes: true,
        attributeFilter: TRACE_MUTATION_ATTRIBUTES,
      });

      this.record(
        "observer",
        "mutation-observer-rebind",
        {
          root: {
            tag: nextRoot.tagName.toLowerCase(),
            id: nextRoot.id || "",
            testId: nextRoot.getAttribute("data-testid") || "",
          },
        },
        { includeSnapshot: true }
      );
    }

    handleMutationBatch(mutations) {
      if (!this.runtime.recording || !Array.isArray(mutations) || !mutations.length) {
        return;
      }

      this.runtime.mutationBatchCount += 1;
      this.record(
        "mutation",
        "batch",
        this.buildMutationSummary(mutations),
        { includeSnapshot: true }
      );
    }

    record(kind, type, detail = {}, options = {}) {
      if (!this.runtime.recording) {
        return null;
      }

      const includeSnapshot = options.includeSnapshot !== false;
      const snapshot = includeSnapshot ? this.buildSnapshot() : null;
      const delta =
        includeSnapshot && snapshot
          ? this.buildSnapshotDelta(this.runtime.lastSnapshot, snapshot)
          : null;
      const entry = {
        seq: this.runtime.nextSeq,
        at: new Date().toISOString(),
        relMs:
          this.runtime.baseNow > 0
            ? Math.round((performance.now() - this.runtime.baseNow) * 100) / 100
            : 0,
        kind,
        type,
        detail,
        snapshot,
        delta,
      };

      this.runtime.nextSeq += 1;
      this.runtime.entries.push(entry);

      while (this.runtime.entries.length > (config.trace.maxEntries || 5000)) {
        this.runtime.entries.shift();
      }

      if (snapshot) {
        this.runtime.lastSnapshot = snapshot;
        this.runtime.snapshotCount += 1;
      }

      if (kind === "dom-event") {
        this.runtime.domEventCount += 1;
      } else if (kind === "sync") {
        this.runtime.syncEventCount += 1;
      } else if (kind === "style") {
        this.runtime.styleWriteCount += 1;
      }

      this.runtime.lastKind = kind;
      this.runtime.lastType = type;
      this.runtime.lastUpdatedAt = Date.now();
      this.syncDiagnostics();
      return entry;
    }
  }

  Object.assign(
    TraceRecorder.prototype,
    app.runtime.traceRecorderSnapshotMethods,
    app.runtime.traceRecorderExportMethods
  );

  app.runtime.TraceRecorder = TraceRecorder;
})();
