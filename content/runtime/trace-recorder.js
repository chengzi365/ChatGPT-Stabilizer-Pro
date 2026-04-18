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
  const TRACE_KIND_TRIGGER_SET = new Set([
    "dom-event",
    "mutation",
    "route",
    "observer",
  ]);

  function createRandomToken(byteCount = 8) {
    const bytes = new Uint8Array(byteCount);

    if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === "function") {
      globalThis.crypto.getRandomValues(bytes);
    } else {
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Math.floor(Math.random() * 256);
      }
    }

    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  }

  function createTraceSessionId() {
    const stamp = new Date().toISOString().replace(/[^\dTZ]/g, "").slice(0, 15);

    return `trace_${stamp}_${createRandomToken(4)}`;
  }

  function normalizePositiveInteger(value) {
    return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
  }

  function normalizeHashList(values, maxSize = 24) {
    const output = [];
    const seen = new Set();
    const source = Array.isArray(values) ? values : [];

    for (let index = 0; index < source.length; index += 1) {
      const value = typeof source[index] === "string" ? source[index].trim() : "";

      if (!value || seen.has(value)) {
        continue;
      }

      seen.add(value);
      output.push(value);

      if (output.length >= maxSize) {
        break;
      }
    }

    return output;
  }

  function extractAffectedTurnHashes(detail) {
    if (!detail || typeof detail !== "object") {
      return [];
    }

    const values = [];
    const appendTurnHash = (value) => {
      if (typeof value === "string" && value) {
        values.push(value);
      }
    };
    const appendTurnList = (items) => {
      if (!Array.isArray(items)) {
        return;
      }

      items.forEach((item) => {
        if (item && typeof item === "object") {
          appendTurnHash(item.turnHash);
        }
      });
    };

    appendTurnHash(detail.turnHash);
    appendTurnHash(detail.target?.turnHash);
    appendTurnHash(detail.anchor?.turnHash);
    appendTurnHash(detail.record?.turnHash);
    appendTurnHash(detail.focusedRecord?.turnHash);
    appendTurnHash(detail.selectedRecord?.turnHash);
    appendTurnHash(detail.latestAssistantRecord?.turnHash);
    appendTurnList(detail.addedTurns);
    appendTurnList(detail.removedTurns);
    appendTurnList(detail.records);
    appendTurnList(detail.changedRecords);

    if (Array.isArray(detail.turnHashes)) {
      detail.turnHashes.forEach(appendTurnHash);
    }

    if (Array.isArray(detail.affectedTurnHashes)) {
      detail.affectedTurnHashes.forEach(appendTurnHash);
    }

    return normalizeHashList(values);
  }

  function cloneRecordSummary(record) {
    return record && typeof record === "object" ? { ...record } : null;
  }

  function buildStyleBatchDetail(batch) {
    if (!batch || typeof batch !== "object") {
      return null;
    }

    return {
      batched: true,
      count: batch.count,
      optimizeCount: batch.optimizeCount,
      keepAliveCount: batch.keepAliveCount,
      eligibleCount: batch.eligibleCount,
      requiresMeasurementFollowupCount:
        batch.requiresMeasurementFollowupCount,
      modeIds: Array.from(batch.modeIds || []),
      distanceTiers: Array.from(batch.distanceTiers || []),
      sampleCount: Array.isArray(batch.records) ? batch.records.length : 0,
      truncatedCount: batch.truncatedCount || 0,
      firstAt: batch.firstAt || "",
      firstRelMs: batch.firstRelMs || 0,
      lastAt: batch.lastAt || "",
      lastRelMs: batch.lastRelMs || 0,
      firstRecord: batch.firstRecord || null,
      lastRecord: batch.lastRecord || null,
      records: Array.isArray(batch.records) ? batch.records : [],
    };
  }

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

    ensureTraceSession() {
      if (!this.runtime.traceSessionId || !this.runtime.exportSalt) {
        this.rotateTraceSession();
      }
    }

    rotateTraceSession() {
      this.runtime.traceSessionId = createTraceSessionId();
      this.runtime.exportSalt = createRandomToken(12);
      this.runtime.nextSyncSeq = 1;
      this.runtime.activeSyncSeq = 0;
      this.runtime.activeSyncEntrySeq = 0;
      this.runtime.activeSyncCauseSeq = 0;
      this.runtime.lastTriggerSeq = 0;
    }

    getTraceLimits() {
      const hardLimit = Math.max(
        4,
        normalizePositiveInteger(config.trace.maxEntries) || 5000
      );
      const reserve = Math.min(
        Math.max(1, hardLimit - 1),
        Math.max(2, normalizePositiveInteger(config.trace.stopReserveEntries) || 2)
      );

      return {
        hardLimit,
        reserve,
        captureLimit: Math.max(1, hardLimit - reserve),
      };
    }

    resetStopState() {
      this.runtime.entryLimitReached = false;
      this.runtime.stopReason = "";
      this.runtime.stoppingForEntryLimit = false;
    }

    start({ clear = true, reason = "manual" } = {}) {
      const runtimeState = this.controller?.state?.runtime || {};

      if (runtimeState.level === "off") {
        this.resumeRequested = false;
        storage.set(config.storageKeys.traceRecording, false);
        this.syncDiagnostics();
        return false;
      }

      if (this.runtime.recording) {
        return false;
      }

      if (clear) {
        this.resetEntries();
      } else {
        this.ensureTraceSession();
        this.resetStopState();
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
          routeHash:
            typeof this.buildRouteSummary === "function"
              ? this.buildRouteSummary(globalThis.location).routeHash
              : "",
          level: runtimeState.level || "",
          effectiveMode: runtimeState.effectiveMode || "",
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

      this.flushPendingStyleBatch({
        allowReservedEntry: true,
      });
      return this.finalizeStop(reason, {
        allowReservedEntry: true,
      });
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
      this.runtime.pendingStyleBatch = null;
      this.resetStopState();
      this.rotateTraceSession();
    }

    finalizeStop(reason, options = {}) {
      if (!this.runtime.recording) {
        return false;
      }

      const runtime = this.runtime;
      const stopEntryDetail = {
        reason,
      };

      if (options.pendingStyleBatch) {
        stopEntryDetail.pendingStyleBatch = options.pendingStyleBatch;
      }

      this.appendEntry(
        "trace",
        "stop",
        stopEntryDetail,
        {
          includeSnapshot: true,
          syncSeq: 0,
          causeSeq: 0,
          parentSeq: 0,
          affectedTurnHashes: [],
        },
        {
          allowReservedEntry: Boolean(options.allowReservedEntry),
        }
      );

      runtime.recording = false;
      runtime.activeSyncSeq = 0;
      runtime.activeSyncEntrySeq = 0;
      runtime.activeSyncCauseSeq = 0;
      runtime.pendingStyleBatch = null;
      runtime.stopReason = reason;
      runtime.entryLimitReached = reason === "max-entries-reached";
      runtime.stoppingForEntryLimit = false;
      this.resumeRequested = false;
      storage.set(config.storageKeys.traceRecording, false);
      this.removeListeners();
      this.disconnectMutationObserver();
      this.syncDiagnostics();
      return true;
    }

    handleMaxEntriesReached(blockedKind, blockedType, entryState = {}, pendingStyleBatch = null) {
      const runtime = this.runtime;

      if (!runtime.recording || runtime.stoppingForEntryLimit) {
        return false;
      }

      runtime.stoppingForEntryLimit = true;
      const { hardLimit, captureLimit } = this.getTraceLimits();
      const pendingStyleDetail =
        pendingStyleBatch ||
        this.flushPendingStyleBatch({
          returnDetailOnly: true,
        });

      this.appendEntry(
        "trace",
        "max-entries-reached",
        {
          reason: "max-entries-reached",
          maxEntries: hardLimit,
          captureLimit,
          entryCount: runtime.entries.length,
          blockedKind,
          blockedType,
          pendingStyleBatch: pendingStyleDetail,
        },
        {
          includeSnapshot: true,
          syncSeq: entryState.syncSeq || 0,
          causeSeq: entryState.causeSeq || 0,
          parentSeq: entryState.parentSeq || 0,
          affectedTurnHashes: Array.isArray(entryState.affectedTurnHashes)
            ? entryState.affectedTurnHashes
            : [],
        },
        {
          allowReservedEntry: true,
        }
      );

      this.controller?.diagnostics?.pushEvent(
        "trace",
        "events.traceMaxEntriesReached",
        "warn",
        {
          maxEntries: String(hardLimit),
        }
      );

      return this.finalizeStop("max-entries-reached", {
        allowReservedEntry: true,
      });
    }

    ensureStyleBatch(syncSeq, causeSeq, parentSeq) {
      const runtime = this.runtime;
      const batch = runtime.pendingStyleBatch;

      if (
        batch &&
        batch.syncSeq === syncSeq &&
        batch.causeSeq === causeSeq &&
        batch.parentSeq === parentSeq
      ) {
        return batch;
      }

      const flushed = this.flushPendingStyleBatch({
        returnDetailIfSkipped: true,
      });

      if (flushed && !flushed.appended) {
        this.handleMaxEntriesReached(
          "style",
          "apply-record-styles",
          {
            includeSnapshot: false,
            syncSeq,
            causeSeq,
            parentSeq,
            affectedTurnHashes: Array.isArray(batch?.affectedTurnHashes)
              ? batch.affectedTurnHashes
              : [],
          },
          flushed.detail
        );
        return null;
      }

      if (!this.runtime.recording) {
        return null;
      }

      runtime.pendingStyleBatch = {
        kind: "style",
        type: "apply-record-styles",
        syncSeq,
        causeSeq,
        parentSeq,
        count: 0,
        optimizeCount: 0,
        keepAliveCount: 0,
        eligibleCount: 0,
        requiresMeasurementFollowupCount: 0,
        modeIds: new Set(),
        distanceTiers: new Set(),
        records: [],
        firstRecord: null,
        lastRecord: null,
        truncatedCount: 0,
        affectedTurnHashes: [],
        firstAt: "",
        firstRelMs: 0,
        lastAt: "",
        lastRelMs: 0,
      };

      return runtime.pendingStyleBatch;
    }

    queueStyleBatch(detail, entryState) {
      const runtime = this.runtime;
      const batch = this.ensureStyleBatch(
        entryState.syncSeq,
        entryState.causeSeq,
        entryState.parentSeq
      );

      if (!batch || !runtime.recording) {
        return null;
      }

      const maxSamples = Math.max(4, config.trace.maxStyleBatchSamples || 12);
      const record = cloneRecordSummary(detail?.record);
      const nowIso = new Date().toISOString();
      const relMs =
        runtime.baseNow > 0
          ? Math.round((performance.now() - runtime.baseNow) * 100) / 100
          : 0;

      batch.count += 1;
      batch.optimizeCount += detail?.optimize ? 1 : 0;
      batch.keepAliveCount += detail?.keepAlive ? 1 : 0;
      batch.eligibleCount += detail?.eligible ? 1 : 0;
      batch.requiresMeasurementFollowupCount += detail?.requiresMeasurementFollowup
        ? 1
        : 0;

      if (detail?.modeId) {
        batch.modeIds.add(detail.modeId);
      }

      if (detail?.distanceTier) {
        batch.distanceTiers.add(detail.distanceTier);
      }

      if (record) {
        if (!batch.firstRecord) {
          batch.firstRecord = record;
        }

        batch.lastRecord = record;

        if (batch.records.length < maxSamples) {
          batch.records.push(record);
        } else {
          batch.truncatedCount += 1;
        }
      }

      batch.affectedTurnHashes = normalizeHashList(
        batch.affectedTurnHashes.concat(entryState.affectedTurnHashes)
      );

      if (!batch.firstAt) {
        batch.firstAt = nowIso;
        batch.firstRelMs = relMs;
      }

      batch.lastAt = nowIso;
      batch.lastRelMs = relMs;
      runtime.styleWriteCount += 1;
      runtime.lastKind = "style";
      runtime.lastType = "apply-record-styles";
      runtime.lastUpdatedAt = Date.now();
    }

    flushPendingStyleBatch(options = {}) {
      const runtime = this.runtime;
      const batch = runtime.pendingStyleBatch;

      if (!batch || batch.count <= 0) {
        runtime.pendingStyleBatch = null;
        return null;
      }

      const detail = buildStyleBatchDetail(batch);
      runtime.pendingStyleBatch = null;
      const entry = options.returnDetailOnly
        ? null
        : this.appendEntry(
        batch.kind,
        batch.type,
        detail,
        {
          includeSnapshot: false,
          syncSeq: batch.syncSeq,
          causeSeq: batch.causeSeq,
          parentSeq: batch.parentSeq,
          affectedTurnHashes: batch.affectedTurnHashes,
        },
        {
          countStyleWrite: false,
          allowReservedEntry: Boolean(options.allowReservedEntry),
        }
      );

      if (entry) {
        return {
          appended: true,
          entry,
          detail,
        };
      }

      return options.returnDetailIfSkipped || options.returnDetailOnly
        ? {
            appended: false,
            detail,
          }
        : null;
    }

    appendEntry(kind, type, detail, entryState, options = {}) {
      const runtime = this.runtime;
      const { hardLimit, captureLimit } = this.getTraceLimits();
      const allowReservedEntry = Boolean(options.allowReservedEntry);

      if (runtime.entries.length >= hardLimit) {
        return null;
      }

      if (!allowReservedEntry && runtime.entries.length >= captureLimit) {
        return null;
      }

      const includeSnapshot = entryState.includeSnapshot !== false;
      const snapshot = includeSnapshot ? this.buildSnapshot() : null;
      const delta =
        includeSnapshot && snapshot
          ? this.buildSnapshotDelta(runtime.lastSnapshot, snapshot)
          : null;
      const entry = {
        seq: runtime.nextSeq,
        traceSessionId: runtime.traceSessionId,
        at: new Date().toISOString(),
        relMs:
          runtime.baseNow > 0
            ? Math.round((performance.now() - runtime.baseNow) * 100) / 100
            : 0,
        kind,
        type,
        syncSeq: entryState.syncSeq,
        causeSeq: entryState.causeSeq,
        parentSeq: entryState.parentSeq,
        affectedTurnHashes: entryState.affectedTurnHashes,
        detail,
        snapshot,
        delta,
      };

      runtime.nextSeq += 1;
      runtime.entries.push(entry);

      if (snapshot) {
        runtime.lastSnapshot = snapshot;
        runtime.snapshotCount += 1;
      }

      if (kind === "dom-event") {
        runtime.domEventCount += 1;
      } else if (kind === "sync") {
        runtime.syncEventCount += 1;
      } else if (kind === "style" && options.countStyleWrite !== false) {
        runtime.styleWriteCount += 1;
      }

      if (TRACE_KIND_TRIGGER_SET.has(kind)) {
        runtime.lastTriggerSeq = entry.seq;
      }

      runtime.lastKind = kind;
      runtime.lastType = type;
      runtime.lastUpdatedAt = Date.now();
      this.syncDiagnostics();
      return entry;
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
          anchorOffset: Number.isFinite(selection?.anchorOffset)
            ? selection.anchorOffset
            : 0,
          focusOffset: Number.isFinite(selection?.focusOffset)
            ? selection.focusOffset
            : 0,
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
        typeof this.buildRouteSummary === "function"
          ? this.buildRouteSummary(globalThis.location)
          : {},
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
            domId: nextRoot.id || "",
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

      this.ensureTraceSession();

      const includeSnapshot = options.includeSnapshot !== false;
      const runtime = this.runtime;
      let syncSeq = normalizePositiveInteger(options.syncSeq);

      if (!syncSeq && kind === "sync" && type === "start") {
        syncSeq = runtime.nextSyncSeq;
        runtime.nextSyncSeq += 1;
        runtime.activeSyncSeq = syncSeq;
      }

      if (!syncSeq) {
        syncSeq = runtime.activeSyncSeq;
      }

      let causeSeq = normalizePositiveInteger(options.causeSeq);
      let parentSeq = normalizePositiveInteger(options.parentSeq);

      if (!causeSeq && kind === "sync" && type === "start") {
        causeSeq = runtime.lastTriggerSeq;
      }

      if (!parentSeq && runtime.activeSyncEntrySeq && !(kind === "sync" && type === "start")) {
        parentSeq = runtime.activeSyncEntrySeq;
      }

      if (!causeSeq && runtime.activeSyncCauseSeq && !(kind === "sync" && type === "start")) {
        causeSeq = runtime.activeSyncCauseSeq;
      }

      const affectedTurnHashes = normalizeHashList(
        extractAffectedTurnHashes(detail).concat(
          Array.isArray(options.affectedTurnHashes) ? options.affectedTurnHashes : []
        )
      );
      const entryState = {
        includeSnapshot,
        syncSeq,
        causeSeq,
        parentSeq,
        affectedTurnHashes,
      };

      if (kind === "style" && type === "apply-record-styles") {
        this.queueStyleBatch(detail, entryState);
        return null;
      }

      const pendingStyleBatch = this.flushPendingStyleBatch({
        returnDetailIfSkipped: true,
      });

      if (pendingStyleBatch && !pendingStyleBatch.appended) {
        this.handleMaxEntriesReached(kind, type, entryState, pendingStyleBatch.detail);
        return null;
      }

      if (this.runtime.entries.length >= this.getTraceLimits().captureLimit) {
        this.handleMaxEntriesReached(kind, type, entryState);
        return null;
      }

      const entry = this.appendEntry(kind, type, detail, entryState);

      if (!entry) {
        this.handleMaxEntriesReached(kind, type, entryState);
        return null;
      }

      if (kind === "sync" && type === "start") {
        runtime.activeSyncEntrySeq = entry.seq;
        runtime.activeSyncCauseSeq = causeSeq;
      } else if (kind === "sync" && type === "end") {
        runtime.activeSyncSeq = 0;
        runtime.activeSyncEntrySeq = 0;
        runtime.activeSyncCauseSeq = 0;
      }

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
