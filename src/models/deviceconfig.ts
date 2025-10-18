import { Entity, Column, EllipsiesBaseModelUUID } from "@similie/ellipsies";
import { UUID } from "src/utils/tools";

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

  public static getConfigTopic(config: Partial<DeviceConfig>, base: string) {
    if (!config.actionName) {
      throw new Error("Action name is required");
    }
    return `${base}/Post/${config.actionType || "Function"}/${
      config.identity
    }/${config.actionName}`;
  }
}
