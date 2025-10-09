import mqtt from "mqtt";
import SystemIdentity from "../models/identity";
export declare class MqttClientManager {
    private static client;
    static connect(identity: SystemIdentity): Promise<mqtt.MqttClient>;
    static getClient(): mqtt.MqttClient | null;
}
//# sourceMappingURL=client.d.ts.map