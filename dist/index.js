// import "reflect-metadata";
import { MqttClientManager } from "./mqtt";
import { AwsCertificateManager, startServer } from "./services";
import dotenv from "dotenv";
dotenv.config();
(async () => {
    await startServer();
    const identity = await AwsCertificateManager.instance.ensureDefaultIdentity();
    await MqttClientManager.connect(identity);
})();
