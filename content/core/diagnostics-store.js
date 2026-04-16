(() => {
  const app = globalThis.__CSP__;
  const config = app.core.config;
  const logger = app.core.logger;
  const { average, nowLabel } = app.core.utils;
  const {
    createDiagnosticsState,
    cloneDiagnosticsSlice,
  } = app.core.diagnosticsState;
  const {
    buildDiagnosticsSnapshotText,
  } = app.core.diagnosticsSnapshot;

  function createDiagnosticsStore() {
    const sliceListeners = new Map();
    const syncSamples = [];
    const state = createDiagnosticsState();
    const scheduleMicrotask =
      typeof globalThis.queueMicrotask === "function"
        ? globalThis.queueMicrotask.bind(globalThis)
        : (callback) => Promise.resolve().then(callback);
    let emitScheduled = false;
    let emitDirty = false;
    let dirtySlices = new Set();

    function hasSliceListeners() {
      for (const listenerSet of sliceListeners.values()) {
        if (listenerSet.size > 0) {
          return true;
        }
      }

      return false;
    }

    function getSliceListenerSet(sliceName) {
      let listenerSet = sliceListeners.get(sliceName);

      if (!listenerSet) {
        listenerSet = new Set();
        sliceListeners.set(sliceName, listenerSet);
      }

      return listenerSet;
    }

    function markDirty(sliceNames) {
      const names = Array.isArray(sliceNames) ? sliceNames : [sliceNames];

      for (let index = 0; index < names.length; index += 1) {
        const sliceName = names[index];

        if (sliceName) {
          dirtySlices.add(sliceName);
        }
      }
    }

    function flushEmit() {
      emitScheduled = false;

      if (!emitDirty) {
        return;
      }

      if (!hasSliceListeners()) {
        emitDirty = false;
        dirtySlices.clear();
        return;
      }

      emitDirty = false;
      const slicesToEmit = Array.from(dirtySlices);
      dirtySlices = new Set();

      for (let index = 0; index < slicesToEmit.length; index += 1) {
        const sliceName = slicesToEmit[index];
        const listenerSet = sliceListeners.get(sliceName);

        if (!listenerSet || listenerSet.size === 0) {
          continue;
        }

        const snapshot = cloneDiagnosticsSlice(state, sliceName);

        listenerSet.forEach((listener) => {
          try {
            listener(snapshot, sliceName);
          } catch (error) {
            logger.error("Diagnostics slice listener failed.", error);
          }
        });
      }
    }

    function requestEmit() {
      emitDirty = true;

      if (!hasSliceListeners()) {
        emitDirty = false;
        dirtySlices.clear();
        return;
      }

      if (emitScheduled) {
        return;
      }

      emitScheduled = true;
      scheduleMicrotask(flushEmit);
    }

    function mergeChanged(target, updates, dirtySliceNames) {
      let changed = false;

      Object.keys(updates).forEach((key) => {
        if (target[key] !== updates[key]) {
          target[key] = updates[key];
          changed = true;
        }
      });

      if (changed) {
        markDirty(dirtySliceNames);
        requestEmit();
      }

      return changed;
    }

    function pushEvent(type, detailKey, level = "info", detailParams = {}) {
      state.events.unshift({
        time: nowLabel(),
        type,
        detailKey,
        detailParams,
        level,
      });
      state.events = state.events.slice(0, config.diagnostics.maxEvents);
      markDirty("events");
      requestEmit();
    }

    return {
      getSliceState(sliceName) {
        return cloneDiagnosticsSlice(state, sliceName);
      },

      subscribeSlice(sliceName, listener) {
        if (typeof listener !== "function") {
          return () => {};
        }

        if (typeof cloneDiagnosticsSlice(state, sliceName) === "undefined") {
          listener(undefined, sliceName);
          return () => {};
        }

        const listenerSet = getSliceListenerSet(sliceName);
        listenerSet.add(listener);
        listener(cloneDiagnosticsSlice(state, sliceName), sliceName);

        return () => {
          listenerSet.delete(listener);

          if (listenerSet.size === 0) {
            sliceListeners.delete(sliceName);
          }
        };
      },

      setModeState(modeState) {
        let changed = false;

        if (
          typeof modeState.targetMode === "string" &&
          state.targetMode !== modeState.targetMode
        ) {
          state.targetMode = modeState.targetMode;
          changed = true;
        }

        if (
          typeof modeState.effectiveMode === "string" &&
          state.effectiveMode !== modeState.effectiveMode
        ) {
          state.effectiveMode = modeState.effectiveMode;
          changed = true;
        }

        if (
          typeof modeState.level === "string" &&
          state.level !== modeState.level
        ) {
          state.level = modeState.level;
          changed = true;
        }

        if (changed) {
          markDirty("modeState");
          requestEmit();
        }
      },

      setRuntimeStatus(status) {
        if (state.runtimeStatus === status) {
          return;
        }

        state.runtimeStatus = status;
        markDirty("runtimeStatus");
        requestEmit();
      },

      setCapabilities(capabilities) {
        mergeChanged(state.capabilities, capabilities, "capabilities");
      },

      setPageState(pageState) {
        mergeChanged(state.page, pageState, "page");
      },

      setMetrics(metrics) {
        mergeChanged(state.metrics, metrics, "metrics");
      },

      setFallbackState(fallbackState) {
        mergeChanged(state.fallback, fallbackState, "fallback");
      },

      setActivityState(activityState) {
        mergeChanged(state.activity, activityState, "activity");
      },

      setSessionState(sessionState) {
        mergeChanged(state.session, sessionState, "session");
      },

      setTraceState(traceState) {
        mergeChanged(state.trace, traceState, "trace");
      },

      setInitDuration(durationMs) {
        if (state.metrics.initDurationMs === durationMs) {
          return;
        }

        state.metrics.initDurationMs = durationMs;
        markDirty("metrics");
        requestEmit();
      },

      recordSync({ durationMs, reason, isResync }) {
        syncSamples.push(durationMs);

        while (syncSamples.length > config.diagnostics.maxSyncSamples) {
          syncSamples.shift();
        }

        state.metrics.lastSyncDurationMs = durationMs;
        state.metrics.avgSyncDurationMs = average(syncSamples);
        state.page.lastSyncReason = reason;

        if (isResync) {
          state.metrics.lastResyncDurationMs = durationMs;
          state.metrics.resyncCount += 1;
        }

        markDirty(["metrics", "page"]);
        requestEmit();
      },

      pushEvent,

      recordError(errorMessage) {
        state.fallback.lastError = errorMessage;
        markDirty("fallback");
        pushEvent("error", "events.runtimeError", "error", {
          message: errorMessage,
        });
      },

      buildSnapshotText() {
        return buildDiagnosticsSnapshotText(state);
      },
    };
  }

  app.core.createDiagnosticsStore = createDiagnosticsStore;
})();
