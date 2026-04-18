(() => {
  const app = globalThis.__CSP__;
  const i18n = app.core.i18n;
  const logger = app.core.logger;
  const {
    formatNumber,
    formatPercent,
  } = app.core.utils;

  function t(key, params = {}, fallback) {
    return i18n.t(key, params, fallback);
  }

  app.ui.panelTabIds = ["overview", "mode", "messages", "performance", "events"];

  app.ui.panelRenderMethods = {
    setTraceRecordingChrome(isRecording) {
      const nextValue = String(Boolean(isRecording));
      const elements = [
        this.elements.shell,
        this.elements.panel,
        this.elements.badge,
        this.elements.launcher,
      ];

      elements.forEach((element) => {
        if (element && element.dataset.traceRecording !== nextValue) {
          element.dataset.traceRecording = nextValue;
        }
      });
    },

    shouldRenderSection(sectionName) {
      return !this.hasRendered || this.dirtySections.has(sectionName);
    },

    finishRenderSection(sectionName) {
      this.dirtySections.delete(sectionName);
    },

    setCachedHtml(cacheKey, element, html) {
      if (!element) {
        return;
      }

      if (this.renderCache[cacheKey] === html) {
        return;
      }

      this.renderCache[cacheKey] = html;
      element.innerHTML = html;
    },

    setCachedText(cacheKey, element, text) {
      if (!element) {
        return;
      }

      if (this.renderCache[cacheKey] === text) {
        return;
      }

      this.renderCache[cacheKey] = text;
      element.textContent = text;
    },

    setCachedStyle(cacheKey, element, property, value) {
      if (!element) {
        return;
      }

      const nextValue = String(value);

      if (this.renderCache[cacheKey] === nextValue) {
        return;
      }

      this.renderCache[cacheKey] = nextValue;
      element.style[property] = nextValue;
    },

    renderSafely() {
      try {
        this.render();
        this.hasRendered = true;

        if (!this.isHidden && this.isOpen) {
          this.schedulePositionClamp();
        }
      } catch (error) {
        logger.error(t("logs.panelRenderFailed", {}, "Panel render failed."), error);

        if (this.elements.badgeSummary) {
          this.elements.badgeSummary.textContent = t(
            "panel.renderErrorShort",
            {},
            "Render failed"
          );
        }

        if (this.elements.summary) {
          this.elements.summary.textContent = t(
            "panel.renderErrorDetail",
            {
              error: error instanceof Error ? error.message : String(error),
            },
            "Panel render failed: {error}. Use Resync or reload the extension."
          );
        }
      }
    },

    render() {
      if (!this.host || !this.elements.badge) {
        return;
      }

      if (this.shouldRenderSection("badge")) {
        this.renderBadge();
        this.finishRenderSection("badge");
      }

      if (!this.isHidden && this.isOpen) {
        this.renderPanel();
      }
    },

    renderBadge() {
      if (!this.elements.badgeDot || !this.elements.badgeSummary) {
        return;
      }

      const state = this.state;
      const panelBadge = state.panelBadge || {};
      const metrics = state.metrics || {};
      const nextStatus = panelBadge.runtimeStatus || state.runtimeStatus;
      const traceStatus = state.traceStatus || state.trace || {};
      const traceRecording = Boolean(traceStatus.recording);
      const limitReached = Boolean(
        traceStatus.entryLimitReached && !traceStatus.recording
      );
      const badgeSummaryParams = {
        messages: formatNumber(panelBadge.messageTotal ?? metrics.messageTotal),
        optimized: formatNumber(panelBadge.optimized ?? metrics.optimized),
        coverage: formatPercent(panelBadge.coverageRate ?? metrics.coverageRate),
      };
      const badgeSummaryFull = t(
        "panel.badgeSummary",
        badgeSummaryParams,
        "{messages} messages | Optimized content blocks {optimized} | Optimization rate {coverage}"
      );
      const summaryText = traceRecording
        ? t("panel.trace.activeBadge", {}, "Debug active")
        : limitReached
        ? t("panel.trace.stoppedByLimitBadge", {}, "Debug limit reached")
        : t(
            "panel.badgeSummaryCompact",
            badgeSummaryParams,
            "{messages} msg | {optimized} opt | {coverage}"
          );

      if (this.elements.badgeDot.dataset.status !== nextStatus) {
        this.elements.badgeDot.dataset.status = nextStatus;
      }

      this.setTraceRecordingChrome(traceRecording);
      this.elements.badgeSummary.title = traceRecording
        ? t(
            "panel.trace.activeHint",
            {},
            "Structured debug data is being recorded. Stop debugging before copying or exporting."
          )
        : limitReached
        ? t(
            "panel.trace.stoppedByLimitHint",
            {
              maxEntries: formatNumber(traceStatus.entryLimit || 0),
            },
            "The debug log reached the {maxEntries} entry limit. Earliest entries were preserved and the log is ready to export."
          )
        : badgeSummaryFull;
      this.setCachedText("badge-summary", this.elements.badgeSummary, summaryText);
    },
  };
})();
