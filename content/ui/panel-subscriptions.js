(() => {
  const app = globalThis.__CSP__;
  const config = app.core.config;
  const TAB_IDS = app.ui.panelTabIds;
  const PANEL_SECTION_IDS = [
    "badge",
    "summary",
    "stats",
    "tabs",
    "actions",
    "overlay",
    "runtime",
    "impact",
    "modes",
    "messageSummary",
    "messages",
    "performance",
    "fallback",
    "trace",
    "events",
  ];
  const SLICE_SECTION_MAP = Object.freeze({
    runtimeStatus: ["badge", "summary", "overlay", "runtime"],
    modeState: ["summary", "runtime", "modes", "actions", "performance"],
    page: ["overlay", "runtime"],
    capabilities: ["fallback"],
    metrics: [
      "badge",
      "summary",
      "stats",
      "overlay",
      "messageSummary",
      "messages",
      "impact",
      "performance",
      "fallback",
    ],
    fallback: ["fallback"],
    activity: ["overlay"],
    session: ["runtime", "fallback"],
    trace: ["trace"],
    events: ["events"],
  });
  const scheduleMicrotask =
    typeof globalThis.queueMicrotask === "function"
      ? globalThis.queueMicrotask.bind(globalThis)
      : (callback) => Promise.resolve().then(callback);
  const scheduleFrameRender =
    typeof globalThis.requestAnimationFrame === "function"
      ? globalThis.requestAnimationFrame.bind(globalThis)
      : (callback) => globalThis.setTimeout(() => callback(Date.now()), 16);
  const cancelFrameRender =
    typeof globalThis.cancelAnimationFrame === "function"
      ? globalThis.cancelAnimationFrame.bind(globalThis)
      : globalThis.clearTimeout.bind(globalThis);
  const FALLBACK_RENDER_SLICE_NAMES = new Set(["trace", "events"]);

  app.ui.panelSectionIds = Object.freeze([...PANEL_SECTION_IDS]);

  app.ui.panelSubscriptionMethods = {
    applyDiagnosticsSliceState(sliceName, sliceState) {
      if (sliceName === "modeState" && sliceState && typeof sliceState === "object") {
        this.state.level = sliceState.level;
        this.state.targetMode = sliceState.targetMode;
        this.state.effectiveMode = sliceState.effectiveMode;
        this.state.availableLevels = Array.isArray(sliceState.availableLevels)
          ? sliceState.availableLevels
          : [];
        this.state.plannedLevels = Array.isArray(sliceState.plannedLevels)
          ? sliceState.plannedLevels
          : [];
        this.state.modes = Array.isArray(sliceState.modes) ? sliceState.modes : [];
        return;
      }

      if (sliceName === "runtimeStatus") {
        this.state.runtimeStatus =
          typeof sliceState === "string" ? sliceState : "disabled";
        return;
      }

      if (sliceName === "events") {
        this.state.events = Array.isArray(sliceState) ? sliceState : [];
        return;
      }

      if (sliceState && typeof sliceState === "object" && sliceName in this.state) {
        this.state[sliceName] = sliceState;
      }
    },

    markDirtySections(sectionNames) {
      const names = Array.isArray(sectionNames) ? sectionNames : [sectionNames];

      for (let index = 0; index < names.length; index += 1) {
        const sectionName = names[index];

        if (sectionName) {
          this.dirtySections.add(sectionName);
        }
      }
    },

    markAllSectionsDirty() {
      this.markDirtySections(PANEL_SECTION_IDS);
    },

    markDirtyForDiagnosticsSlice(sliceName) {
      this.markDirtySections(SLICE_SECTION_MAP[sliceName] || []);
    },

    queueImmediateRender() {
      if (this.isHidden || this.immediateRenderScheduled) {
        return;
      }

      this.immediateRenderScheduled = true;
      scheduleMicrotask(() => {
        this.immediateRenderScheduled = false;

        if (this.isHidden) {
          return;
        }

        this.clearScheduledRender();
        this.renderSafely();
      });
    },

    queueFrameRender() {
      if (
        this.isHidden ||
        this.immediateRenderScheduled ||
        this.frameRenderHandle !== null
      ) {
        return;
      }

      this.clearRenderTimer();
      this.frameRenderHandle = scheduleFrameRender(() => {
        this.frameRenderHandle = null;

        if (this.isHidden) {
          return;
        }

        this.renderSafely();
      });
    },

    shouldUseFallbackRenderTimer(sliceName) {
      return (
        this.isOpen &&
        this.activeTab === "events" &&
        FALLBACK_RENDER_SLICE_NAMES.has(sliceName)
      );
    },

    handleDiagnosticsSlice(sliceName, sliceState) {
      this.applyDiagnosticsSliceState(sliceName, sliceState);
      this.markDirtyForDiagnosticsSlice(sliceName);

      if (this.isHidden) {
        this.clearScheduledRender();
        return;
      }

      if (this.isSyncingDiagnosticsSubscriptions) {
        return;
      }

      if (sliceName === "activity" || sliceName === "runtimeStatus") {
        this.queueImmediateRender();
        return;
      }

      if (this.shouldUseFallbackRenderTimer(sliceName)) {
        this.scheduleRenderFallback();
        return;
      }

      this.queueFrameRender();
    },

    getDesiredDiagnosticsSlices() {
      if (this.isHidden) {
        return [];
      }

      const slices = new Set(["runtimeStatus", "metrics"]);

      if (!this.isOpen) {
        return Array.from(slices);
      }

      slices.add("modeState");
      slices.add("activity");

      if (this.activeTab === "overview") {
        slices.add("page");
        slices.add("session");
      } else if (this.activeTab === "performance") {
        slices.add("capabilities");
        slices.add("fallback");
        slices.add("session");
      } else if (this.activeTab === "events") {
        slices.add("trace");
        slices.add("events");
      }

      return Array.from(slices);
    },

    syncDiagnosticsSubscription() {
      const desiredSlices = new Set(this.getDesiredDiagnosticsSlices());
      const currentSlices = Array.from(this.diagnosticsSliceUnsubscribes.keys());
      let changed = false;

      this.isSyncingDiagnosticsSubscriptions = true;

      try {
        for (let index = 0; index < currentSlices.length; index += 1) {
          const sliceName = currentSlices[index];

          if (!desiredSlices.has(sliceName)) {
            const unsubscribe = this.diagnosticsSliceUnsubscribes.get(sliceName);

            if (typeof unsubscribe === "function") {
              unsubscribe();
            }

            this.diagnosticsSliceUnsubscribes.delete(sliceName);
            changed = true;
          }
        }

        desiredSlices.forEach((sliceName) => {
          if (this.diagnosticsSliceUnsubscribes.has(sliceName)) {
            return;
          }

          const unsubscribe = this.diagnostics.subscribeSlice(
            sliceName,
            (sliceState, receivedSliceName) => {
              this.handleDiagnosticsSlice(receivedSliceName, sliceState);
            }
          );

          this.diagnosticsSliceUnsubscribes.set(sliceName, unsubscribe);
          changed = true;
        });
      } finally {
        this.isSyncingDiagnosticsSubscriptions = false;
      }

      if (this.isHidden) {
        this.clearScheduledRender();
      }

      return changed;
    },

    clearRenderTimer() {
      if (!this.renderTimer) {
        return;
      }

      globalThis.clearTimeout(this.renderTimer);
      this.renderTimer = null;
    },

    clearFrameRender() {
      if (this.frameRenderHandle === null) {
        return;
      }

      cancelFrameRender(this.frameRenderHandle);
      this.frameRenderHandle = null;
    },

    clearScheduledRender() {
      this.clearRenderTimer();
      this.clearFrameRender();
    },

    scheduleRenderFallback() {
      if (this.isHidden) {
        return;
      }

      if (
        this.renderTimer ||
        this.immediateRenderScheduled ||
        this.frameRenderHandle !== null
      ) {
        return;
      }

      const delay = this.isOpen
        ? config.panel.refreshIntervalMs
        : config.panel.collapsedRefreshIntervalMs;

      this.renderTimer = globalThis.setTimeout(() => {
        this.renderTimer = null;
        this.renderSafely();
      }, delay);
    },
  };
})();
