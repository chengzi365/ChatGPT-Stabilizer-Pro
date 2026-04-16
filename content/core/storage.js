(() => {
  const app = globalThis.__CSP__;
  const config = app.core.config;

  const STORAGE_MIGRATION_KEY = "csp.storageMigrationVersion";
  const STORAGE_MIGRATION_VERSION = 1;
  const WRITE_BACK_DELAY_MS = 120;

  const cache = new Map();
  const listeners = new Set();
  const pendingWrites = new Map();
  const knownKeys = Array.from(
    new Set(Object.values(config.storageKeys || {}).filter(Boolean))
  );
  let extensionStorageInfo = null;
  let initStarted = false;
  let hydrated = false;
  let hydratePromise = null;
  let flushTimer = 0;
  let flushInFlight = false;
  let storageChangeListenerInstalled = false;

  function isObjectLike(value) {
    return value !== null && typeof value === "object";
  }

  function cloneValue(value) {
    if (!isObjectLike(value)) {
      return value;
    }

    if (typeof globalThis.structuredClone === "function") {
      try {
        return globalThis.structuredClone(value);
      } catch (error) {
        // Fall through to JSON clone.
      }
    }

    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return value;
    }
  }

  function serializeValue(value) {
    if (typeof value === "undefined") {
      return "__csp_undefined__";
    }

    try {
      return JSON.stringify(value);
    } catch (error) {
      return `__csp_unserializable__:${String(value)}`;
    }
  }

  function readLocalValue(key) {
    try {
      const rawValue = globalThis.localStorage.getItem(key);

      if (rawValue === null) {
        return undefined;
      }

      return JSON.parse(rawValue);
    } catch (error) {
      return undefined;
    }
  }

  function writeLocalValue(key, value) {
    try {
      if (typeof value === "undefined") {
        globalThis.localStorage.removeItem(key);
      } else {
        globalThis.localStorage.setItem(key, JSON.stringify(value));
      }
    } catch (error) {
      // Ignore persistence failures in content scripts.
    }
  }

  function seedCacheFromLocalStorage() {
    for (let index = 0; index < knownKeys.length; index += 1) {
      const key = knownKeys[index];
      const value = readLocalValue(key);

      if (typeof value !== "undefined") {
        cache.set(key, cloneValue(value));
      }
    }
  }

  function resolveExtensionStorageInfo() {
    if (globalThis.browser?.storage?.local) {
      return {
        kind: "browser",
        local: globalThis.browser.storage.local,
        onChanged: globalThis.browser.storage.onChanged || null,
      };
    }

    if (globalThis.chrome?.storage?.local) {
      return {
        kind: "chrome",
        local: globalThis.chrome.storage.local,
        onChanged: globalThis.chrome.storage.onChanged || null,
      };
    }

    return null;
  }

  function readExtensionValues(keys) {
    const storageInfo = extensionStorageInfo || resolveExtensionStorageInfo();

    if (!storageInfo?.local) {
      return Promise.resolve({});
    }

    if (storageInfo.kind === "browser") {
      return Promise.resolve(storageInfo.local.get(keys)).catch(() => ({}));
    }

    return new Promise((resolve) => {
      try {
        storageInfo.local.get(keys, (result) => {
          if (globalThis.chrome?.runtime?.lastError) {
            resolve({});
            return;
          }

          resolve(result || {});
        });
      } catch (error) {
        resolve({});
      }
    });
  }

  function writeExtensionValues(values) {
    const storageInfo = extensionStorageInfo || resolveExtensionStorageInfo();

    if (!storageInfo?.local || !values || Object.keys(values).length === 0) {
      return Promise.resolve(false);
    }

    if (storageInfo.kind === "browser") {
      return Promise.resolve(storageInfo.local.set(values))
        .then(() => true)
        .catch(() => false);
    }

    return new Promise((resolve) => {
      try {
        storageInfo.local.set(values, () => {
          if (globalThis.chrome?.runtime?.lastError) {
            resolve(false);
            return;
          }

          resolve(true);
        });
      } catch (error) {
        resolve(false);
      }
    });
  }

  function buildChangeRecord(oldValue, newValue) {
    return {
      oldValue: cloneValue(oldValue),
      newValue: cloneValue(newValue),
    };
  }

  function applyCachedValue(key, value, { writeLocalMirror = false } = {}) {
    const hadValue = cache.has(key);
    const previousValue = hadValue ? cache.get(key) : undefined;

    if (serializeValue(previousValue) === serializeValue(value)) {
      return null;
    }

    if (typeof value === "undefined") {
      cache.delete(key);
    } else {
      cache.set(key, cloneValue(value));
    }

    if (writeLocalMirror) {
      writeLocalValue(key, value);
    }

    return buildChangeRecord(previousValue, value);
  }

  function notifyListeners(changes, source) {
    const changeKeys = Object.keys(changes || {});

    if (changeKeys.length === 0 || listeners.size === 0) {
      return;
    }

    const payload = {};

    for (let index = 0; index < changeKeys.length; index += 1) {
      const key = changeKeys[index];
      payload[key] = {
        oldValue: cloneValue(changes[key].oldValue),
        newValue: cloneValue(changes[key].newValue),
      };
    }

    listeners.forEach((listener) => {
      try {
        listener(payload, {
          source,
          hydrated,
        });
      } catch (error) {
        // Ignore listener failures to keep storage side effects isolated.
      }
    });
  }

  function clearFlushTimer() {
    if (!flushTimer) {
      return;
    }

    globalThis.clearTimeout(flushTimer);
    flushTimer = 0;
  }

  function schedulePendingWriteFlush() {
    if (!hydrated || flushInFlight || pendingWrites.size === 0 || flushTimer) {
      return;
    }

    flushTimer = globalThis.setTimeout(() => {
      flushTimer = 0;
      flushPendingWrites();
    }, WRITE_BACK_DELAY_MS);
  }

  async function flushPendingWrites() {
    clearFlushTimer();

    if (!hydrated || flushInFlight || pendingWrites.size === 0) {
      return false;
    }

    if (!extensionStorageInfo?.local) {
      pendingWrites.clear();
      return false;
    }

    flushInFlight = true;
    const writeBatch = {};

    pendingWrites.forEach((value, key) => {
      writeBatch[key] = cloneValue(value);
    });
    pendingWrites.clear();

    const success = await writeExtensionValues(writeBatch);
    flushInFlight = false;

    if (!success) {
      Object.keys(writeBatch).forEach((key) => {
        pendingWrites.set(key, cloneValue(writeBatch[key]));
      });
      schedulePendingWriteFlush();
      return false;
    }

    if (pendingWrites.size > 0) {
      schedulePendingWriteFlush();
    }

    return true;
  }

  function enqueueWrite(key, value) {
    if (!extensionStorageInfo?.local) {
      return;
    }

    pendingWrites.set(key, cloneValue(value));
    schedulePendingWriteFlush();
  }

  function installStorageChangeListener() {
    if (storageChangeListenerInstalled || !extensionStorageInfo?.onChanged) {
      return;
    }

    extensionStorageInfo.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes || typeof changes !== "object") {
        return;
      }

      const appliedChanges = {};

      for (let index = 0; index < knownKeys.length; index += 1) {
        const key = knownKeys[index];
        const change = changes[key];

        if (!change) {
          continue;
        }

        if (pendingWrites.has(key)) {
          continue;
        }

        const nextValue = Object.prototype.hasOwnProperty.call(change, "newValue")
          ? change.newValue
          : undefined;
        const applied = applyCachedValue(key, nextValue, {
          writeLocalMirror: true,
        });

        if (applied) {
          appliedChanges[key] = applied;
        }
      }

      notifyListeners(appliedChanges, "remote");
    });

    storageChangeListenerInstalled = true;
  }

  async function hydrateFromExtensionStorage() {
    if (!extensionStorageInfo?.local) {
      hydrated = true;
      return false;
    }

    const extensionValues = await readExtensionValues([
      ...knownKeys,
      STORAGE_MIGRATION_KEY,
    ]);
    const appliedChanges = {};

    for (let index = 0; index < knownKeys.length; index += 1) {
      const key = knownKeys[index];

      if (!Object.prototype.hasOwnProperty.call(extensionValues, key)) {
        continue;
      }

      if (pendingWrites.has(key)) {
        continue;
      }

      const applied = applyCachedValue(key, extensionValues[key], {
        writeLocalMirror: true,
      });

      if (applied) {
        appliedChanges[key] = applied;
      }
    }

    notifyListeners(appliedChanges, "hydrate");

    const backfill = {};

    for (let index = 0; index < knownKeys.length; index += 1) {
      const key = knownKeys[index];

      if (Object.prototype.hasOwnProperty.call(extensionValues, key)) {
        continue;
      }

      if (!cache.has(key)) {
        continue;
      }

      backfill[key] = cloneValue(cache.get(key));
    }

    if (extensionValues[STORAGE_MIGRATION_KEY] !== STORAGE_MIGRATION_VERSION) {
      backfill[STORAGE_MIGRATION_KEY] = STORAGE_MIGRATION_VERSION;
    }

    if (Object.keys(backfill).length > 0) {
      await writeExtensionValues(backfill);
    }

    hydrated = true;
    schedulePendingWriteFlush();
    return Object.keys(appliedChanges).length > 0;
  }

  function init() {
    if (initStarted) {
      return hydratePromise || Promise.resolve(hydrated);
    }

    initStarted = true;
    extensionStorageInfo = resolveExtensionStorageInfo();
    installStorageChangeListener();
    hydratePromise = hydrateFromExtensionStorage().catch(() => {
      hydrated = true;
      return false;
    });
    return hydratePromise;
  }

  seedCacheFromLocalStorage();

  const storage = {
    init,

    get(key, fallbackValue) {
      init();

      if (cache.has(key)) {
        return cloneValue(cache.get(key));
      }

      return cloneValue(fallbackValue);
    },

    set(key, value) {
      init();

      const applied = applyCachedValue(key, value, {
        writeLocalMirror: true,
      });

      if (!applied) {
        return false;
      }

      enqueueWrite(key, value);
      notifyListeners(
        {
          [key]: applied,
        },
        "local"
      );
      return true;
    },

    subscribe(listener) {
      init();

      if (typeof listener !== "function") {
        return () => {};
      }

      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  app.core.storage = storage;
})();
