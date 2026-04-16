(() => {
  const app = globalThis.__CSP__;
  const config = app.core.config;

  app.dom.layoutWatcherControllerMethods = {
    installLayoutWatchers() {
      const measurementState = this.state.measurement;

      if (measurementState.layoutWatchersInstalled) {
        return;
      }

      measurementState.layoutWatchersInstalled = true;

      globalThis.addEventListener(
        "resize",
        () => {
          this.scheduleRuntimeProfileRefresh("viewport-resize");
          this.scheduleGlobalLayoutChange("viewport-resize");
        },
        { passive: true }
      );

      globalThis.addEventListener(
        "orientationchange",
        () => {
          this.scheduleRuntimeProfileRefresh("orientationchange");
        },
        { passive: true }
      );

      if (
        document.fonts &&
        typeof document.fonts.addEventListener === "function"
      ) {
        document.fonts.addEventListener("loadingdone", () => {
          this.scheduleGlobalLayoutChange("font-metrics");
        });
      }

      document.addEventListener(
        "load",
        (event) => {
          this.handlePotentialMediaLoad(event);
        },
        true
      );
    },

    clearPendingGlobalLayoutChange() {
      const measurementState = this.state.measurement;

      if (measurementState.pendingGlobalLayoutChangeTimer) {
        globalThis.clearTimeout(measurementState.pendingGlobalLayoutChangeTimer);
      }

      measurementState.pendingGlobalLayoutChangeTimer = null;
      measurementState.pendingGlobalLayoutChangeSources.clear();
    },

    scheduleGlobalLayoutChange(source) {
      const runtimeState = this.state.runtime;
      const pageState = this.state.page;
      const measurementState = this.state.measurement;

      if (runtimeState.level === "off" || !pageState.chatRoot) {
        return;
      }

      measurementState.pendingGlobalLayoutChangeSources.add(
        source || "layout-change"
      );

      if (measurementState.pendingGlobalLayoutChangeTimer) {
        globalThis.clearTimeout(measurementState.pendingGlobalLayoutChangeTimer);
      }

      measurementState.pendingGlobalLayoutChangeTimer = globalThis.setTimeout(() => {
        const sources = Array.from(measurementState.pendingGlobalLayoutChangeSources);

        measurementState.pendingGlobalLayoutChangeTimer = null;
        measurementState.pendingGlobalLayoutChangeSources.clear();
        this.handleGlobalLayoutChange(sources);
      }, Math.max(16, config.sync.layoutChangeSettleMs || 120));
    },

    resolveGlobalLayoutReason(sources) {
      const normalizedSources = Array.isArray(sources)
        ? sources.filter(Boolean)
        : [sources].filter(Boolean);

      if (normalizedSources.includes("font-metrics")) {
        return "font-metrics";
      }

      if (normalizedSources.includes("viewport-resize")) {
        return "viewport-resize";
      }

      return normalizedSources[0] || "layout-change";
    },

    handleGlobalLayoutChange(source) {
      const runtimeState = this.state.runtime;
      const pageState = this.state.page;
      const measurementState = this.state.measurement;

      if (runtimeState.level === "off" || !pageState.chatRoot) {
        return;
      }

      const reason = this.resolveGlobalLayoutReason(source);
      const records =
        this.resolveOrderedBaseWorksetRecords(
          measurementState.baseRefreshActiveIds
        ) || this.registry.getOrderedRecords();
      let touched = 0;

      for (let index = 0; index < records.length; index += 1) {
        const record = records[index];

        this.markRecordLayoutDirty(record, reason);
        touched += 1;
      }

      if (touched > 0) {
        this.scheduleSync("dom-content", false);
      }
    },

    handlePotentialMediaLoad(event) {
      const runtimeState = this.state.runtime;
      const pageState = this.state.page;

      if (runtimeState.level === "off" || !pageState.chatRoot) {
        return;
      }

      const target =
        event.target instanceof Element ? event.target : event.target?.parentElement;

      if (!(target instanceof Element)) {
        return;
      }

      const mediaTarget = target.closest("img, video, canvas, svg");

      if (!(mediaTarget instanceof Element)) {
        return;
      }

      const record = this.findRecordFromTarget(mediaTarget);

      if (!record) {
        return;
      }

      this.markRecordLayoutDirty(record, "media-load");
      this.scheduleLowPrioritySync("dom-content");
    },
  };
})();
