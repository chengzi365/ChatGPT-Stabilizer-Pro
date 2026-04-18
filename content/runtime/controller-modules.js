(() => {
  const app = globalThis.__CSP__;

  function createControllerModuleSpecs() {
    return [
      {
        name: "route",
        methods: app.dom.routeControllerMethods,
      },
      {
        name: "pageAdapter",
        methods: app.dom.pageAdapterControllerMethods,
      },
      {
        name: "interaction",
        methods: app.dom.interactionControllerMethods,
      },
      {
        name: "commonEngine",
        methods: app.runtime.commonEngineControllerMethods,
      },
      {
        name: "runtimeProfile",
        methods: app.runtime.runtimeProfileControllerMethods,
      },
      {
        name: "modeRunner",
        methods: app.runtime.modeRunnerMethods,
      },
      {
        name: "metrics",
        methods: app.runtime.metricsControllerMethods,
      },
      {
        name: "trace",
        methods: app.runtime.traceControllerMethods,
      },
      {
        name: "degrade",
        methods: app.runtime.degradeControllerMethods,
      },
      {
        name: "recovery",
        methods: app.runtime.recoveryControllerMethods,
      },
      {
        name: "protection",
        methods: app.runtime.protectionControllerMethods,
      },
      {
        name: "sync",
        methods: app.runtime.syncControllerMethods,
      },
      {
        name: "syncPipeline",
        methods: app.runtime.syncPipelineControllerMethods,
      },
      {
        name: "observer",
        methods: app.dom.observerControllerMethods,
      },
      {
        name: "measurement",
        methods: app.dom.measurementControllerMethods,
      },
    ];
  }

  function getControllerModuleMethodNames(methods) {
    if (!methods || typeof methods !== "object") {
      return [];
    }

    return Object.keys(methods).filter((methodName) => methodName !== "constructor");
  }

  function installControllerModules(Controller) {
    if (typeof Controller !== "function") {
      throw new Error("Controller 安装失败：无效的 Controller 构造器。");
    }

    const reservedMethods = new Set(
      Object.getOwnPropertyNames(Controller.prototype).filter(
        (methodName) => methodName !== "constructor"
      )
    );
    const installedMethods = new Map();
    const moduleSpecs = createControllerModuleSpecs();

    for (let index = 0; index < moduleSpecs.length; index += 1) {
      const moduleSpec = moduleSpecs[index];
      const methods = moduleSpec.methods;

      if (!methods || typeof methods !== "object") {
        throw new Error(
          `Controller 模块注册失败：${moduleSpec.name} 未提供有效的方法集合。`
        );
      }

      const methodNames = getControllerModuleMethodNames(methods);

      for (let methodIndex = 0; methodIndex < methodNames.length; methodIndex += 1) {
        const methodName = methodNames[methodIndex];

        if (reservedMethods.has(methodName)) {
          throw new Error(
            `Controller 方法冲突：${moduleSpec.name}.${methodName} 与 Controller 自身方法重名。`
          );
        }

        if (installedMethods.has(methodName)) {
          throw new Error(
            `Controller 方法冲突：${moduleSpec.name}.${methodName} 与 ${installedMethods.get(methodName)}.${methodName} 重名。`
          );
        }

        installedMethods.set(methodName, moduleSpec.name);
      }

      Object.assign(Controller.prototype, methods);
    }

    return moduleSpecs.map((moduleSpec) => ({
      name: moduleSpec.name,
      methods: getControllerModuleMethodNames(moduleSpec.methods),
    }));
  }

  app.runtime.installControllerModules = installControllerModules;
})();
