import {
  Entity,
  Column,
  EllipsiesBaseModelUUID,
  BeforeInsert,
} from "@similie/ellipsies";

import { generateUniqueId } from "src/utils/tools";

const defaultEndpoint = () => {
  return process.env.MQTT_IOT_ENDPOINT || "";
};

@Entity("identity", { schema: "public" })
export default class SystemIdentity extends EllipsiesBaseModelUUID {
  @Column("varchar", {
    name: "name",
    default: "Unnamed Connection",
  })
  public name: string;
  @Column("boolean", {
    name: "primary",
    default: false,
  })
  public primary: boolean;
  @Column("varchar", {
    name: "identity",
    unique: true,
  })
  public identity: string;
  @Column("varchar", {
    name: "host",
  })
  public host: string;
  @Column("integer", {
    name: "port",
  })
  public port: number;

  @BeforeInsert()
  setDefaults() {
    this.identity = this.identity || generateUniqueId();
    this.host = this.host || defaultEndpoint();
    this.port =
      this.port || process.env.MQTT_IOT_PORT
        ? +process.env.MQTT_IOT_PORT
        : 1883;
  }
}
