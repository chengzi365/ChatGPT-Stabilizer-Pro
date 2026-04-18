(() => {
  const app = globalThis.__CSP__;

  const config = {
    storageKeys: {
      level: "csp.level",
      panelOpen: "csp.panelOpen",
      panelHidden: "csp.panelHidden",
      panelPosition: "csp.panelPosition",
      panelSize: "csp.panelSize",
      panelTab: "csp.panelTab",
      panelTheme: "csp.panelTheme",
      traceRecording: "csp.traceRecording",
    },

    panel: {
      hostId: "csp-control-panel-host",
      zIndex: 2147483646,
      refreshIntervalMs: 350,
      collapsedRefreshIntervalMs: 500,
      viewportMargin: 12,
      defaultTop: 16,
      defaultWidth: 392,
      defaultHeight: 520,
      defaultBadgeWidth: 196,
      defaultBadgeHeight: 48,
      defaultLauncherSize: 44,
      minWidth: 320,
      maxWidth: 560,
      minHeight: 360,
      maxHeight: 860,
      shellGap: 10,
      dragThresholdPx: 4,
    },

    sync: {
      measurementBatchSize: 20,
      resyncMeasurementBatchSize: 56,
      layoutChangeSettleMs: 120,
    },

    runtimeProfiles: {
      defaultBucket: "balanced",
      resizeSettleMs: 240,
      deviceTier: {
        lowMaxHardwareConcurrency: 4,
        lowMaxDeviceMemory: 4,
        highMinHardwareConcurrency: 8,
        highMinDeviceMemory: 8,
      },
      compact: {
        enterMaxWidth: 1080,
        enterMaxHeight: 740,
        exitMinWidth: 1200,
        exitMinHeight: 860,
      },
      wide: {
        enterMinWidth: 1640,
        enterMinHeight: 1220,
        exitMaxWidth: 1480,
        exitMaxHeight: 1080,
        allowLowDeviceTier: false,
      },
      buckets: {
        compact: {
          levelOverrides: {
            standard: {
              minimumUnits: 8,
              keepAliveCount: 2,
              nearViewportMargin: 120,
            },
            performance: {
              minimumUnits: 7,
              keepAliveCount: 1,
              nearViewportMargin: 88,
            },
            extreme: {
              minimumUnits: 5,
              keepAliveCount: 1,
              nearViewportMargin: 64,
            },
          },
          syncOverrides: {
            measurementBatchSize: 16,
            resyncMeasurementBatchSize: 44,
          },
        },
        balanced: {
          levelOverrides: {},
          syncOverrides: {},
        },
        wide: {
          levelOverrides: {
            standard: {
              minimumUnits: 12,
              keepAliveCount: 4,
              nearViewportMargin: 176,
            },
            performance: {
              minimumUnits: 9,
              keepAliveCount: 2,
              nearViewportMargin: 120,
            },
            extreme: {
              minimumUnits: 7,
              keepAliveCount: 2,
              nearViewportMargin: 88,
            },
          },
          syncOverrides: {
            measurementBatchSize: 24,
            resyncMeasurementBatchSize: 68,
          },
        },
      },
    },

    diagnostics: {
      maxEvents: 10,
      maxSyncSamples: 20,
      slowSyncThresholdMs: 32,
    },

    trace: {
      maxEntries: 5000,
      stopReserveEntries: 2,
      tailTurnCount: 10,
      maxMutationSamples: 12,
      maxTurnDiffIds: 24,
      maxStyleBatchSamples: 12,
    },

    protection: {
      interactionProtectMs: 1800,
      streamingGraceMs: 1800,
    },

    selectors: {
      content: [".markdown"],
      message: ["[data-message-author-role]", "article"],
      composer: [
        "form textarea",
        "form div[contenteditable='true']",
        "form [data-lexical-editor='true']",
      ],
      turn: [
        "section[data-testid^='conversation-turn-']",
        "section[data-turn-id]",
      ],
      turnEditor: [
        "textarea",
        "[data-writing-block]",
        "[contenteditable='true']",
        "[contenteditable='']",
      ],
      adapters: [
        {
          id: "chatgpt-primary",
          contentSelectors: [".markdown"],
          messageSelectors: ["[data-message-author-role]", "article"],
          composerSelectors: [
            "form textarea",
            "form div[contenteditable='true']",
            "form [data-lexical-editor='true']",
          ],
          turnSelectors: [
            "section[data-testid^='conversation-turn-']",
            "section[data-turn-id]",
          ],
          turnEditorSelectors: [
            "textarea",
            "[data-writing-block]",
            "[contenteditable='true']",
            "[contenteditable='']",
          ],
        },
        {
          id: "chatgpt-article-fallback",
          contentSelectors: [
            "[data-message-author-role] .markdown",
            "article .markdown",
            "article [class*='markdown']",
          ],
          messageSelectors: ["[data-message-author-role]", "article"],
          composerSelectors: [
            "form textarea",
            "form div[contenteditable='true']",
            "form [data-lexical-editor='true']",
          ],
          turnSelectors: [
            "section[data-testid^='conversation-turn-']",
            "section[data-turn-id]",
          ],
          turnEditorSelectors: [
            "textarea",
            "[data-writing-block]",
            "[contenteditable='true']",
            "[contenteditable='']",
          ],
        },
      ],
    },

    levels: {
      off: {
        enableObservers: false,
        enableOptimization: false,
        enableFullCollapse: false,
        minimumUnits: 0,
        keepAliveCount: 0,
        nearViewportMargin: 0,
        minimumContentHeight: 0,
      },

      monitor: {
        enableObservers: true,
        enableOptimization: false,
        enableFullCollapse: false,
        minimumUnits: 0,
        keepAliveCount: 0,
        nearViewportMargin: 220,
        minimumContentHeight: 0,
      },

      standard: {
        enableObservers: true,
        enableOptimization: true,
        enableFullCollapse: false,
        minimumUnits: 10,
        keepAliveCount: 3,
        nearViewportMargin: 140,
        minimumContentHeight: 96,
      },

      performance: {
        enableObservers: true,
        enableOptimization: true,
        enableFullCollapse: true,
        minimumUnits: 8,
        keepAliveCount: 2,
        nearViewportMargin: 96,
        minimumContentHeight: 72,
      },

      extreme: {
        enableObservers: true,
        enableOptimization: true,
        enableFullCollapse: true,
        minimumUnits: 6,
        keepAliveCount: 1,
        nearViewportMargin: 72,
        minimumContentHeight: 64,
      },
    },

    defaultLevel: "standard",
  };

  app.core.config = config;
})();
