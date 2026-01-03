import { MqttClientManager } from "./mqtt";
import {
  AwsCertificateManager,
  startServer,
  // RedisCache,
  CertificateManager,
} from "./services";
import dotenv from "dotenv";
// import { LeaderElector } from "./services/leader-lock";
import {
  loadModulesFromEnv,
  shutdownModules,
  RedisCache,
  LeaderElector,
  type ModuleContext,
} from "@similie/hyphen-command-server-types";
dotenv.config();

(async () => {
  const ellipsies = await startServer();
  // Initialize Certificate Manager. You can swap out AwsCertificateManager for another implementation if needed.
  CertificateManager.init(new AwsCertificateManager());

  const identity = await CertificateManager.instance.ensureDefaultIdentity();

  await MqttClientManager.connect(identity);
  await RedisCache.init();

  // ensure leader elector is initialized (you likely already do this lazily)
  const leader = LeaderElector.get();

  const ctx: ModuleContext = {
    ellipsies,
    redis: RedisCache,
    leader,
    identity: identity,
    log: (msg, ...extra) => console.log(msg, ...(extra ?? [""])),
  };

  const loaded = await loadModulesFromEnv(ctx);
  await ellipsies.start();
  process.on("SIGTERM", async () => {
    try {
      await shutdownModules(ctx, loaded);
    } catch {}
    try {
      await ellipsies.shutdown();
      await leader?.shutdown?.();
    } catch {}
    process.exit(0);
  });
})();
