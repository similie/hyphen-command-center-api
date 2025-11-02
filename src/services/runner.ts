import { type MqttClient } from "mqtt";
import { JobValue, QueueManager, jQueue } from "./queue";
import { DeviceShadowManager } from "./device-shadow";
import { SourceRepository } from "src/models";
import { BuildComposeManager } from "./docker-manager";
export class ServiceRunner {
  private readonly QUEUE_CONNECTION_MESSAGE = "mqtt-message";
  private readonly QUEUE_CONNECTION_MESSAGE_LOCAL = "mqtt-message-local";
  private readonly QUEUE_BUILD_COMPOSE_BUILDER = "build-compose";
  private _connected = false;
  private readonly _queue: jQueue;
  private _queue_local: jQueue;
  private _queue_compose: jQueue;
  private static readonly subscriptions = [
    ...(process.env.MQTT_SUBSCRIPTIONS
      ? process.env.MQTT_SUBSCRIPTIONS.split(",")
      : ["Hy/#"]),
  ];

  public static getSubscriptionsBase() {
    return this.subscriptions.map((s) => s.replace(/\/[#\+]*$/, ""));
  }

  public constructor(private readonly _client: MqttClient) {
    this._queue_local = QueueManager.get.queue(
      this.QUEUE_CONNECTION_MESSAGE_LOCAL,
    );
    this._queue = QueueManager.get.queue(this.QUEUE_CONNECTION_MESSAGE);
    QueueManager.get.worker(
      this.QUEUE_CONNECTION_MESSAGE_LOCAL,
      this.deviceProcessor.bind(this),
    );

    this._queue_compose = QueueManager.get.queue(
      this.QUEUE_BUILD_COMPOSE_BUILDER,
    );
    QueueManager.get.worker(
      this.QUEUE_BUILD_COMPOSE_BUILDER,
      ServiceRunner.buildComposePaths,
    );

    this._queue_compose.add(this.QUEUE_BUILD_COMPOSE_BUILDER, {});
  }

  public get connected() {
    return this._connected;
  }

  public set connected(connected: boolean) {
    this._connected = connected;
  }

  public get client() {
    return this._client;
  }

  public setSubscriptions() {
    for (const sub of ServiceRunner.subscriptions) {
      this.client.subscribe(sub);
    }
  }

  public teardownSubscriptions() {
    for (const sub of ServiceRunner.subscriptions) {
      this.client.unsubscribe(sub);
    }
  }

  private qOtions(topic: string) {
    return {
      timeout: 5000, // worker has 5s to finish once started
      removeOnComplete: true,
      removeOnFail: true,
      attempts: 1, // no retries
      delay: 0, // no delay to start
      jobId: `mqtt:${topic}:${Date.now()}`,
      lifo: true,
    };
  }
  /**
   * Build all repositories listed in SourceRepository
   */

  private static async buildComposePaths(_: JobValue) {
    const repositories = await SourceRepository.find();
    for (const repo of repositories) {
      try {
        await BuildComposeManager.buildRepositoryImage(repo);
      } catch (err) {
        console.error(`❌ Failed to build ${repo.name}:`, err);
      }
    }
  }

  private async deviceProcessor(job: JobValue) {
    const { topic, message } = job.data as {
      topic: string;
      message: Buffer<ArrayBufferLike>;
    };
    const broadcast = await DeviceShadowManager.get.processEvents(
      topic,
      message,
    );
    this._queue.add(
      this.QUEUE_CONNECTION_MESSAGE,
      broadcast,
      this.qOtions(topic),
    );
  }

  public async addToQueue(topic: string, message: Buffer<ArrayBufferLike>) {
    this._queue_local.add(this.QUEUE_CONNECTION_MESSAGE_LOCAL, {
      topic,
      message: message.toString(),
    });
  }
}
