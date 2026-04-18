(() => {
  const app = globalThis.__CSP__;
  const i18n = app.core.i18n;

  function t(key, params = {}, fallback) {
    return i18n.t(key, params, fallback);
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

  app.ui.panelOverlayMethods = {
    resetOverlayProgressSession() {
      this.overlayProgressSession = null;
    },

    ensureOverlayProgressSession(state) {
      const session = this.overlayProgressSession;
      const overlay = state.panelOverlay || {};
      const jobId = overlay.overlayJobId || "";

      if (
        !session ||
        session.jobId !== jobId
      ) {
        this.overlayProgressSession = {
          jobId,
          lastStageId: "",
          lastProgress: 0,
          stageRank: 0,
        };
      }

      return this.overlayProgressSession;
    },

    commitOverlayProgressSnapshot(session, snapshot) {
      const nextRank = snapshot.stageId === "settleState" ? 2 : 1;
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
      const overlay = state.panelOverlay || {};

      if (!overlay.overlayVisible || overlay.overlayKind !== "optimizing") {
        this.resetOverlayProgressSession();
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
      const snapshot = this.commitOverlayProgressSnapshot(
        session,
        {
          stageId: overlay.overlayStage || "applyOptimization",
          progress: clampOverlayProgress(overlay.overlayProgress, 0, 100),
        }
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
