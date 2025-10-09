import { QueueManager } from "./queue";
export class ServiceRunner {
    _client;
    QUEUE_CONNECTION_MESSAGE = "mqtt-message";
    _connected = false;
    _queue;
    subscriptions = [
        ...(process.env.MQTT_SUBSCRIPTIONS
            ? process.env.MQTT_SUBSCRIPTIONS.split(",")
            : ["Hy/#"]),
    ];
    constructor(_client) {
        this._client = _client;
        this._queue = QueueManager.get.queue(this.QUEUE_CONNECTION_MESSAGE);
    }
    get connected() {
        return this._connected;
    }
    set connected(connected) {
        this._connected = connected;
    }
    get client() {
        return this._client;
    }
    setSubscriptions() {
        for (const sub of this.subscriptions) {
            console.log("I am setting these subscriptions", sub);
            this.client.subscribe(sub);
        }
    }
    qOtions(topic) {
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
    addToQueue(topic, message) {
        // console.log("");
        this._queue.add(this.QUEUE_CONNECTION_MESSAGE, { topic, message }, this.qOtions(topic));
    }
}
