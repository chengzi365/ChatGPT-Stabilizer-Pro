(() => {
  const app = globalThis.__CSP__;
  const i18n = app.core.i18n;

  function t(key, params = {}, fallback) {
    return i18n.t(key, params, fallback);
  }

  const LOADING_OVERLAY_STAGE_RANKS = Object.freeze({
    scanPage: 1,
    scanThread: 2,
    collectMessages: 3,
    prepareSync: 4,
  });
  const OPTIMIZING_OVERLAY_STAGE_RANKS = Object.freeze({
    measureContent: 1,
    applyOptimization: 2,
    settleState: 3,
  });
  const OVERLAY_SESSION_IDLE_GRACE_MS = 220;

  function getRecognitionConfidenceRank(confidence) {
    switch (confidence) {
      case "high":
        return 3;
      case "medium":
        return 2;
      case "low":
        return 1;
      default:
        return 0;
    }
  }

  function clampOverlayProgress(value, minimum = 0, maximum = 100) {
    if (!Number.isFinite(value)) {
      return minimum;
    }

    return Math.max(minimum, Math.min(maximum, Math.round(value)));
  }

  function formatOverlayStage(stageId) {
    if (!stageId) {
      return "";
    }

    return t(`panel.overlayStage.${stageId}`, {}, stageId);
  }

  function getLoadingOverlaySnapshot(state) {
    const page = state.page || {};
    const metrics = state.metrics || {};
    const confidenceRank = getRecognitionConfidenceRank(
      page.recognitionConfidence
    );
    const collectedCount = Math.max(
      metrics.registered || 0,
      metrics.observed || 0,
      metrics.messageTotal || 0,
      metrics.unitTotal || 0
    );

    if (!page.isChatPage && !page.activeAdapter && confidenceRank === 0) {
      return {
        stageId: "scanPage",
        progress: 0,
      };
    }

    if (!page.threadReady || !page.activeAdapter) {
      let progress = 14;

      if (page.isChatPage) {
        progress += 8;
      }

      if (page.activeAdapter) {
        progress += 6;
      }

      progress += confidenceRank * 4;

      return {
        stageId: "scanThread",
        progress: clampOverlayProgress(progress, 8, 36),
      };
    }

    if (collectedCount <= 0 || !page.scrollRootReady) {
      let progress = 38;

      if (collectedCount > 0) {
        progress += Math.min(14, Math.round(Math.log2(collectedCount + 1) * 4));
      }

      if (page.scrollRootReady) {
        progress += 8;
      }

      return {
        stageId: "collectMessages",
        progress: clampOverlayProgress(progress, 34, 68),
      };
    }

    let progress = 72;

    if (state.runtimeStatus && state.runtimeStatus !== "disabled") {
      progress += 6;
    }

    if ((metrics.pendingMeasurements || 0) <= 0) {
      progress += 4;
    }

    return {
      stageId: "prepareSync",
      progress: clampOverlayProgress(progress, 68, 92),
    };
  }

  function createOptimizingOverlayBaseline(state) {
    const metrics = state.metrics || {};

    return {
      pendingStart: Math.max(metrics.pendingMeasurements || 0, 0),
      optimizedStart: Math.max(metrics.optimized || 0, 0),
      targetTotal: Math.max(
        metrics.optimizable || 0,
        metrics.unitTotal || 0,
        metrics.observed || 0,
        metrics.registered || 0,
        metrics.optimized || 0
      ),
      queueStart:
        Math.max(metrics.collapseQueueSize || 0, 0) +
        Math.max(metrics.restoreQueueSize || 0, 0),
    };
  }

  function resolveOptimizingOverlaySnapshot(state, session) {
    const metrics = state.metrics || {};
    const baseline =
      session.baseline || (session.baseline = createOptimizingOverlayBaseline(state));
    const optimized = Math.max(metrics.optimized || 0, 0);
    const pendingMeasurements = Math.max(metrics.pendingMeasurements || 0, 0);
    const currentTargetTotal = Math.max(
      metrics.optimizable || 0,
      metrics.unitTotal || 0,
      metrics.observed || 0,
      metrics.registered || 0,
      optimized
    );

    if (currentTargetTotal > 0) {
      baseline.targetTotal = Math.max(baseline.targetTotal || 0, currentTargetTotal);
    }

    if (pendingMeasurements > 0) {
      baseline.pendingStart = Math.max(
        baseline.pendingStart || 0,
        pendingMeasurements
      );
    }

    const currentQueueTotal =
      Math.max(metrics.collapseQueueSize || 0, 0) +
      Math.max(metrics.restoreQueueSize || 0, 0);

    if (currentQueueTotal > 0) {
      baseline.queueStart = Math.max(baseline.queueStart || 0, currentQueueTotal);
    }

    const pendingStart = Math.max(baseline.pendingStart || 0, 0);
    const measureRatio =
      pendingStart > 0
        ? Math.max(0, Math.min(1, 1 - pendingMeasurements / pendingStart))
        : pendingMeasurements <= 0
          ? 1
          : 0;
    const targetTotal = Math.max(baseline.targetTotal || 0, 0);
    const optimizedStart = Math.max(baseline.optimizedStart || 0, 0);
    const optimizeWork = Math.max(targetTotal - optimizedStart, 0);
    const optimizeRatio =
      optimizeWork > 0
        ? Math.max(
            0,
            Math.min(1, (optimized - optimizedStart) / optimizeWork)
          )
        : Math.max(
            0,
            Math.min(1, metrics.coverageRate || (optimized > 0 ? 1 : 0))
          );
    const queueStart = Math.max(baseline.queueStart || 0, 0);
    const settleRatio =
      queueStart > 0
        ? Math.max(0, Math.min(1, 1 - currentQueueTotal / queueStart))
        : pendingMeasurements <= 0 && optimizeRatio >= 0.95
          ? 1
          : 0;

    const weightedProgress = clampOverlayProgress(
      measureRatio * 42 + optimizeRatio * 42 + settleRatio * 14,
      0,
      98
    );

    let stageId = "measureContent";

    if (
      pendingMeasurements > 0 &&
      (measureRatio < 0.9 || optimizeRatio <= 0.35)
    ) {
      stageId = "measureContent";
    } else if (
      (optimizeWork > 0 || targetTotal > 0 || optimized > 0) &&
      optimizeRatio < 0.985
    ) {
      stageId = "applyOptimization";
    } else {
      stageId = "settleState";
    }

    return {
      stageId,
      progress: weightedProgress,
    };
  }

  app.ui.panelOverlayMethods = {
    resetOverlayProgressSession() {
      this.overlayProgressSession = null;
    },

    ensureOverlayProgressSession(state) {
      const session = this.overlayProgressSession;
      const activity = state.activity || {};
      const phase = activity.phase || "";
      const routeKey = state.page?.routeKey || state.page?.path || "";
      const now = performance.now();
      const withinIdleGrace =
        session &&
        session.pendingResetAt > 0 &&
        now - session.pendingResetAt <= OVERLAY_SESSION_IDLE_GRACE_MS;
      const canCarryProgress =
        session &&
        session.routeKey === routeKey &&
        (session.pendingResetAt <= 0 || withinIdleGrace) &&
        session.lastProgress > 0;

      if (
        !session ||
        session.phase !== phase ||
        session.routeKey !== routeKey ||
        (session.pendingResetAt > 0 &&
          now - session.pendingResetAt > OVERLAY_SESSION_IDLE_GRACE_MS)
      ) {
        this.overlayProgressSession = {
          phase,
          routeKey,
          baseline: null,
          lastStageId: "",
          lastProgress: canCarryProgress ? session.lastProgress : 0,
          stageRank: 0,
          pendingResetAt: 0,
        };
      }

      this.overlayProgressSession.pendingResetAt = 0;

      return this.overlayProgressSession;
    },

    commitOverlayProgressSnapshot(session, snapshot, rankMap) {
      const nextRank = rankMap[snapshot.stageId] || 0;
      const previousRank = session.stageRank || 0;
      const progressFloor = session.lastProgress || 0;
      const stageId =
        nextRank < previousRank ? session.lastStageId || snapshot.stageId : snapshot.stageId;
      const stageRank = stageId === snapshot.stageId ? nextRank : previousRank;
      const progress = clampOverlayProgress(
        stageId === snapshot.stageId
          ? Math.max(progressFloor, snapshot.progress)
          : progressFloor
      );

      session.lastStageId = stageId;
      session.stageRank = stageRank;
      session.lastProgress = progress;

      return {
        stageId,
        progress,
      };
    },

    resolveOverlayState(state) {
      const activity = state.activity || {};

      if (!activity.busy) {
        if (this.overlayProgressSession) {
          const now = performance.now();

          if (!this.overlayProgressSession.pendingResetAt) {
            this.overlayProgressSession.pendingResetAt = now;
          } else if (
            now - this.overlayProgressSession.pendingResetAt >
            OVERLAY_SESSION_IDLE_GRACE_MS
          ) {
            this.resetOverlayProgressSession();
          }
        }

        return {
          visible: false,
          phase: "idle",
          title: "",
          body: "",
          meta: "",
          progress: 0,
          progressText: "",
        };
      }

      const session = this.ensureOverlayProgressSession(state);
      if (activity.phase === "loading") {
        const snapshot = this.commitOverlayProgressSnapshot(
          session,
          getLoadingOverlaySnapshot(state),
          LOADING_OVERLAY_STAGE_RANKS
        );

        return {
          visible: true,
          phase: "loading",
          title: t("panel.overlay.loadingTitle", {}, "Page loading"),
          body: t(
            "panel.overlay.loadingBody",
            {},
            "Recognizing the current conversation and preparing panel data."
          ),
          meta: formatOverlayStage(snapshot.stageId),
          progress: snapshot.progress,
          progressText: `${snapshot.progress}%`,
        };
      }

      const snapshot = this.commitOverlayProgressSnapshot(
        session,
        resolveOptimizingOverlaySnapshot(state, session),
        OPTIMIZING_OVERLAY_STAGE_RANKS
      );

      return {
        visible: true,
        phase: "optimizing",
        title: t("panel.overlay.optimizingTitle", {}, "Optimizing"),
        body: t(
          "panel.overlay.optimizingBody",
          {},
          "Measuring, folding, and restoring history in batches. The panel will become interactive again automatically."
        ),
        meta: formatOverlayStage(snapshot.stageId),
        progress: snapshot.progress,
        progressText: `${snapshot.progress}%`,
      };
    },

    renderActivityOverlay(state) {
      if (
        !this.elements.overlay ||
        !this.elements.overlayTitle ||
        !this.elements.overlayBody ||
        !this.elements.overlayMeta ||
        !this.elements.overlayProgressFill ||
        !this.elements.overlayProgressValue
      ) {
        return;
      }

      const overlayState = this.resolveOverlayState(state);

      this.elements.overlay.dataset.active = String(overlayState.visible);
      this.elements.overlay.dataset.phase = overlayState.phase;
      this.elements.overlay.setAttribute(
        "aria-hidden",
        overlayState.visible ? "false" : "true"
      );
      this.setCachedText(
        "overlay-title",
        this.elements.overlayTitle,
        overlayState.title
      );
      this.setCachedText(
        "overlay-body",
        this.elements.overlayBody,
        overlayState.body
      );
      this.setCachedStyle(
        "overlay-progress-width",
        this.elements.overlayProgressFill,
        "width",
        `${overlayState.progress}%`
      );
      this.setCachedText(
        "overlay-progress-value",
        this.elements.overlayProgressValue,
        overlayState.progressText
      );
      this.setCachedText(
        "overlay-meta",
        this.elements.overlayMeta,
        overlayState.meta
      );
    },
  };
})();
