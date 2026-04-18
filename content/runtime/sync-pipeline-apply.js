(() => {
  const app = globalThis.__CSP__;
  const syncPipelineControllerMethods =
    app.runtime.syncPipelineControllerMethods ||
    (app.runtime.syncPipelineControllerMethods = {});

  Object.assign(syncPipelineControllerMethods, {
    isSyncPipelineStillCurrent(pipelineContext) {
      const runtimeState = this.state.runtime;
      const currentRouteKey = this.services.page.getRouteKey();

      return (
        pipelineContext.begin.routeKey === currentRouteKey &&
        pipelineContext.begin.level === runtimeState.level &&
        pipelineContext.begin.effectiveMode === runtimeState.effectiveMode
      );
    },

    createOptimizationOverlayForPipeline(pipelineContext) {
      const runtimeState = this.state.runtime;
      const schedulerState = this.state.scheduler;
      const runtimeContext = pipelineContext.runtime;
      const decisionState = pipelineContext.decision;
      const tasks = decisionState.styleTasks || [];
      const routeKey = pipelineContext.begin.routeKey || "";
      const totalUnitCount = Math.max(
        pipelineContext.records.items.length || 0,
        this.getCurrentDiagnosticsUnitTotal(),
        1
      );
      const activeOverlayJob = schedulerState.activeOverlayJob;

      if (
        activeOverlayJob &&
        (activeOverlayJob.routeKey !== routeKey ||
          activeOverlayJob.level !== runtimeState.level ||
          activeOverlayJob.effectiveMode !== runtimeState.effectiveMode)
      ) {
        this.clearOptimizationOverlayJob(activeOverlayJob);
      }

      if (
        schedulerState.activeOverlayJob &&
        schedulerState.activeOverlayJob.routeKey === routeKey &&
        schedulerState.activeOverlayJob.level === runtimeState.level &&
        schedulerState.activeOverlayJob.effectiveMode === runtimeState.effectiveMode
      ) {
        return this.createOptimizationOverlayJob(totalUnitCount, routeKey);
      }

      const newOptimizedTaskCount = tasks.reduce(
        (count, task) =>
          Boolean(task.decision?.optimize) && !task.previousOptimized
            ? count + 1
            : count,
        0
      );

      if (
        !runtimeContext.levelConfig?.enableOptimization ||
        !runtimeContext.canApplyOptimizationClasses ||
        newOptimizedTaskCount <= 0
      ) {
        return null;
      }

      return this.createOptimizationOverlayJob(totalUnitCount, routeKey);
    },

    async applyChatSyncPipelineStyleTasks(pipelineContext, overlayJob) {
      const tasks = pipelineContext.decision.styleTasks || [];
      let appliedOptimizedCount = overlayJob ? overlayJob.currentOptimized || 0 : 0;
      let lastYieldAt = performance.now();

      for (let index = 0; index < tasks.length; index += 1) {
        if (overlayJob && !this.isSyncPipelineStillCurrent(pipelineContext)) {
          this.clearOptimizationOverlayJob(overlayJob);
          return false;
        }

        const task = tasks[index];

        this.applyRecordStyles(task.record, task.decision);

        if (
          overlayJob &&
          Boolean(task.decision?.optimize) &&
          !task.previousOptimized
        ) {
          appliedOptimizedCount += 1;
          this.updateOptimizationOverlayJob(
            overlayJob,
            appliedOptimizedCount,
            pipelineContext.records.items.length || 0,
            "applyOptimization"
          );
        }

        if (
          overlayJob &&
          (index === 0 ||
            index === tasks.length - 1 ||
            appliedOptimizedCount >= (overlayJob.totalUnits || 0) ||
            appliedOptimizedCount % 8 === 0 ||
            performance.now() - lastYieldAt >= 16)
        ) {
          await this.waitForNextPaint();
          lastYieldAt = performance.now();
        }
      }

      return true;
    },
  });
})();
