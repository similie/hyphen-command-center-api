import mqtt, { MqttClient, type IClientOptions } from "mqtt";
import fs from "fs-extra";
import IdentityCertificates from "../models/certificate";
import SystemIdentity from "../models/identity";
import path from "path";
import { ServiceRunner } from "src/services";
import { mqttMessageIdentity } from "src/utils/tools";

export class MqttClientManager {
  private static client: MqttClient | null = null;
  private static serviceRunner: ServiceRunner;
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
      clientId: identity.identity,
      reconnectPeriod: 5000,
      keepalive: 60, // ping interval (seconds)
      clean: false, // persistent session
    };

    const url = `mqtts://${identity.host}:${identity.port}`;
    console.log(`🔗 Connecting to AWS IoT MQTT at ${url}`);

    this.client = mqtt.connect(url, options);

    this.serviceRunner = new ServiceRunner(this.client);

    this.client.on("connect", () => {
      console.log(`✅ Connected to AWS IoT Core as ${identity.identity}`);
      this.serviceRunner.connected = true;
      this.serviceRunner.setSubscriptions();
    });

    this.client.on("error", (err) => {
      console.error("❌ MQTT connection error:", err.message);
      this.serviceRunner.connected = false;
    });

    this.client.on("reconnect", () => {
      console.log("♻️  Attempting to reconnect to AWS IoT...");
      this.serviceRunner.connected = false;
    });

    this.client.on("close", () => {
      console.warn("⚠️  MQTT connection closed.");
      this.serviceRunner.connected = false;
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

      this.serviceRunner.addToQueue(topic, payload.toString());
    });

    return this.client;
  }

  static getClient() {
    return this.client;
  }
}
