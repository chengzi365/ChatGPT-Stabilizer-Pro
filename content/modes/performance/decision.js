(() => {
  const app = globalThis.__CSP__;
  const config = app.core.config;
  const performanceMode = app.modes.performance || (app.modes.performance = {});
  const {
    PERFORMANCE_CONSTANTS,
    t,
    createPerformanceSessionState,
    getPerformanceRuntime,
    preparePerformanceCycle,
    getDistanceBand,
    queueRecord,
  } = performanceMode;

  function isBenefitCandidate(record) {
    const height = Math.max(
      record.performanceExpandedHeight || record.lastMeasuredHeight || 0,
      0
    );
    const nodeCount = Math.max(record.nodeCountEstimate || 0, 0);
    const structureScore = Math.max(record.structureScoreEstimate || 0, 0);
    const richContentCount = Math.max(record.richContentCountEstimate || 0, 0);
    const textLength = Math.max(record.textLengthEstimate || 0, 0);
    const plainTextDominant = Boolean(record.plainTextDominant);

    if (height < PERFORMANCE_CONSTANTS.benefitHeightMinimum) {
      return false;
    }

    if (plainTextDominant) {
      return (
        height >= PERFORMANCE_CONSTANTS.benefitHeightTextExtreme ||
        (height >= PERFORMANCE_CONSTANTS.benefitHeightTextLarge &&
          textLength >= PERFORMANCE_CONSTANTS.benefitTextLarge)
      );
    }

    if (
      richContentCount >= PERFORMANCE_CONSTANTS.benefitRichContentMinimum &&
      height >= 160
    ) {
      return true;
    }

    if (structureScore >= PERFORMANCE_CONSTANTS.benefitStructureStrong) {
      return true;
    }

    if (richContentCount >= 1 && structureScore >= 32 && height >= 220) {
      return true;
    }

    if (
      height >= PERFORMANCE_CONSTANTS.benefitHeightStructured &&
      structureScore >= PERFORMANCE_CONSTANTS.benefitStructureTallCombo
    ) {
      return true;
    }

    if (
      nodeCount >= PERFORMANCE_CONSTANTS.benefitNodeCombo &&
      structureScore >= PERFORMANCE_CONSTANTS.benefitStructureCombo
    ) {
      return true;
    }

    return (
      height >= 320 &&
      structureScore >= PERFORMANCE_CONSTANTS.benefitStructureCombo
    );
  }

  function getCollapsedHeight(record) {
    const measuredHeight = Math.max(
      record.performanceExpandedHeight || record.lastMeasuredHeight || 0,
      0
    );
    const scaledHeight = Math.round(
      measuredHeight * PERFORMANCE_CONSTANTS.collapsedHeightRatio
    );

    return Math.max(
      PERFORMANCE_CONSTANTS.collapsedHeightMin,
      Math.min(
        PERFORMANCE_CONSTANTS.collapsedHeightMax,
        scaledHeight || PERFORMANCE_CONSTANTS.collapsedHeightMin
      )
    );
  }

  function getCollapsedLabel(state) {
    if (state === "restore-pending" || state === "restoring") {
      return t(
        "performance.restoringLabel",
        {},
        "Expanding this history block. Wait a moment before copying or opening links."
      );
    }

    return t(
      "performance.foldedLabel",
      {},
      "History folded. Click once to expand, then wait a moment before copying or opening links."
    );
  }

  function shouldApplyRestoreAnchorAdjustment(
    protectionService,
    scrollRoot,
    runtime,
    record,
    rootRect
  ) {
    if (record.lastViewportBottom > rootRect.top) {
      return false;
    }

    if (runtime.scrollDirection !== 0) {
      return false;
    }

    if (
      runtime.lastScrollActivityAt > 0 &&
      runtime.cycleNow - runtime.lastScrollActivityAt < 140
    ) {
      return false;
    }

    if (Boolean(protectionService?.isBottomFollowActive?.())) {
      return false;
    }

    if (app.dom.getDistanceToBottom(scrollRoot) <= 160) {
      return false;
    }

    return true;
  }

  function buildExpandedModeState(distanceTier, performanceState) {
    return {
      modeId: "performance",
      distanceTier,
      contentDataset: {
        cspManaged: "true",
        cspPerformanceState: performanceState,
      },
      messageDataset: {
        cspManaged: "true",
        cspPerformanceState: performanceState,
      },
    };
  }

  function buildCollapsedModeState(record, distanceTier, performanceState) {
    return {
      modeId: "performance",
      distanceTier,
      contentClass: "csp-performance-collapsed-content",
      messageClass: "csp-performance-collapsed-message",
      contentDataset: {
        cspManaged: "true",
        cspPerformanceState: performanceState,
      },
      messageDataset: {
        cspManaged: "true",
        cspPerformanceState: performanceState,
        cspPerformanceLabel: getCollapsedLabel(performanceState),
      },
      messageStyleVars: {
        "--csp-performance-collapsed-height": `${
          record.performancePlaceholderHeight || getCollapsedHeight(record)
        }px`,
      },
    };
  }

  function setPerformanceState(record, runtime, nextState, now) {
    if (record.performanceState === nextState) {
      return false;
    }

    record.performanceState = nextState;
    record.performanceLastStateChangeAt = now;
    runtime.stateTransitionCount += 1;
    return true;
  }

  function getActiveFreezeZone(runtime, recordIndex, now) {
    return (
      runtime.localFreezeZones.find(
        (zone) =>
          zone.expiresAt > now &&
          recordIndex >= zone.startIndex &&
          recordIndex <= zone.endIndex
      ) || null
    );
  }

  function createLocalFreezeZone(runtime, recordIndex, now) {
    const existingZone = getActiveFreezeZone(runtime, recordIndex, now);

    if (existingZone) {
      existingZone.expiresAt = now + PERFORMANCE_CONSTANTS.localFreezeDurationMs;
      return existingZone;
    }

    const zone = {
      id: `freeze-${runtime.nextLocalFreezeZoneId++}`,
      startIndex: Math.max(0, recordIndex - PERFORMANCE_CONSTANTS.localFreezeRadius),
      endIndex: recordIndex + PERFORMANCE_CONSTANTS.localFreezeRadius,
      expiresAt: now + PERFORMANCE_CONSTANTS.localFreezeDurationMs,
    };

    runtime.localFreezeZones.push(zone);
    runtime.localFreezeZoneCount = runtime.localFreezeZones.length;
    return zone;
  }

  function getEmergencyRestoreReason(record, now) {
    if (
      record.lastInteractionAt > 0 &&
      now - record.lastInteractionAt <= config.protection.interactionProtectMs
    ) {
      return "interaction";
    }

    if (record.visible) {
      return "visible";
    }

    if (record.hovered) {
      return "hover";
    }

    return "protected";
  }

  function buildPerformanceDecisionDiagnostics({
    distanceTier,
    benefitEligible = false,
    nextState = "expanded",
    blockedReason = "",
    expandedByProtection = false,
  }) {
    const far = distanceTier === "far";

    return {
      far,
      benefitEligible: far && Boolean(benefitEligible),
      collapsePending: nextState === "collapse-pending",
      collapsedStable: nextState === "collapsed",
      blockedByBenefit: blockedReason === "benefit",
      blockedByWriteWindow: blockedReason === "write-window",
      blockedByBudget: blockedReason === "budget",
      blockedByDwell: blockedReason === "dwell",
      expandedByProtection: Boolean(expandedByProtection),
    };
  }

  function createExpandedDecision(
    defaultDecision,
    modeState,
    extras = {},
    performanceDiagnostics = null
  ) {
    return {
      ...defaultDecision,
      modeState,
      performanceDiagnostics,
      ...extras,
    };
  }

  function markForExpandedMeasurement(runtime, measurementService, record) {
    record.measureDeferred = false;
    record.needsMeasure = true;
    if (typeof measurementService?.queueRecord === "function") {
      measurementService.queueRecord(record.id);
      return;
    }

    queueRecord(runtime.measureBacklogIds, runtime.measureBacklogSet, record.id);
  }

  function canReusePerformanceDecision({
    stateSlices,
    record,
    reason,
    isResync,
  }) {
    const runtimeState = stateSlices?.runtime;

    if (
      runtimeState?.effectiveMode !== "performance" ||
      !record ||
      !record.performanceDecisionCache ||
      record.performanceNeedsDecision ||
      record.performanceDirty ||
      record.needsMeasure ||
      record.needsContentProfile ||
      isResync
    ) {
      return false;
    }

    if (
      reason === "startup" ||
      reason === "route-change" ||
      reason === "level-change" ||
      reason === "manual-resync" ||
      reason === "dom-structure"
    ) {
      return false;
    }

    if (
      record.performanceState === "collapse-pending" ||
      record.performanceState === "restore-pending" ||
      record.performanceState === "restoring"
    ) {
      return false;
    }

    if (record.performanceState === "collapsed") {
      return true;
    }

    return record.performanceBand !== "far";
  }

  function cachePerformanceDecision({ stateSlices, record, decision }) {
    if (
      stateSlices?.runtime?.effectiveMode !== "performance" ||
      !record ||
      !decision
    ) {
      return;
    }

    record.performanceDecisionCache = {
      eligible: decision.eligible,
      optimize: decision.optimize,
      keepAlive: decision.keepAlive,
      modeState: decision.modeState || null,
      performanceDiagnostics: decision.performanceDiagnostics || null,
      controlledNodeEstimate: decision.controlledNodeEstimate,
      estimatedSkippedHeight: decision.estimatedSkippedHeight,
    };
    record.performanceNeedsDecision = false;
    record.performanceDirty = false;
  }

  function markPerformanceRecordDecisionDirty({ record }) {
    if (!record) {
      return;
    }

    record.performanceNeedsDecision = true;
    record.performanceDirty = true;
  }

  function getCachedPerformanceDecision({ record, defaultDecision }) {
    const cachedDecision = record?.performanceDecisionCache;

    if (!cachedDecision) {
      return {
        ...defaultDecision,
        optimize: Boolean(record?.optimized),
        modeState: record?.modeState || null,
      };
    }

    return {
      ...defaultDecision,
      ...cachedDecision,
      optimize:
        typeof cachedDecision.optimize === "boolean"
          ? cachedDecision.optimize
          : Boolean(record?.optimized),
      modeState: cachedDecision.modeState || record?.modeState || null,
      performanceDiagnostics: cachedDecision.performanceDiagnostics || null,
    };
  }

  function evaluatePerformanceRecord({
    services,
    stateSlices,
    strategySession,
    defaultDecision,
    record,
    recordIndex,
    rootRect,
    reason,
    isResync,
  }) {
    const performanceSession = strategySession || createPerformanceSessionState();
    const runtime = performanceSession.cyclePrepared
      ? getPerformanceRuntime(performanceSession)
      : preparePerformanceCycle(
          performanceSession,
          stateSlices?.page,
          services?.protection,
          reason,
          isResync
        );

    performanceSession.cyclePrepared = true;
    const now = runtime.cycleNow;
    const distanceTier = getDistanceBand(
      record,
      rootRect,
      runtime.scrollDirection,
      runtime.warmMarginScale
    );
    const freezeZone = getActiveFreezeZone(runtime, recordIndex, now);
    const wasCollapsed = Boolean(record.performanceCollapsed);
    const isFar = distanceTier === "far";
    const shouldRestoreSoon = record.protected || distanceTier === "warm";
    const benefitEligible = isBenefitCandidate(record);
    const bottomFollowActive = Boolean(
      services?.protection?.isBottomFollowActive?.()
    );
    const transitionUnlocked =
      now - (record.performanceLastStateChangeAt || 0) >=
      PERFORMANCE_CONSTANTS.transitionGapMs;
    const collapseAllowedAt =
      !bottomFollowActive &&
      !record.sessionCollapseBlocked &&
      !freezeZone &&
      now >= (record.performanceNoCollapseUntil || 0);
    let anchorAdjustment = 0;
    let requiresMeasurementFollowup = false;
    let selfMutationDurationMs = 0;

    record.performanceBand = distanceTier;
    record.localFreezeZoneId = freezeZone ? freezeZone.id : "";

    if (record.sessionCollapseBlocked) {
      runtime.sessionCollapseBlockedCount += 1;
    }

    if (isFar && !benefitEligible) {
      runtime.benefitRejectedCount += 1;
    }

    if (isFar && benefitEligible && collapseAllowedAt) {
      if (!record.performanceFarSince) {
        record.performanceFarSince = now;
      }
    } else {
      record.performanceFarSince = 0;
    }

    if (wasCollapsed) {
      if (!benefitEligible || record.sessionCollapseBlocked || freezeZone) {
        record.performanceCollapsed = false;
        record.performanceRestoreReason = benefitEligible ? "frozen" : "ineligible";
        record.performanceNoCollapseUntil =
          now + PERFORMANCE_CONSTANTS.expandedHoldMs;
        record.lastExpandedAt = now;
        setPerformanceState(record, runtime, "restoring", now);
        selfMutationDurationMs = PERFORMANCE_CONSTANTS.selfMutationWindowMs;
        requiresMeasurementFollowup = true;
        markForExpandedMeasurement(runtime, services?.measurement, record);

        if (
          shouldApplyRestoreAnchorAdjustment(
            services?.protection,
            stateSlices?.page?.scrollRoot || null,
            runtime,
            record,
            rootRect
          )
        ) {
          anchorAdjustment = Math.max(
            0,
            (record.performanceExpandedHeight || record.lastMeasuredHeight || 0) -
              (record.performancePlaceholderHeight || getCollapsedHeight(record))
          );
        }

        if (anchorAdjustment > 0) {
          runtime.anchorCorrectionCount += 1;
        }

        return createExpandedDecision(
          defaultDecision,
          buildExpandedModeState(distanceTier, "restoring"),
          {
            requiresMeasurementFollowup,
            anchorAdjustment,
            selfMutationDurationMs,
          },
          buildPerformanceDecisionDiagnostics({
            distanceTier,
            benefitEligible,
            nextState: "restoring",
            blockedReason: isFar && !benefitEligible ? "benefit" : "",
            expandedByProtection: distanceTier !== "far",
          })
        );
      }

      if (shouldRestoreSoon) {
        const emergencyRestore = record.protected;
        const canRestoreNow = emergencyRestore || runtime.restoreBudgetRemaining > 0;

        if (!canRestoreNow) {
          runtime.hasPendingBacklog = true;
          queueRecord(runtime.restoreQueueIds, runtime.restoreQueueSet, record.id);
          setPerformanceState(record, runtime, "restore-pending", now);

          return {
            ...defaultDecision,
            optimize: true,
            keepAlive: false,
            modeState: buildCollapsedModeState(
              record,
              distanceTier,
              "restore-pending"
            ),
            controlledNodeEstimate: record.nodeCountEstimate || 0,
            estimatedSkippedHeight: Math.max(
              0,
              (record.performanceExpandedHeight || record.lastMeasuredHeight || 0) -
                (record.performancePlaceholderHeight || getCollapsedHeight(record))
            ),
            performanceDiagnostics: buildPerformanceDecisionDiagnostics({
              distanceTier,
              benefitEligible,
              nextState: "restore-pending",
            }),
          };
        }

        if (!emergencyRestore) {
          runtime.restoreBudgetRemaining -= 1;
        }

        record.performanceCollapsed = false;
        record.performanceRestoreReason = getEmergencyRestoreReason(record, now);
        record.performanceNoCollapseUntil =
          now +
          (emergencyRestore
            ? PERFORMANCE_CONSTANTS.emergencyHoldMs
            : PERFORMANCE_CONSTANTS.expandedHoldMs);
        record.lastExpandedAt = now;
        selfMutationDurationMs = PERFORMANCE_CONSTANTS.selfMutationWindowMs;
        requiresMeasurementFollowup = true;
        setPerformanceState(record, runtime, "restoring", now);
        markForExpandedMeasurement(runtime, services?.measurement, record);

        if (
          shouldApplyRestoreAnchorAdjustment(
            services?.protection,
            stateSlices?.page?.scrollRoot || null,
            runtime,
            record,
            rootRect
          )
        ) {
          anchorAdjustment = Math.max(
            0,
            (record.performanceExpandedHeight || record.lastMeasuredHeight || 0) -
              (record.performancePlaceholderHeight || getCollapsedHeight(record))
          );
        }

        if (anchorAdjustment > 0) {
          runtime.anchorCorrectionCount += 1;
        }

        if (emergencyRestore) {
          record.recentEmergencyRestoreCount += 1;

          if (
            record.recentEmergencyRestoreCount >=
            PERFORMANCE_CONSTANTS.localFreezeEmergencyThreshold
          ) {
            const zone = createLocalFreezeZone(runtime, recordIndex, now);
            record.localFreezeZoneId = zone.id;
          }

          if (
            record.recentEmergencyRestoreCount >=
            PERFORMANCE_CONSTANTS.sessionBlockEmergencyThreshold
          ) {
            record.sessionCollapseBlocked = true;
          }
        } else {
          record.recentEmergencyRestoreCount = 0;
        }

        return createExpandedDecision(
          defaultDecision,
          buildExpandedModeState(distanceTier, "restoring"),
          {
            requiresMeasurementFollowup,
            anchorAdjustment,
            selfMutationDurationMs,
          },
          buildPerformanceDecisionDiagnostics({
            distanceTier,
            benefitEligible,
            nextState: "restoring",
            expandedByProtection: true,
          })
        );
      }

      runtime.collapsedCount += 1;
      setPerformanceState(record, runtime, "collapsed", now);

      return {
        ...defaultDecision,
        optimize: true,
        keepAlive: false,
        modeState: buildCollapsedModeState(record, distanceTier, "collapsed"),
        controlledNodeEstimate: record.nodeCountEstimate || 0,
        estimatedSkippedHeight: Math.max(
          0,
          (record.performanceExpandedHeight || record.lastMeasuredHeight || 0) -
            (record.performancePlaceholderHeight || getCollapsedHeight(record))
        ),
        performanceDiagnostics: buildPerformanceDecisionDiagnostics({
          distanceTier,
          benefitEligible,
          nextState: "collapsed",
        }),
      };
    }

    if (!isFar || !benefitEligible || !collapseAllowedAt) {
      setPerformanceState(record, runtime, "expanded", now);
      record.recentEmergencyRestoreCount = shouldRestoreSoon
        ? record.recentEmergencyRestoreCount
        : 0;

      return createExpandedDecision(
        defaultDecision,
        buildExpandedModeState(distanceTier, "expanded"),
        {},
        buildPerformanceDecisionDiagnostics({
          distanceTier,
          benefitEligible,
          nextState: "expanded",
          blockedReason: isFar && !benefitEligible ? "benefit" : "",
          expandedByProtection: distanceTier !== "far",
        })
      );
    }

    const farDwellElapsed =
      now - (record.performanceFarSince || now) >=
      PERFORMANCE_CONSTANTS.collapseDwellMs;

    if (!farDwellElapsed || !transitionUnlocked) {
      runtime.hasPendingBacklog = true;
      queueRecord(runtime.collapseQueueIds, runtime.collapseQueueSet, record.id);
      setPerformanceState(record, runtime, "collapse-pending", now);

      return createExpandedDecision(
        defaultDecision,
        buildExpandedModeState(distanceTier, "collapse-pending"),
        {},
        buildPerformanceDecisionDiagnostics({
          distanceTier,
          benefitEligible,
          nextState: "collapse-pending",
          blockedReason: "dwell",
        })
      );
    }

    if (runtime.collapseBudgetRemaining <= 0) {
      runtime.hasPendingBacklog = true;
      queueRecord(runtime.collapseQueueIds, runtime.collapseQueueSet, record.id);
      setPerformanceState(record, runtime, "collapse-pending", now);

      return createExpandedDecision(
        defaultDecision,
        buildExpandedModeState(distanceTier, "collapse-pending"),
        {},
        buildPerformanceDecisionDiagnostics({
          distanceTier,
          benefitEligible,
          nextState: "collapse-pending",
          blockedReason: "budget",
        })
      );
    }

    if (!runtime.collapseWriteAllowed) {
      runtime.hasPendingBacklog = true;
      queueRecord(runtime.collapseQueueIds, runtime.collapseQueueSet, record.id);
      setPerformanceState(record, runtime, "collapse-pending", now);

      return createExpandedDecision(
        defaultDecision,
        buildExpandedModeState(distanceTier, "collapse-pending"),
        {},
        buildPerformanceDecisionDiagnostics({
          distanceTier,
          benefitEligible,
          nextState: "collapse-pending",
          blockedReason: "write-window",
        })
      );
    }

    runtime.collapseBudgetRemaining -= 1;
    record.performanceCollapsed = true;
    record.performancePlaceholderHeight = getCollapsedHeight(record);
    record.lastCollapsedAt = now;
    record.performanceRestoreReason = "";
    selfMutationDurationMs = PERFORMANCE_CONSTANTS.selfMutationWindowMs;
    setPerformanceState(record, runtime, "collapsed", now);
    runtime.collapsedCount += 1;

    return {
      ...defaultDecision,
      optimize: true,
      keepAlive: false,
      modeState: buildCollapsedModeState(record, distanceTier, "collapsed"),
      controlledNodeEstimate: record.nodeCountEstimate || 0,
      estimatedSkippedHeight: Math.max(
        0,
        (record.performanceExpandedHeight || record.lastMeasuredHeight || 0) -
          record.performancePlaceholderHeight
      ),
      selfMutationDurationMs,
      performanceDiagnostics: buildPerformanceDecisionDiagnostics({
        distanceTier,
        benefitEligible,
        nextState: "collapsed",
      }),
    };
  }

  Object.assign(performanceMode, {
    canReusePerformanceDecision,
    cachePerformanceDecision,
    markPerformanceRecordDecisionDirty,
    getCachedPerformanceDecision,
    evaluatePerformanceRecord,
  });
})();
