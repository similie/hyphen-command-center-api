import { Entity, Column, EllipsiesBaseModelUUID } from "@similie/ellipsies";

@Entity("heartbeat", { schema: "public" })
export default class DeviceConfig extends EllipsiesBaseModelUUID {
  @Column("varchar", {
    name: "device",
  })
  public device: string;

  @Column("integer", {
    name: "date",
    default: 0,
  })
  public date: number;

  @Column("jsonb", {
    name: "network",
    default: () => "'{}'",
  })
  public network: Record<string, any>;

  @Column("jsonb", {
    name: "cell",
    default: () => "'{}'",
  })
  public cell: Record<string, any>;

  @Column("jsonb", {
    name: "pow",
    default: () => "'{}'",
  })
  public pow: Record<string, any>;

  @Column("jsonb", {
    name: "sys",
    default: () => "'{}'",
  })
  public sys: Record<string, any>;
}
