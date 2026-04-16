(() => {
  const app = globalThis.__CSP__;
  const config = app.core.config;

  const DEFAULT_BUCKET =
    config.runtimeProfiles?.defaultBucket || "balanced";
  const EMPTY_OBJECT = Object.freeze({});
  const levelConfigCache = Object.create(null);
  const syncConfigCache = Object.create(null);

  function normalizeBucket(bucket) {
    const normalized = String(bucket || DEFAULT_BUCKET).trim();

    if (
      normalized &&
      config.runtimeProfiles &&
      config.runtimeProfiles.buckets &&
      Object.prototype.hasOwnProperty.call(config.runtimeProfiles.buckets, normalized)
    ) {
      return normalized;
    }

    return DEFAULT_BUCKET;
  }

  function getViewportDimension(value, fallback) {
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  function getViewportSnapshot() {
    const documentElement = document.documentElement;
    const fallbackWidth = documentElement ? documentElement.clientWidth : 0;
    const fallbackHeight = documentElement ? documentElement.clientHeight : 0;

    return {
      width: Math.max(
        0,
        getViewportDimension(globalThis.innerWidth, fallbackWidth)
      ),
      height: Math.max(
        0,
        getViewportDimension(globalThis.innerHeight, fallbackHeight)
      ),
    };
  }

  function getDeviceTier() {
    const tierConfig = config.runtimeProfiles?.deviceTier || {};
    const hardwareConcurrency = Number(globalThis.navigator?.hardwareConcurrency) || 0;
    const deviceMemory = Number(globalThis.navigator?.deviceMemory) || 0;
    const lowByCpu =
      hardwareConcurrency > 0 &&
      hardwareConcurrency <= (tierConfig.lowMaxHardwareConcurrency || 4);
    const lowByMemory =
      deviceMemory > 0 && deviceMemory <= (tierConfig.lowMaxDeviceMemory || 4);

    if (lowByCpu || lowByMemory) {
      return "low";
    }

    const highByCpu =
      hardwareConcurrency >= (tierConfig.highMinHardwareConcurrency || 8);
    const highByMemory =
      deviceMemory <= 0 || deviceMemory >= (tierConfig.highMinDeviceMemory || 8);

    if (highByCpu && highByMemory) {
      return "high";
    }

    return "normal";
  }

  function resolveRuntimeBucket(previousBucket, deviceTier) {
    const viewport = getViewportSnapshot();
    const profileConfig = config.runtimeProfiles || {};
    const compactConfig = profileConfig.compact || {};
    const wideConfig = profileConfig.wide || {};
    const width = viewport.width;
    const height = viewport.height;
    const normalizedPrevious = normalizeBucket(previousBucket);
    const allowWide =
      deviceTier !== "low" || Boolean(wideConfig.allowLowDeviceTier);

    if (normalizedPrevious === "wide") {
      const staysWide =
        allowWide &&
        width >= (wideConfig.exitMaxWidth || 1480) &&
        height >= (wideConfig.exitMaxHeight || 1080);

      if (staysWide) {
        return "wide";
      }
    }

    if (normalizedPrevious === "compact") {
      const leavesCompact =
        width >= (compactConfig.exitMinWidth || 1200) &&
        height >= (compactConfig.exitMinHeight || 860);

      if (!leavesCompact) {
        return "compact";
      }
    }

    if (
      allowWide &&
      width >= (wideConfig.enterMinWidth || 1640) &&
      height >= (wideConfig.enterMinHeight || 1220)
    ) {
      return "wide";
    }

    if (
      width < (compactConfig.enterMaxWidth || 1080) ||
      height < (compactConfig.enterMaxHeight || 740)
    ) {
      return "compact";
    }

    return "balanced";
  }

  function getBucketConfig(bucket) {
    return (
      config.runtimeProfiles?.buckets?.[normalizeBucket(bucket)] || EMPTY_OBJECT
    );
  }

  function getRuntimeProfileLevelConfig(level, bucket) {
    const normalizedBucket = normalizeBucket(bucket);
    const normalizedLevel = String(level || config.defaultLevel).trim();
    const cacheKey = `${normalizedLevel}:${normalizedBucket}`;

    if (levelConfigCache[cacheKey]) {
      return levelConfigCache[cacheKey];
    }

    const baseConfig =
      config.levels[normalizedLevel] || config.levels[config.defaultLevel] || EMPTY_OBJECT;
    const bucketConfig = getBucketConfig(normalizedBucket);
    const levelOverrides = bucketConfig.levelOverrides || EMPTY_OBJECT;
    const mergedConfig = Object.freeze({
      ...baseConfig,
      ...(levelOverrides[normalizedLevel] || EMPTY_OBJECT),
    });

    levelConfigCache[cacheKey] = mergedConfig;
    return mergedConfig;
  }

  function getRuntimeProfileSyncConfig(bucket) {
    const normalizedBucket = normalizeBucket(bucket);

    if (syncConfigCache[normalizedBucket]) {
      return syncConfigCache[normalizedBucket];
    }

    const bucketConfig = getBucketConfig(normalizedBucket);
    const mergedConfig = Object.freeze({
      ...config.sync,
      ...(bucketConfig.syncOverrides || EMPTY_OBJECT),
    });

    syncConfigCache[normalizedBucket] = mergedConfig;
    return mergedConfig;
  }

  function createRuntimeProfileState(level = config.defaultLevel) {
    const bucket = normalizeBucket(DEFAULT_BUCKET);

    return {
      runtimeProfile: bucket,
      deviceTier: "normal",
      profileRevision: 0,
      effectiveLevelConfig: getRuntimeProfileLevelConfig(level, bucket),
      effectiveSyncConfig: getRuntimeProfileSyncConfig(bucket),
    };
  }

  app.runtime.getRuntimeViewportSnapshot = getViewportSnapshot;
  app.runtime.resolveRuntimeDeviceTier = getDeviceTier;
  app.runtime.resolveRuntimeProfileBucket = resolveRuntimeBucket;
  app.runtime.getRuntimeProfileLevelConfig = getRuntimeProfileLevelConfig;
  app.runtime.getRuntimeProfileSyncConfig = getRuntimeProfileSyncConfig;
  app.runtime.createRuntimeProfileState = createRuntimeProfileState;

  app.runtime.runtimeProfileControllerMethods = {
    getEffectiveSyncConfig() {
      const runtimeState = this.state.runtime;

      return (
        runtimeState.effectiveSyncConfig ||
        app.runtime.getRuntimeProfileSyncConfig(runtimeState.runtimeProfile)
      );
    },

    rebuildEffectiveRuntimeConfig() {
      const runtimeState = this.state.runtime;

      runtimeState.effectiveLevelConfig = app.runtime.getRuntimeProfileLevelConfig(
        runtimeState.level,
        runtimeState.runtimeProfile
      );
      runtimeState.effectiveSyncConfig = app.runtime.getRuntimeProfileSyncConfig(
        runtimeState.runtimeProfile
      );

      return {
        effectiveLevelConfig: runtimeState.effectiveLevelConfig,
        effectiveSyncConfig: runtimeState.effectiveSyncConfig,
      };
    },

    refreshRuntimeProfile(reason = "", { force = false } = {}) {
      const runtimeState = this.state.runtime;
      const previousBucket = normalizeBucket(runtimeState.runtimeProfile);
      const previousDeviceTier = String(runtimeState.deviceTier || "normal");
      const nextDeviceTier = app.runtime.resolveRuntimeDeviceTier();
      const nextBucket = app.runtime.resolveRuntimeProfileBucket(
        previousBucket,
        nextDeviceTier
      );
      const previousLevelConfig = runtimeState.effectiveLevelConfig;
      const previousSyncConfig = runtimeState.effectiveSyncConfig;
      const profileChanged =
        nextBucket !== previousBucket || nextDeviceTier !== previousDeviceTier;

      runtimeState.runtimeProfile = nextBucket;
      runtimeState.deviceTier = nextDeviceTier;

      const nextConfigs = this.rebuildEffectiveRuntimeConfig();
      const configChanged =
        force ||
        profileChanged ||
        previousLevelConfig !== nextConfigs.effectiveLevelConfig ||
        previousSyncConfig !== nextConfigs.effectiveSyncConfig;

      if (profileChanged) {
        runtimeState.profileRevision += 1;
      }

      return {
        reason,
        profileChanged,
        configChanged,
        runtimeProfile: nextBucket,
        deviceTier: nextDeviceTier,
      };
    },

    clearRuntimeProfileRefreshTimer() {
      const schedulerState = this.state.scheduler;

      if (schedulerState.runtimeProfileTimer) {
        globalThis.clearTimeout(schedulerState.runtimeProfileTimer);
      }

      schedulerState.runtimeProfileTimer = 0;
      schedulerState.runtimeProfileTimerReason = "";
    },

    scheduleRuntimeProfileRefresh(reason = "viewport-resize") {
      const schedulerState = this.state.scheduler;
      const delay = Math.max(120, config.runtimeProfiles?.resizeSettleMs || 240);

      this.clearRuntimeProfileRefreshTimer();
      schedulerState.runtimeProfileTimerReason = reason || "viewport-resize";
      schedulerState.runtimeProfileTimer = globalThis.setTimeout(() => {
        const nextReason =
          schedulerState.runtimeProfileTimerReason || reason || "viewport-resize";

        schedulerState.runtimeProfileTimer = 0;
        schedulerState.runtimeProfileTimerReason = "";

        const refreshResult = this.refreshRuntimeProfile(nextReason);

        if (
          refreshResult.profileChanged &&
          this.state.runtime.level !== "off" &&
          Boolean(this.state.page.chatRoot)
        ) {
          this.scheduleSync("runtime-profile-change", true);
        }
      }, delay);
    },
  };
})();
