(() => {
  const app = globalThis.__CSP__;
  const config = app.core.config;
  const logger = app.core.logger;
  const { average, nowLabel } = app.core.utils;
  const {
    createDiagnosticsState,
    createPanelBadgeSnapshot,
    createPanelOverlaySnapshot,
    createTraceStatusSnapshot,
    cloneDiagnosticsSlice,
  } = app.core.diagnosticsState;
  const {
    buildDiagnosticsSnapshotText,
  } = app.core.diagnosticsSnapshot;

  function createDiagnosticsStore() {
    const sliceListeners = new Map();
    const syncSamples = [];
    const state = createDiagnosticsState();
    const defaults = createDiagnosticsState();
    const sliceVersions = Object.create(null);
    const sliceSnapshotCache = Object.create(null);
    const collectionPolicy = {
      metricsEnabled: true,
      sessionEnabled: true,
      traceEnabled: true,
      eventsEnabled: true,
    };
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
          sliceVersions[sliceName] = (sliceVersions[sliceName] || 0) + 1;
          delete sliceSnapshotCache[sliceName];
        }
      }
    }

    function getCachedSliceSnapshot(sliceName) {
      if (!sliceName) {
        return undefined;
      }

      const version = sliceVersions[sliceName] || 0;
      const cachedSnapshot = sliceSnapshotCache[sliceName];

      if (cachedSnapshot && cachedSnapshot.version === version) {
        return cachedSnapshot.snapshot;
      }

      const snapshot = cloneDiagnosticsSlice(state, sliceName);

      if (typeof snapshot === "undefined") {
        return undefined;
      }

      sliceSnapshotCache[sliceName] = {
        version,
        snapshot,
      };

      return snapshot;
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

        const snapshot = getCachedSliceSnapshot(sliceName);

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

    function resetObjectSlice(sliceName) {
      const nextSlice = defaults[sliceName];
      const currentSlice = state[sliceName];

      if (!nextSlice || !currentSlice || typeof nextSlice !== "object") {
        return false;
      }

      return mergeChanged(currentSlice, { ...nextSlice }, sliceName);
    }

    function resetEventsSlice() {
      if (state.events.length === 0) {
        return false;
      }

      state.events = [];
      markDirty("events");
      requestEmit();
      return true;
    }

    function syncPanelBadgeState() {
      return mergeChanged(
        state.panelBadge,
        createPanelBadgeSnapshot(state),
        "panelBadge"
      );
    }

    function syncPanelOverlayState() {
      return mergeChanged(
        state.panelOverlay,
        createPanelOverlaySnapshot(state),
        "panelOverlay"
      );
    }

    function syncTraceStatusState() {
      return mergeChanged(
        state.traceStatus,
        createTraceStatusSnapshot(state),
        "traceStatus"
      );
    }

    function pushEvent(type, detailKey, level = "info", detailParams = {}) {
      if (!collectionPolicy.eventsEnabled) {
        return;
      }

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
        return getCachedSliceSnapshot(sliceName);
      },

      subscribeSlice(sliceName, listener) {
        if (typeof listener !== "function") {
          return () => {};
        }

        const initialSnapshot = getCachedSliceSnapshot(sliceName);

        if (typeof initialSnapshot === "undefined") {
          listener(undefined, sliceName);
          return () => {};
        }

        const listenerSet = getSliceListenerSet(sliceName);
        listenerSet.add(listener);
        listener(initialSnapshot, sliceName);

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
          syncPanelBadgeState();
          markDirty("modeState");
          requestEmit();
        }
      },

      setRuntimeStatus(status) {
        if (state.runtimeStatus === status) {
          return;
        }

        state.runtimeStatus = status;
        syncPanelBadgeState();
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
        if (!collectionPolicy.metricsEnabled) {
          return;
        }

        if (mergeChanged(state.metrics, metrics, "metrics")) {
          syncPanelBadgeState();
        }
      },

      setFallbackState(fallbackState) {
        mergeChanged(state.fallback, fallbackState, "fallback");
      },

      setActivityState(activityState) {
        if (mergeChanged(state.activity, activityState, "activity")) {
          syncPanelOverlayState();
        }
      },

      setSessionState(sessionState) {
        if (!collectionPolicy.sessionEnabled) {
          return;
        }

        mergeChanged(state.session, sessionState, "session");
      },

      setTraceState(traceState) {
        if (!collectionPolicy.traceEnabled) {
          return;
        }

        if (mergeChanged(state.trace, traceState, "trace")) {
          syncTraceStatusState();
        }
      },

      setInitDuration(durationMs) {
        if (!collectionPolicy.metricsEnabled) {
          return;
        }

        if (state.metrics.initDurationMs === durationMs) {
          return;
        }

        state.metrics.initDurationMs = durationMs;
        markDirty("metrics");
        requestEmit();
      },

      recordSync({ durationMs, reason, isResync }) {
        if (!collectionPolicy.metricsEnabled) {
          return;
        }

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
        if (!collectionPolicy.eventsEnabled) {
          return;
        }

        state.fallback.lastError = errorMessage;
        markDirty("fallback");
        pushEvent("error", "events.runtimeError", "error", {
          message: errorMessage,
        });
      },

      setCollectionPolicy(nextPolicy = {}) {
        const normalizedPolicy = {
          metricsEnabled:
            typeof nextPolicy.metricsEnabled === "boolean"
              ? nextPolicy.metricsEnabled
              : collectionPolicy.metricsEnabled,
          sessionEnabled:
            typeof nextPolicy.sessionEnabled === "boolean"
              ? nextPolicy.sessionEnabled
              : collectionPolicy.sessionEnabled,
          traceEnabled:
            typeof nextPolicy.traceEnabled === "boolean"
              ? nextPolicy.traceEnabled
              : collectionPolicy.traceEnabled,
          eventsEnabled:
            typeof nextPolicy.eventsEnabled === "boolean"
              ? nextPolicy.eventsEnabled
              : collectionPolicy.eventsEnabled,
        };

        const previousPolicy = { ...collectionPolicy };
        let changed = false;

        Object.keys(normalizedPolicy).forEach((key) => {
          if (collectionPolicy[key] !== normalizedPolicy[key]) {
            collectionPolicy[key] = normalizedPolicy[key];
            changed = true;
          }
        });

        if (!changed) {
          return false;
        }

        if (previousPolicy.metricsEnabled && !collectionPolicy.metricsEnabled) {
          syncSamples.length = 0;
          if (resetObjectSlice("metrics")) {
            syncPanelBadgeState();
          }
        }

        if (previousPolicy.sessionEnabled && !collectionPolicy.sessionEnabled) {
          resetObjectSlice("session");
        }

        if (previousPolicy.traceEnabled && !collectionPolicy.traceEnabled) {
          if (resetObjectSlice("trace")) {
            syncTraceStatusState();
          }
        }

        if (previousPolicy.eventsEnabled && !collectionPolicy.eventsEnabled) {
          resetEventsSlice();
        }

        return true;
      },

      buildSnapshotText() {
        return buildDiagnosticsSnapshotText(state);
      },
    };
  }

  app.core.createDiagnosticsStore = createDiagnosticsStore;
})();
