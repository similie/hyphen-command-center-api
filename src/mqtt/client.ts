import mqtt, { MqttClient, type IClientOptions } from "mqtt";
import IdentityCertificates from "../models/certificate";
import SystemIdentity from "../models/identity";
import { ServiceRunner } from "src/services";
import {
  LeaderElector,
  generateUniqueId,
} from "@similie/hyphen-command-server-types";

export class MqttClientManager {
  private static client: MqttClient | null = null;
  private static serviceRunner: ServiceRunner;
  private static elector = LeaderElector.get();
  private static onElected = () => {
    console.log("👑 Became leader – subscribing to MQTT.");
    this.serviceRunner.setSubscriptions();
  };

  private static onRevoked = () => {
    console.log("🥾 Lost leadership – unsubscribing from MQTT.");
    this.serviceRunner.teardownSubscriptions();
  };
  static async connect(identity: SystemIdentity) {
    const cert = await IdentityCertificates.findOne({
      where: { identity: identity.identity },
    });
    if (!cert)
      throw new Error(`No certificate found for identity ${identity.identity}`);

    const options: IClientOptions = {
      host: identity.host,
      port: identity.port,
      protocol: "mqtts",
      key: Buffer.from(cert.key),
      cert: Buffer.from(cert.cert),
      ca: Buffer.from(cert.ca),
      clientId: identity.identity + "-" + generateUniqueId(6),
      reconnectPeriod: 5000,
      keepalive: 60, // ping interval (seconds)
      clean: false, // persistent session
    };

    const url = `mqtts://${identity.host}:${identity.port}`;
    console.log(`🔗 Connecting to AWS IoT MQTT at ${url}`);
    // const isLeader = await LeaderElector.isLeader();
    // console.log("I am leader:", isLeader);
    this.client = mqtt.connect(url, options);

    this.serviceRunner = new ServiceRunner(this.client);

    // elsewhere
    if (LeaderElector.get().amLeader()) {
      // just a read; do not start work here, wait for 'elected'
      console.log("✅ This instance is the leader.");
    }

    this.client.on("connect", async () => {
      console.log(`✅ Connected to AWS IoT Core as ${identity.identity}`);
      this.serviceRunner.connected = true;

      try {
        await this.elector.shutdown(); // ensure clean slate
      } catch (err) {
        console.error("⚠️ Error restarting leader elector:", err);
      }

      try {
        // Always (re)bind listeners to the *current* elector emitter
        // since it may have been recreated by init()
        this.elector.off("elected", this.onElected);
        this.elector.off("revoked", this.onRevoked);
        await this.elector.init(process.env.REDIS_CONFIG_URL!);
      } catch (err) {
        console.error("⚠️ Error initializing leader elector:", err);
      }

      /**
       * 👑 Leader election won
       * In a multi-instance setup, only the leader should subscribe to MQTT topics
       */
      this.elector.on("elected", this.onElected);
      this.elector.on("revoked", this.onRevoked);
    });

    this.client.on("error", (err) => {
      console.error("❌ MQTT connection error:", err.message);
      this.serviceRunner.connected = false;
    });

    this.client.on("reconnect", () => {
      console.log("♻️  Attempting to reconnect to AWS IoT...");
      this.serviceRunner.connected = false;
    });

    this.client.on("close", async () => {
      console.warn("⚠️  MQTT connection closed.");
      this.serviceRunner.connected = false;
      try {
        await this.elector.shutdown();
      } catch (err) {
        console.error("Error shutting down elector:", err);
      }
    });

    this.client.on("offline", () => {
      console.warn("📴 MQTT client is offline.");
      this.serviceRunner.connected = false;
    });

    this.client.on("end", () => {
      console.warn("🔌 MQTT client ended, will not reconnect automatically.");
      this.serviceRunner.connected = false;
    });

    this.client.on("message", (topic, payload) => {
      console.log(`📩 [${topic}] ${payload.toString()}`);

      this.serviceRunner.addToQueue(topic, payload);
    });

    return this.client;
  }

  static getClient() {
    return this.client;
  }
}
