(() => {
  const app = globalThis.__CSP__;
  const config = app.core.config;
  const storage = app.core.storage;
  const PANEL_SLICE_NAMES = Object.freeze([
    "panelBadge",
    "panelOverlay",
    "traceStatus",
    "page",
    "capabilities",
    "metrics",
    "fallback",
    "session",
    "trace",
    "events",
  ]);

  function getDefaultTabId() {
    const tabIds = Array.isArray(app.ui.panelTabIds) ? app.ui.panelTabIds : [];

    return tabIds.length > 0 ? tabIds[0] : "overview";
  }

  app.ui.createInitialPanelState = function createInitialPanelState(diagnostics) {
    const initialState = {
      level: config.defaultLevel,
      targetMode: config.defaultLevel,
      effectiveMode: config.defaultLevel,
      availableLevels: [],
      plannedLevels: [],
      modes: [],
      runtimeStatus: "disabled",
      panelBadge: {},
      panelOverlay: {},
      traceStatus: {},
      page: {},
      capabilities: {},
      metrics: {},
      fallback: {},
      session: {},
      trace: {},
      events: [],
    };
    const modeState = diagnostics.getSliceState("modeState");

    if (modeState && typeof modeState === "object") {
      initialState.level = modeState.level || initialState.level;
      initialState.targetMode = modeState.targetMode || initialState.targetMode;
      initialState.effectiveMode = modeState.effectiveMode || initialState.effectiveMode;
      initialState.availableLevels = Array.isArray(modeState.availableLevels)
        ? modeState.availableLevels
        : [];
      initialState.plannedLevels = Array.isArray(modeState.plannedLevels)
        ? modeState.plannedLevels
        : [];
      initialState.modes = Array.isArray(modeState.modes) ? modeState.modes : [];
    }

    initialState.runtimeStatus =
      diagnostics.getSliceState("runtimeStatus") || initialState.runtimeStatus;

    PANEL_SLICE_NAMES.forEach((sliceName) => {
      const sliceState = diagnostics.getSliceState(sliceName);

      if (typeof sliceState !== "undefined") {
        initialState[sliceName] = sliceState;
      }
    });

    return initialState;
  };

  app.ui.readStoredPanelViewState = function readStoredPanelViewState() {
    return {
      isOpen: Boolean(storage.get(config.storageKeys.panelOpen, false)),
      isHidden: Boolean(storage.get(config.storageKeys.panelHidden, false)),
      activeTab: storage.get(config.storageKeys.panelTab, getDefaultTabId()),
      theme: storage.get(config.storageKeys.panelTheme, "light"),
      panelSize: storage.get(config.storageKeys.panelSize, null),
      position: storage.get(config.storageKeys.panelPosition, null),
    };
  };
})();
