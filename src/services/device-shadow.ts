import {
  Decoder,
  Device,
  DeviceConfig,
  DeviceRegistration,
  DeviceSensor,
  DeviceStream,
  Forwarder,
  Heartbeat,
} from "src/models";
import { JobValue, jQueue, QueueManager } from "./queue";
import { RedisCache } from "./redis";
import {
  generateUniqueUUID,
  MQTTFunctionalResponse,
  UUID,
} from "src/utils/tools";
import { MqttClientManager } from "src/mqtt";
import { QueryAgent } from "@similie/ellipsies";
import {
  DeviceConfigEnum,
  ForwarderDeliverables,
  ForwarderTarget,
  ForwarderTargetKind,
  MsgCtx,
  ParameterValueOwnerBy,
} from "src/models/types";
import fetch, { RequestInit } from "node-fetch";
import { ForwarderService } from "./forwarder";
import { CertificateManager } from "./certificate-manager";
export class DeviceShadowManager {
  private static _instance: DeviceShadowManager | undefined;
  private readonly QUEUE_CONNECTION_MESSAGE = "process-device-stream";
  private static readonly QUEUE_FORWARD_REQUEST = "process-device-forward";
  private static readonly QUEUE_FORWARD_ARTIFACTS =
    "process-device-forward-artifacts";
  private readonly QUEUE_CONNECTION_MESSAGE_CONFIG =
    "process-device-config-stream";
  private readonly QUEUE_CONFIG_PROCESS = "processed-pending-config";
  private readonly QUEUE_DEVICE_SENSOR = "processed-device-sensor";
  private readonly _queue: jQueue;
  private readonly _queueConfig: jQueue;
  private readonly _configQueue: jQueue;
  private readonly _sensorQueue: jQueue;
  private static _forwardQueue: jQueue;
  private static _forwardQueueArtifacts: jQueue;
  private constructor() {
    DeviceShadowManager._forwardQueue = QueueManager.get.queue(
      DeviceShadowManager.QUEUE_FORWARD_REQUEST,
    );
    DeviceShadowManager._forwardQueueArtifacts = QueueManager.get.queue(
      DeviceShadowManager.QUEUE_FORWARD_ARTIFACTS,
    );
    this._queue = QueueManager.get.queue(this.QUEUE_CONNECTION_MESSAGE);
    this._configQueue = QueueManager.get.queue(this.QUEUE_CONFIG_PROCESS);
    this._sensorQueue = QueueManager.get.queue(this.QUEUE_DEVICE_SENSOR);
    this._queueConfig = QueueManager.get.queue(
      this.QUEUE_CONNECTION_MESSAGE_CONFIG,
      QueueManager.get.delaySecondsOpt(5),
    );
    QueueManager.get.worker(
      this.QUEUE_CONNECTION_MESSAGE,
      DeviceShadowManager.processDeviceStream,
      QueueManager.get.concurrentOpt(10),
    );

    QueueManager.get.worker(
      this.QUEUE_CONNECTION_MESSAGE_CONFIG,
      DeviceShadowManager.processConfig,
    );

    QueueManager.get.worker(
      DeviceShadowManager.QUEUE_FORWARD_REQUEST,
      DeviceShadowManager.processPayloadForwardMessage,
    );
  }
  static get get(): DeviceShadowManager {
    if (!this._instance) {
      this._instance = new DeviceShadowManager();
    }
    return this._instance;
  }

  private isRegistrationTopic(deviceId: string, topic: string) {
    return topic.includes(`/Post/Register/${deviceId}`);
  }

  private isHeartbeatTopic(topic: string) {
    return topic.includes(`/Post/Heartbeat`);
  }

  private isConfigTopic(topic: string) {
    return topic.includes(`/Config/`);
  }

  private isMaintenanceTopic(topic: string) {
    return topic.includes(`/Post/Maintain`);
  }

  private isDeliveryTopic(topic: string) {
    return topic.includes(`/Post/`);
  }

  private isFunctionTopic(deviceId: string, topic: string) {
    return topic.includes(`/Post/Function/${deviceId}/`);
  }

  private isVariableTopic(deviceId: string, topic: string) {
    return topic.includes(`/Post/Variable/${deviceId}/`);
  }

  private isConfigActionTopic(deviceId: string, topic: string) {
    return (
      this.isFunctionTopic(deviceId, topic) ||
      this.isVariableTopic(deviceId, topic)
    );
  }

  private functionResultsTopic(deviceId: string) {
    return `/Post/Function/Result/${deviceId}`;
  }

  private variableResultsTopic(deviceId: string) {
    return `/Post/Variable/Result/${deviceId}`;
  }

  private deviceSyncTopic(topic: string) {
    return topic.includes(`/Get/Devices`);
  }

  private isVariableOrFunctionTopic(topic: string, deviceId: string) {
    return (
      topic.includes(this.functionResultsTopic(deviceId)) ||
      topic.includes(this.variableResultsTopic(deviceId))
    );
  }

  private async deviceFromIdentity(identity: string): Promise<Device | null> {
    let device = await RedisCache.get<Device>(Device.deviceCacheId(identity));
    if (device) {
      return device;
    }
    const agent = new QueryAgent<Device>(Device, {});
    device = await agent.findOneBy({ identity });
    // device = await Device.findOne({ where: { identity } });
    if (device) {
      await RedisCache.set(Device.deviceCacheId(identity), device, 86400); // Cache for 24 hours
    }
    return device || null;
  }

  private attemptToParseIdFromTopic(topic: string): string | null {
    const parts = topic.split("/");
    const topicMatch = topic.match(/[a-f0-9]{24,32}/i);
    for (const part of parts) {
      if (part.length >= 24 && part.length <= 32 && /^[a-f0-9]+$/i.test(part)) {
        return part;
      }
    }
    if (topicMatch) {
      return topicMatch[0];
    }
    return null;
  }

  private async pullDevice(message: string, topic: string) {
    try {
      const payload = JSON.parse(message);
      const { device, id, date } = payload;
      const foundId = this.attemptToParseIdFromTopic(topic);
      if (!device && !id && !foundId) {
        return null;
      }
      const foundDevice = await this.deviceFromIdentity(
        device || id || foundId,
      );
      // our devices are cached, so we need to update the lastTouched field
      if (foundDevice) {
        foundDevice.lastTouched =
          date && typeof date === "string" ? new Date(date) : new Date();
      }

      return foundDevice;
    } catch (error) {
      const foundDevice = await this.deviceFromIdentity(message);
      return foundDevice;
    }
  }

  private applyStream(
    topic: string,
    message: Buffer<ArrayBufferLike>,
    device?: Device | null,
  ) {
    if (!device) {
      return;
    }
    DeviceStream.logStream(device.identity, topic, message)
      .then(() => {
        console.log(
          `Logged stream for device ${device?.identity} on topic ${topic}`,
        );
      })
      .catch((err) => {
        console.error("Error logging device stream:", err);
      });
  }

  /*
  *{
  "value": -1,
  "key": "setLowPowerMode",
  "id": "73e32127dd07184e9d207604",
  "request": "123"
}
*/

  private async processRequest(
    _topic: string,
    message: Buffer<ArrayBufferLike>,
    device: Device,
  ) {
    try {
      const msgStr = message.toString();
      const payload = JSON.parse(msgStr) as MQTTFunctionalResponse;
      if (payload.id !== device.identity) {
        return;
      }

      const agent = new QueryAgent<DeviceConfig>(DeviceConfig, {});
      const config = await agent.findOneBy({ id: payload.request as UUID });

      if (!config || config.state !== DeviceConfigEnum.WAITING) {
        return;
      }

      config.value = String(payload.value);
      config.state = DeviceConfigEnum.RESOLVED; // Mark as resolved
      await config.save();
      await this._configQueue.add(this.QUEUE_CONFIG_PROCESS, config);
    } catch (e) {
      console.error("Error processing config request response:", e);
    }
  }

  private async saveHeartbeat(message: Buffer<ArrayBufferLike>) {
    // Implement the logic to save the heartbeat data
    try {
      const msgStr = message.toString();
      const payload = JSON.parse(msgStr) as Partial<Heartbeat>;
      const agent = new QueryAgent<Heartbeat>(Heartbeat, {});
      const hb = await agent.create(payload);
      return hb;
    } catch (e) {
      console.error("Error saving Heartbeat", e);
    }
    return null;
  }

  private async checkTopicForwarderForDevice(
    topic: string,
    message: Buffer<ArrayBufferLike>,
    device: Device,
  ) {
    // Implement the logic to check and forward the data to onward systems
  }

  private async checkTopicForDeviceConfig(
    topic: string,
    message: Buffer<ArrayBufferLike>,
    device: Device,
  ) {
    // Implement the logic to check to respond to config requests
  }

  private async checkTopicForDeviceFormMaintenance(
    topic: string,
    message: Buffer<ArrayBufferLike>,
    device: Device,
  ) {
    // Implement the logic to check to respond to maintenance requests
  }

  private async createRegistrationEntry(message: Buffer<ArrayBufferLike>) {
    try {
      const msgStr = message.toString();
      const payload = JSON.parse(msgStr) as Partial<
        DeviceRegistration & { id?: UUID }
      >;
      const agent = new QueryAgent<DeviceRegistration>(DeviceRegistration, {});
      payload.identity = payload.id;
      delete payload.id;
      if (!payload.identity) {
        throw new Error("No identity provided in registration payload");
      }
      return await agent.create(payload);
    } catch (e) {
      console.error("Error saving DeviceRegistration", e);
    }
    return null;
  }

  private async setDevicesApplied(
    message: Buffer<ArrayBufferLike>,
    device: Device,
  ) {
    try {
      const msgStr = message.toString();
      const messageValue = JSON.parse(msgStr) as {
        device: string;
        payload: Record<string, string>;
      };
      console.log("Setting device applied with payload:", messageValue);
      if (!messageValue.payload) {
        return;
      }

      const sensors: DeviceSensor[] = [];
      for (const [_key, value] of Object.entries(messageValue.payload)) {
        const ds = await DeviceSensor.applyDeviceSync(value, device);
        if (ds) {
          sensors.push(ds);
        }
      }

      this._sensorQueue.add(this.QUEUE_DEVICE_SENSOR, { sensors, device });
    } catch (e) {
      console.error("Error setting devices applied", e);
    }
  }

  private async processActions(
    topic: string,
    message: Buffer<ArrayBufferLike>,
    device: Device,
  ) {
    if (this.isVariableOrFunctionTopic(topic, device.identity)) {
      await this.processRequest(topic, message, device);
    } else if (this.isRegistrationTopic(device.identity, topic)) {
      // Handle registration topic
      console.log(`Device ${device.identity} registered.`);
      await this.createRegistrationEntry(message);
    } else if (this.isHeartbeatTopic(topic)) {
      // Handle heartbeat topic
      console.log(`Device ${device.identity} heartbeat received.`);
      await this.saveHeartbeat(message);
    } else if (this.isConfigTopic(topic)) {
      // Handle config topic
      console.log(`Device ${device.identity} config received.`);
      await this.checkTopicForDeviceConfig(topic, message, device);
    } else if (this.isMaintenanceTopic(topic)) {
      console.log(`Device ${device.identity} maintenance received.`);
      this.checkTopicForDeviceFormMaintenance(topic, message, device);
    } else if (this.isDeliveryTopic(topic)) {
      console.log(`Device ${device.identity} delivery received.`);
      await this.checkTopicForwarderForDevice(topic, message, device);
    } else if (this.deviceSyncTopic(topic)) {
      await this.setDevicesApplied(message, device);
    }
  }

  private static async runForwardJob(
    data: {
      targets: ForwarderTarget[];
      fwd: Forwarder;
      ctx: MsgCtx;
      attempts: number;
    },
    delayMs: number = 0,
  ) {
    {
      DeviceShadowManager._forwardQueue.add(
        DeviceShadowManager.QUEUE_FORWARD_REQUEST,
        data,
        {
          removeOnComplete: true,
          removeOnFail: 1,
          delay: delayMs,
        },
      );
    }
  }

  public static async sendFunctionToDevice(
    device: Device,
    func: string,
    body: string,
  ) {
    const topic = `/Post/Function/${device.identity}/${func}/`;
  }

  public static async sendMQTTMessage(topic: string, message: string = "") {
    await MqttClientManager.getClient().publish(topic, message);
  }

  private static appendConfigTopic(topic: string, identity: string) {
    return `${topic.endsWith("/") ? topic : `${topic}/`}${identity}`;
  }

  public static async sendConfigDetails(config: DeviceConfig & { id: UUID }) {
    return DeviceShadowManager.sendMQTTMessage(
      DeviceShadowManager.appendConfigTopic(config.topic, config.id),
      config.data,
    );
  }

  private static async processConfig(job: JobValue) {
    const data = job.data as DeviceConfig & { id: UUID };
    const agent = new QueryAgent<DeviceConfig>(DeviceConfig, {});
    // we are going to re-fetch the device to ensure we have the latest
    const config = await agent.findOneById(data.id);
    if (!config || config.state !== DeviceConfigEnum.WAITING) {
      return;
    }
    // now send the MQTT message
    try {
      await DeviceShadowManager.sendMQTTMessage(
        DeviceShadowManager.appendConfigTopic(config.topic, config.id),
        config.data,
      );
    } catch (e) {
      console.error("Error sending MQTT message:", e);
    }
  }

  private async applyPendingConfig(device: Device): Promise<DeviceConfig[]> {
    const agent = new QueryAgent<DeviceConfig>(DeviceConfig, {
      where: { state: DeviceConfigEnum.WAITING, identity: device.identity },
    });
    // we are going to re-fetch the device to ensure we have the latest
    const values = (await agent.getObjects()) as DeviceConfig[];

    console.log(
      `Found ${values.length} pending config(s) for device ${device.identity}`,
    );
    for (const config of values) {
      // Process each pending config
      console.log(
        `Processing pending config for device ${device.identity}:`,
        config.id,
      );
      await this._queueConfig.add(this.QUEUE_CONNECTION_MESSAGE_CONFIG, config);
    }
    return values;
  }

  private static async processDeviceStream(job: JobValue) {
    const { topic, message, device } = job.data as {
      topic: string;
      message: Buffer<ArrayBufferLike>;
      device: Device | null;
    };

    if (!device) {
      return;
    }

    const shadowProcess = DeviceShadowManager.get;
    await shadowProcess.processActions(topic, message, device);
    if (shadowProcess.isConfigActionTopic(device.identity, topic)) {
      return;
    }
    await shadowProcess.applyPendingConfig(device);
  }

  public static async sendHttp(url: string, request: RequestInit) {
    const results = await fetch(url, request);
    if (!results.ok) {
      throw new Error(
        `HTTP request failed: ${results.status} ${results.statusText}`,
      );
    }
    try {
      return await results.json();
    } catch {
      return results.text();
    }
  }

  public static sendMQTTForwardMessage({ topic, body }: ForwarderDeliverables) {
    if (!topic) {
      throw new Error("No topic provided for MQTT message");
    }
    return DeviceShadowManager.sendMQTTMessage(topic, body as string);
  }

  public static sendHttpMessage({
    url,
    headers,
    body,
    method = "POST",
  }: ForwarderDeliverables) {
    return DeviceShadowManager.sendHttp(url, {
      headers,
      body: JSON.stringify(body),
      method,
    });
  }

  private static async processPayloadForwardMessage(job: JobValue) {
    const data = job.data as {
      targets: ForwarderTarget[];
      fwd: Forwarder;
      ctx: MsgCtx;
      attempts: number;
    };

    const targets = [...data.targets];

    try {
      for (const target of targets) {
        // we do this at runtime to ensure we have the latest context
        const { deliverables } = ForwarderService.renderTargetDeliverables(
          target,
          data.ctx,
        );
        if (!deliverables) {
          continue;
        }
        if (target.kind === ForwarderTargetKind.HTTP) {
          data.ctx.artifacts = await DeviceShadowManager.sendHttpMessage(
            deliverables,
          );
          DeviceShadowManager._forwardQueueArtifacts.add(
            DeviceShadowManager.QUEUE_FORWARD_ARTIFACTS,
            {
              target,
              deliverables,
              ctx: data.ctx,
              fwd: data.fwd,
            },
            {
              removeOnComplete: true,
              removeOnFail: 1,
            },
          );
        } else if (target.kind === ForwarderTargetKind.MQTT) {
          await DeviceShadowManager.sendMQTTForwardMessage(deliverables);
        }
        // we remove the target once processed
        data.targets.unshift();
      }
    } catch (e) {
      console.error("Error processing forwarder targets:", e);
      const { template } = data.ctx;
      if (!template) {
        return;
      }
      const maxAttempts = template.retryPolicy?.maxAttempts || 0;
      const delayMs = template.retryPolicy?.backoffMs || 5 * 60 * 1000; // default to 5 minutes

      if (data.attempts > maxAttempts && maxAttempts !== -1) {
        return console.log("Max attempts reached");
      }
      console.log("Reattempting forwarder job in", delayMs, "ms");
      await DeviceShadowManager.runForwardJob(
        {
          targets: data.targets,
          fwd: data.fwd,
          ctx: data.ctx,
          attempts: data.attempts + 1,
        },
        delayMs,
      );
    }
  }

  private async processForwarderCallback(
    targets: ForwarderTarget[],
    fwd: Forwarder,
    ctx: MsgCtx,
  ) {
    await DeviceShadowManager.runForwardJob({
      targets: [...targets],
      ctx: { ...ctx },
      fwd: fwd,
      attempts: 0,
    });
  }

  private async processForwarder(
    device: Device,
    payload: {
      topic: string;
      message: Buffer<ArrayBufferLike>;
      _uid: UUID;
      device: Device;
    },
  ) {
    const forwarder = new ForwarderService();

    try {
      await forwarder.processMessageForDevice(
        device.id,
        ParameterValueOwnerBy.DEVICE,
        { ...payload },
        this.processForwarderCallback.bind(this),
      );

      const systemID = CertificateManager.instance.id;
      if (!systemID) {
        return;
      }
      await forwarder.processMessageForDevice(
        systemID as UUID,
        ParameterValueOwnerBy.SYSTEM,
        { ...payload },
        this.processForwarderCallback.bind(this),
      );
    } catch (e) {
      console.error("Error processing forwarder:", e);
    }
  }

  public async processEvents(topic: string, message: Buffer<ArrayBufferLike>) {
    const messageStr = message.toString();
    const device = await this.pullDevice(messageStr, topic);
    await this.applyStream(topic, message, device);
    const send = {
      topic,
      message,
      _uid: generateUniqueUUID(),
      device,
    };

    if (device) {
      // Device found, process the event
      this._queue.add(this.QUEUE_CONNECTION_MESSAGE, {
        ...send,
        message: message.toString(),
      });
      await this.processForwarder(device, send);
    }
    return send;
  }
}
