(() => {
  const app = globalThis.__CSP__;
  const i18n = app.core.i18n;
  const {
    formatDuration,
    formatNumber,
    formatPercent,
    formatPixels,
    escapeHtml,
  } = app.core.utils;
  const {
    formatEnabled,
    formatFallbackState,
    formatLockState,
    formatMode,
    formatModeDescription,
    formatModeLabel,
    formatModeRisk,
    formatReason,
    formatRecognitionConfidence,
    formatRuntimeAdapter,
    formatRuntimeProfile,
    formatSessionReason,
    formatStatus,
    formatYesNo,
    formatReady,
    formatDeviceTier,
  } = app.core.runtimeFormatters;

  function t(key, params = {}, fallback) {
    return i18n.t(key, params, fallback);
  }

  function formatBenefit(level) {
    return t(`benefitLevels.${level}`, {}, level);
  }

  function formatEventType(type) {
    return t(`eventTypes.${type}`, {}, type);
  }

  function findModeButton(container, modeId) {
    if (!container || !modeId) {
      return null;
    }

    const buttons = container.querySelectorAll(".mode-btn");

    for (let index = 0; index < buttons.length; index += 1) {
      const button = buttons[index];

      if (button.dataset.level === modeId) {
        return button;
      }
    }

    return null;
  }

  function formatTraceLastEntry(trace = {}) {
    const kind = t(`panel.traceKind.${trace.lastKind || ""}`, {}, "");
    const type = t(`panel.traceType.${trace.lastType || ""}`, {}, "");

    if (kind && type) {
      return `${kind} · ${type}`;
    }

    if (kind) {
      return kind;
    }

    if (type) {
      return type;
    }

    if (trace.lastKind || trace.lastType) {
      return t("panel.trace.recorded", {}, "已记录");
    }

    return t("common.none");
  }

  function formatTimestamp(timestamp) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      return t("common.none");
    }

    return new Date(timestamp).toLocaleTimeString([], {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function getModeSnapshot(state, modeId) {
    return (state.modes || []).find((mode) => mode.id === modeId) || null;
  }

  app.ui.panelSectionRenderMethods = {
    scheduleSelectedModeIntoView(modeId) {
      if (this.activeTab !== "mode" || !this.elements.modeGrid || !modeId) {
        return;
      }

      const targetChanged = this.lastAutoScrolledModeId !== modeId;

      if (!this.pendingModeAutoScroll && !targetChanged) {
        return;
      }

      if (this.modeScrollFrame) {
        globalThis.cancelAnimationFrame(this.modeScrollFrame);
      }

      this.modeScrollFrame = globalThis.requestAnimationFrame(() => {
        this.modeScrollFrame = 0;
        const button = findModeButton(this.elements.modeGrid, modeId);

        if (!button) {
          this.pendingModeAutoScroll = false;
          return;
        }

        button.scrollIntoView({
          block: "nearest",
          inline: "nearest",
        });
        this.pendingModeAutoScroll = false;
        this.lastAutoScrolledModeId = modeId;
      });
    },

    renderPanel() {
      if (
        !this.elements.summary ||
        !this.elements.statsGrid ||
        !this.elements.tabStrip ||
        !this.elements.modeGrid
      ) {
        return;
      }

      const state = this.state;
      const metrics = state.metrics;
      const session = state.session || {};

      if (this.shouldRenderSection("summary")) {
        this.renderSummary(state, metrics);
        this.finishRenderSection("summary");
      }

      if (this.shouldRenderSection("stats")) {
        this.renderStats(metrics);
        this.finishRenderSection("stats");
      }

      if (this.shouldRenderSection("tabs")) {
        this.renderTabs();
        this.finishRenderSection("tabs");
      }

      if (this.shouldRenderSection("actions")) {
        this.renderActionState(state);
        this.finishRenderSection("actions");
      }

      if (this.shouldRenderSection("overlay")) {
        this.renderActivityOverlay(state);
        this.finishRenderSection("overlay");
      }

      const performanceRows = [
        [t("panel.performance.init"), formatDuration(metrics.initDurationMs)],
        [t("panel.performance.lastSync"), formatDuration(metrics.lastSyncDurationMs)],
        [t("panel.performance.avgSync"), formatDuration(metrics.avgSyncDurationMs)],
        [t("panel.performance.lastResync"), formatDuration(metrics.lastResyncDurationMs)],
        [t("panel.performance.resyncCount"), formatNumber(metrics.resyncCount)],
      ];

      if (state.effectiveMode === "performance") {
        performanceRows.push(
          [
            t("panel.performance.collapsedCount", {}, "Collapsed"),
            formatNumber(metrics.collapsedCount || 0),
          ],
          [
            t("panel.performance.collapseQueueSize", {}, "Collapse queue"),
            formatNumber(metrics.collapseQueueSize || 0),
          ],
          [
            t("panel.performance.restoreQueueSize", {}, "Restore queue"),
            formatNumber(metrics.restoreQueueSize || 0),
          ],
          [
            t("panel.performance.stateTransitionCount", {}, "State transitions"),
            formatNumber(metrics.stateTransitionCount || 0),
          ],
          [
            t(
              "panel.performance.selfMutationSuppressedCount",
              {},
              "Self-mutation suppressed"
            ),
            formatNumber(metrics.selfMutationSuppressedCount || 0),
          ],
          [
            t("panel.performance.anchorCorrectionCount", {}, "Anchor corrections"),
            formatNumber(metrics.anchorCorrectionCount || 0),
          ],
          [
            t(
              "panel.performance.anchorCorrectionFailureCount",
              {},
              "Anchor correction failures"
            ),
            formatNumber(metrics.anchorCorrectionFailureCount || 0),
          ],
          [
            t(
              "panel.performance.sessionCollapseBlockedCount",
              {},
              "Session-blocked messages"
            ),
            formatNumber(metrics.sessionCollapseBlockedCount || 0),
          ],
          [
            t("panel.performance.localFreezeZoneCount", {}, "Local freeze zones"),
            formatNumber(metrics.localFreezeZoneCount || 0),
          ],
          [
            t("panel.performance.benefitRejectedCount", {}, "Benefit rejected"),
            formatNumber(metrics.benefitRejectedCount || 0),
          ],
          [
            t("panel.performance.performanceFarCount", {}, "Far records"),
            formatNumber(metrics.performanceFarCount || 0),
          ],
          [
            t(
              "panel.performance.performanceBenefitEligibleCount",
              {},
              "Fold-eligible far records"
            ),
            formatNumber(metrics.performanceBenefitEligibleCount || 0),
          ],
          [
            t(
              "panel.performance.performanceCollapsePendingCount",
              {},
              "Collapse pending"
            ),
            formatNumber(metrics.performanceCollapsePendingCount || 0),
          ],
          [
            t(
              "panel.performance.performanceCollapsedStableCount",
              {},
              "Collapsed stable"
            ),
            formatNumber(metrics.performanceCollapsedStableCount || 0),
          ],
          [
            t(
              "panel.performance.performanceBlockedByBenefitCount",
              {},
              "Blocked by benefit"
            ),
            formatNumber(metrics.performanceBlockedByBenefitCount || 0),
          ],
          [
            t(
              "panel.performance.performanceBlockedByWriteWindowCount",
              {},
              "Blocked by write window"
            ),
            formatNumber(metrics.performanceBlockedByWriteWindowCount || 0),
          ],
          [
            t(
              "panel.performance.performanceBlockedByBudgetCount",
              {},
              "Blocked by budget"
            ),
            formatNumber(metrics.performanceBlockedByBudgetCount || 0),
          ],
          [
            t(
              "panel.performance.performanceBlockedByDwellCount",
              {},
              "Blocked by dwell"
            ),
            formatNumber(metrics.performanceBlockedByDwellCount || 0),
          ],
          [
            t(
              "panel.performance.performanceExpandedByProtectionCount",
              {},
              "Expanded by protection"
            ),
            formatNumber(metrics.performanceExpandedByProtectionCount || 0),
          ],
          [
            t("panel.performance.structureRescanCount", {}, "Structure rescans"),
            formatNumber(metrics.structureRescanCount || 0),
          ],
          [
            t(
              "panel.performance.consecutiveSlowSyncCount",
              {},
              "Consecutive slow syncs"
            ),
            formatNumber(metrics.consecutiveSlowSyncCount || 0),
          ],
          [
            t(
              "panel.performance.nativeSearchDegradeNoticeCount",
              {},
              "Native find notices"
            ),
            formatNumber(metrics.nativeSearchDegradeNoticeCount || 0),
          ]
        );
      }

      if (this.activeTab === "overview") {
        if (this.shouldRenderSection("runtime")) {
          this.renderKeyValue(
            this.elements.runtime,
            [
              [t("panel.runtime.status"), formatStatus(state.runtimeStatus)],
              [
                t("panel.runtime.targetMode", {}, "Target mode"),
                formatMode(state.targetMode),
              ],
              [
                t("panel.runtime.effectiveMode", {}, "Effective mode"),
                formatMode(state.effectiveMode),
              ],
              [
                t("panel.runtime.runtimeProfile", {}, "Runtime profile"),
                formatRuntimeProfile(state.page.runtimeProfile),
              ],
              [
                t("panel.runtime.deviceTier", {}, "Resolution"),
                formatDeviceTier(state.page.deviceTier),
              ],
              [
                t("panel.runtime.lockedDegradation", {}, "Locked degradation"),
                formatLockState(Boolean(session.lockedDegradation)),
              ],
              [t("panel.runtime.chatPage"), formatYesNo(state.page.isChatPage)],
              [
                t("panel.runtime.activeAdapter", {}, "Active adapter"),
                formatRuntimeAdapter(state.page.activeAdapter),
              ],
              [
                t("panel.runtime.recognitionConfidence", {}, "Recognition confidence"),
                formatRecognitionConfidence(state.page.recognitionConfidence),
              ],
              [
                t("panel.runtime.threadReady", {}, "Thread ready"),
                formatYesNo(Boolean(state.page.threadReady)),
              ],
              [t("panel.runtime.optimization"), formatEnabled(state.page.optimizationEnabled)],
              [t("panel.runtime.scrollRoot"), formatReady(state.page.scrollRootReady)],
              [t("panel.runtime.lastSyncReason"), formatReason(state.page.lastSyncReason)],
            ],
            "runtime"
          );
          this.finishRenderSection("runtime");
        }

        if (this.shouldRenderSection("impact")) {
          this.renderKeyValue(
            this.elements.impact,
            [
              [t("panel.impact.coverage"), formatPercent(metrics.coverageRate)],
              [t("panel.impact.protectedShare"), formatPercent(metrics.protectedShare)],
              [t("panel.impact.skippedHeight"), formatPixels(metrics.estimatedSkippedHeight)],
              [
                t("panel.impact.controlledNodes"),
                formatNumber(metrics.estimatedControlledNodes),
              ],
              [t("panel.impact.benefit"), formatBenefit(metrics.benefitLevel)],
            ],
            "impact"
          );
          this.finishRenderSection("impact");
        }
      } else if (this.activeTab === "mode") {
        if (this.shouldRenderSection("modes")) {
          this.renderModes(state);
          this.finishRenderSection("modes");
        }
      } else if (this.activeTab === "messages") {
        if (this.shouldRenderSection("messageSummary")) {
          this.renderKeyValue(
            this.elements.messageSummary,
            [
              [t("panel.messages.total"), formatNumber(metrics.messageTotal)],
              [t("panel.messages.units"), formatNumber(metrics.unitTotal)],
            ],
            "message-summary"
          );
          this.finishRenderSection("messageSummary");
        }

        if (this.shouldRenderSection("messages")) {
          this.renderKeyValue(
            this.elements.messages,
            [
              [t("panel.messages.observed"), formatNumber(metrics.observed)],
              [t("panel.messages.optimizable"), formatNumber(metrics.optimizable)],
              [t("panel.messages.optimized"), formatNumber(metrics.optimized)],
              [t("panel.messages.keepAlive"), formatNumber(metrics.keepAlive)],
              [t("panel.messages.protected"), formatNumber(metrics.protected)],
              [t("panel.messages.visible"), formatNumber(metrics.visible)],
              [t("panel.messages.nearViewport"), formatNumber(metrics.nearViewport)],
            ],
            "messages"
          );
          this.finishRenderSection("messages");
        }
      } else if (this.activeTab === "performance") {
        if (this.shouldRenderSection("performance")) {
          this.renderKeyValue(
            this.elements.performance,
            performanceRows,
            "performance"
          );
          this.finishRenderSection("performance");
        }

        if (this.shouldRenderSection("fallback")) {
          this.renderKeyValue(
            this.elements.fallback,
            [
              [
                t("panel.fallback.contentVisibility"),
                formatYesNo(state.capabilities.contentVisibility),
              ],
              [
                t("panel.fallback.containIntrinsicSize"),
                formatYesNo(state.capabilities.containIntrinsicSize),
              ],
              [t("panel.fallback.fallback"), formatFallbackState(state.fallback)],
              [
                t("panel.fallback.lastAnomaly", {}, "Last anomaly"),
                formatSessionReason(session.lastAnomalyReason),
              ],
              [
                t("panel.fallback.degradeCount", {}, "Degrade count"),
                formatNumber(session.degradeCount || 0),
              ],
              [
                t("panel.fallback.recoveryCount", {}, "Recovery count"),
                formatNumber(session.recoveryCount || 0),
              ],
              [
                t("panel.fallback.recognitionFailures"),
                formatNumber(metrics.recognitionFailures),
              ],
              [t("panel.fallback.skippedMessages"), formatNumber(metrics.skippedMessages)],
              [
                t("panel.fallback.lastError"),
                state.fallback.lastError || t("common.none"),
              ],
            ],
            "fallback"
          );
          this.finishRenderSection("fallback");
        }
      } else if (this.activeTab === "events") {
        if (this.shouldRenderSection("trace")) {
          this.renderTraceState(state);
          this.finishRenderSection("trace");
        }

        if (this.shouldRenderSection("events")) {
          this.renderEvents(state.events);
          this.finishRenderSection("events");
        }
      }
    },

    renderSummary(state, metrics) {
      const targetChip =
        state.targetMode !== state.effectiveMode
          ? `<span class="summary-chip">${escapeHtml(
              t("panel.runtime.targetMode", {}, "Target mode")
            )}: ${escapeHtml(formatMode(state.targetMode))}</span>`
          : "";

      this.elements.summary.dataset.status = state.runtimeStatus;
      this.setCachedHtml(
        "summary",
        this.elements.summary,
        `
<div class="summary-indicator">
  <div class="summary-label">${escapeHtml(
    t("panel.summaryIndicatorLabel", {}, "Optimization Level")
  )}</div>
  <div class="summary-level-row">
    <span class="summary-level-dot" data-status="${escapeHtml(
      state.runtimeStatus
    )}"></span>
    <span class="summary-level-text-wrap">
      <span class="summary-level-text">${escapeHtml(
        formatMode(state.effectiveMode)
      )}</span>
      <span class="summary-chip">${escapeHtml(
        formatStatus(state.runtimeStatus)
      )}</span>
      ${targetChip}
    </span>
  </div>
</div>
<div class="summary-rate">
  <div class="summary-rate-label">${escapeHtml(
    t("panel.summaryRateLabel", {}, "Optimization Rate")
  )}</div>
  <div class="summary-rate-value">${escapeHtml(
    formatPercent(metrics.coverageRate)
  )}</div>
</div>`
      );
    },

    renderStats(metrics) {
      const cards = [
        [t("panel.messages.total"), formatNumber(metrics.messageTotal)],
        [t("panel.messages.units"), formatNumber(metrics.unitTotal)],
        [t("panel.messages.optimized"), formatNumber(metrics.optimized)],
        [t("panel.impact.skippedHeight"), formatPixels(metrics.estimatedSkippedHeight)],
      ];

      this.setCachedHtml(
        "stats",
        this.elements.statsGrid,
        cards
          .map(
            ([label, value]) => `
<div class="stat-card">
  <div class="stat-label">${escapeHtml(label)}</div>
  <div class="stat-value">${escapeHtml(value)}</div>
</div>`
          )
          .join("")
      );
    },

    renderTabs() {
      const tabs = [
        ["overview", t("panel.tabs.overview", {}, "Overview")],
        ["mode", t("panel.sections.mode", {}, "Mode")],
        ["messages", t("panel.sections.messages", {}, "Messages")],
        ["performance", t("panel.sections.performance", {}, "Performance")],
        ["events", t("panel.sections.events", {}, "Events")],
      ];

      this.setCachedHtml(
        "tabs",
        this.elements.tabStrip,
        tabs
          .map(
            ([id, label]) => `
<button class="tab-btn" type="button" data-tab="${escapeHtml(id)}" data-active="${
            this.activeTab === id
          }">${escapeHtml(label)}</button>`
          )
          .join("")
      );

      (this.elements.tabPanels || []).forEach((panel) => {
        panel.dataset.active = String(panel.dataset.tabPanel === this.activeTab);
      });
    },

    renderModes(state) {
      const modes = Array.isArray(state.modes) ? state.modes : [];
      const selectedModeId = state.targetMode || state.effectiveMode || "";

      this.setCachedHtml(
        "modes",
        this.elements.modeGrid,
        modes
          .map((mode) => {
            const riskTag = mode.riskTag || "low";
            const disabled = !mode.selectable;

            return `
<button class="mode-btn" type="button" data-level="${escapeHtml(mode.id)}" data-active="${
              state.targetMode === mode.id
            }" ${disabled ? "disabled" : ""}>
  <span class="mode-top">
    <span>${escapeHtml(formatModeLabel(mode))}</span>
    <span class="risk-tag" data-risk="${escapeHtml(riskTag)}">${escapeHtml(
      t(`riskTags.${riskTag}`, {}, riskTag)
    )}</span>
  </span>
  <span class="mode-desc">${escapeHtml(formatModeDescription(mode))}</span>
  <span class="mode-risk">${escapeHtml(formatModeRisk(mode))}</span>
</button>`;
          })
          .join("")
      );

      this.scheduleSelectedModeIntoView(selectedModeId);
    },

    renderActionState(state) {
      const restoreButton = this.elements.restoreAction;

      if (!restoreButton) {
        return;
      }

      const activeMode = getModeSnapshot(state, state.effectiveMode);
      const canRestore = Boolean(activeMode && activeMode.supportsSessionRestore);

      restoreButton.disabled = !canRestore;
      restoreButton.title = canRestore
        ? t("panel.actions.restoreSession", {}, "Restore current session")
        : t(
            "panel.actions.restoreUnavailable",
            {},
            "Current mode does not need session restore"
          );
      restoreButton.setAttribute("aria-label", restoreButton.title);
    },

    renderTraceState(state) {
      const trace = state.trace || {};
      const toggleButton = this.elements.traceToggle;
      const exportButton = this.elements.traceExport;
      const copyButton = this.elements.traceCopy;
      const clearButton = this.elements.traceClear;

      if (this.elements.traceSummary) {
        this.renderKeyValue(
          this.elements.traceSummary,
          [
            [
              t("panel.trace.recording", {}, "Recording"),
              formatEnabled(Boolean(trace.recording)),
            ],
            [
              t("panel.trace.entries", {}, "Entries"),
              formatNumber(trace.entryCount || 0),
            ],
            [
              t("panel.trace.domEvents", {}, "DOM events"),
              formatNumber(trace.domEventCount || 0),
            ],
            [
              t("panel.trace.mutations", {}, "Mutation batches"),
              formatNumber(trace.mutationBatchCount || 0),
            ],
            [
              t("panel.trace.snapshots", {}, "Snapshots"),
              formatNumber(trace.snapshotCount || 0),
            ],
            [
              t("panel.trace.syncSamples", {}, "Sync samples"),
              formatNumber(trace.syncEventCount || 0),
            ],
            [
              t("panel.trace.styleWrites", {}, "Style writes"),
              formatNumber(trace.styleWriteCount || 0),
            ],
            [
              t("panel.trace.startedAt", {}, "Started at"),
              formatTimestamp(trace.startedAt),
            ],
            [
              t("panel.trace.lastEntry", {}, "Last entry"),
              formatTraceLastEntry(trace),
            ],
          ],
          "trace-summary"
        );
      }

      if (toggleButton) {
        toggleButton.dataset.recording = String(Boolean(trace.recording));
        this.setCachedText(
          "trace-toggle",
          toggleButton,
          trace.recording
            ? t("panel.trace.stop", {}, "Stop trace")
            : t("panel.trace.start", {}, "Start trace")
        );
      }

      if (exportButton) {
        exportButton.disabled = !trace.entryCount;
        this.setCachedText(
          "trace-export",
          exportButton,
          t("panel.trace.export", {}, "Export JSON")
        );
      }

      if (copyButton) {
        copyButton.disabled = !trace.entryCount;
        this.setCachedText(
          "trace-copy",
          copyButton,
          t("panel.trace.copy", {}, "Copy JSON")
        );
      }

      if (clearButton) {
        clearButton.disabled = !trace.entryCount && !trace.recording;
        this.setCachedText(
          "trace-clear",
          clearButton,
          t("panel.trace.clear", {}, "Clear trace")
        );
      }
    },

    renderKeyValue(container, rows, cacheKey = "") {
      const html = rows
        .map(
          ([label, value]) => `
<div>${escapeHtml(label)}</div>
<div>${escapeHtml(value)}</div>`
        )
        .join("");

      this.setCachedHtml(
        cacheKey || container.dataset.section || "kv",
        container,
        html
      );
    },

    renderEvents(events) {
      let html = "";

      if (!events.length) {
        html = `<div class="event"><div class="event-detail">${escapeHtml(
          t("panel.noRecentEvents")
        )}</div></div>`;
      } else {
        html = events
          .map((event) => {
            const eventType = formatEventType(event.type);
            const detail = t(
              event.detailKey,
              event.detailParams || {},
              event.detailKey
            );

            return `
<div class="event">
  <div class="event-time">${escapeHtml(
    t("panel.eventMeta", { time: event.time, type: eventType })
  )}</div>
  <div class="event-detail">${escapeHtml(detail)}</div>
</div>`;
          })
          .join("");
      }

      this.setCachedHtml("events", this.elements.events, html);
    },
  };
})();
