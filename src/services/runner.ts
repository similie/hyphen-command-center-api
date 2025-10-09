import { type MqttClient } from "mqtt";
import { QueueManager, jQueue } from "./queue";
import { generateUniqueUUID } from "src/utils/tools";
export class ServiceRunner {
  private readonly QUEUE_CONNECTION_MESSAGE = "mqtt-message";
  private _connected = false;
  private _queue: jQueue;
  private readonly subscriptions = [
    ...(process.env.MQTT_SUBSCRIPTIONS
      ? process.env.MQTT_SUBSCRIPTIONS.split(",")
      : ["Hy/#"]),
  ];
  public constructor(private readonly _client: MqttClient) {
    this._queue = QueueManager.get.queue(this.QUEUE_CONNECTION_MESSAGE);
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
    for (const sub of this.subscriptions) {
      console.log("I am setting these subscriptions", sub);
      this.client.subscribe(sub);
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

  public addToQueue(topic: string, message: string) {
    // console.log("");
    this._queue.add(
      this.QUEUE_CONNECTION_MESSAGE,
      { topic, message, _uid: generateUniqueUUID() },
      this.qOtions(topic),
    );
  }
}
