(() => {
  const app = globalThis.__CSP__;
  const { recordPipelineStage } = app.runtime.syncPipelineShared;
  const syncPipelineControllerMethods =
    app.runtime.syncPipelineControllerMethods ||
    (app.runtime.syncPipelineControllerMethods = {});

  Object.assign(syncPipelineControllerMethods, {
    async runSyncPipeline(reason, isResync) {
      const pipelineContext = this.beginSyncPipeline(reason, isResync);
      let overlayJob = null;
      let preserveOverlayJob = false;

      try {
        if (pipelineContext.begin.sessionRouteChanged) {
          this.clearOptimizationOverlayJob();
          this.resetSessionRuntimeState();
          recordPipelineStage(this, "session-route-reset", pipelineContext, {
            reason,
          });
        }

        if (!pipelineContext.page.isChatPage) {
          this.handleNonChatSyncPipeline(pipelineContext);
          return;
        }

        if (this.state.runtime.level === "off") {
          this.handleOffChatSyncPipeline(pipelineContext);
          return;
        }

        this.prepareChatSyncPipelineContext(pipelineContext);
        this.refreshChatSyncPipelineState(pipelineContext);
        this.evaluateChatSyncPipelineDecisions(pipelineContext);
        overlayJob = this.createOptimizationOverlayForPipeline(pipelineContext);

        if (overlayJob) {
          await this.waitForNextPaint();
        }

        const appliedStyles = await this.applyChatSyncPipelineStyleTasks(
          pipelineContext,
          overlayJob
        );

        if (!appliedStyles) {
          return;
        }

        const finalizeResult = this.finalizeChatSyncPipeline(pipelineContext);

        if (overlayJob) {
          this.updateOptimizationOverlayJob(
            overlayJob,
            finalizeResult.optimizedCount,
            finalizeResult.unitTotal,
            finalizeResult.hasContinuationSync ? "applyOptimization" : "settleState"
          );

          if (finalizeResult.hasContinuationSync) {
            preserveOverlayJob = true;
          } else {
            this.finishOptimizationOverlayJob(
              overlayJob,
              finalizeResult.optimizedCount,
              finalizeResult.unitTotal
            );
          }
        }
      } finally {
        if (overlayJob && !overlayJob.completed && !preserveOverlayJob) {
          this.clearOptimizationOverlayJob(overlayJob);
        }

        this.endSyncPipeline(pipelineContext);
      }
    },
  });
})();
