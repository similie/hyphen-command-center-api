import {
  Entity,
  Column,
  EllipsiesBaseModelUUID,
  QueryAgent,
} from "@similie/ellipsies";
import { DeviceShadowManager, ServiceRunner } from "src/services";
import { UUID } from "@similie/hyphen-command-server-types";

@Entity("device_config", { schema: "public" })
export default class DeviceConfig extends EllipsiesBaseModelUUID {
  @Column("varchar", {
    name: "identity",
  })
  public identity: string;

  @Column("integer", {
    name: "state",
    default: 0,
  })
  public state: number;

  @Column("jsonb", {
    name: "meta",
    default: () => "'{}'",
  })
  public meta: Record<string, any>;

  @Column("varchar", {
    name: "action_name",
    nullable: true,
  })
  public actionName: string;

  @Column("varchar", {
    name: "action_type",
    nullable: true,
  })
  public actionType: string;

  @Column("varchar", {
    name: "topic",
    nullable: true,
  })
  public topic: string;

  @Column("text", {
    name: "value",
    nullable: true,
  })
  public value?: string;

  @Column("text", {
    name: "data",
    nullable: true,
  })
  public data: string;

  @Column("uuid", {
    name: "user",
    nullable: true,
  })
  public user: UUID;

  @Column("boolean", {
    name: "no_nullify",
    default: false,
  })
  public noNullify: boolean;

  public static async createConfig(config: Partial<DeviceConfig>) {
    const savedDevices: DeviceConfig[] = [];
    const bases = ServiceRunner.getSubscriptionsBase();
    const query = new QueryAgent<DeviceConfig>(DeviceConfig);
    for (const base of bases) {
      config.topic = DeviceConfig.getConfigTopic(config, base);
      const createdConfig = await query.create(config);
      await DeviceShadowManager.sendConfigDetails(
        createdConfig as DeviceConfig,
      );
      savedDevices.push(createdConfig as DeviceConfig);
    }
    // Implement your logic to send the device config
    return savedDevices.length === 1 ? savedDevices.pop() : savedDevices;
  }

  public static getConfigTopic(config: Partial<DeviceConfig>, base: string) {
    if (!config.actionName) {
      throw new Error("Action name is required");
    }
    return `${base}/Post/${config.actionType || "Function"}/${
      config.identity
    }/${config.actionName}`;
  }
}
