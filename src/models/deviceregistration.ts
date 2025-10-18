import { Entity, Column, EllipsiesBaseModelUUID } from "@similie/ellipsies";

@Entity("device_registration", { schema: "public" })
export default class DeviceRegistration extends EllipsiesBaseModelUUID {
  @Column("varchar", {
    name: "identity",
  })
  public identity: string;

  @Column("integer", {
    name: "function_count",
    default: 0,
  })
  public functionCount: number;

  @Column("integer", {
    name: "variable_count",
    default: 0,
  })
  public variableCount: number;

  @Column("jsonb", {
    name: "functions",
    default: () => "'[]'",
  })
  public functions: Array<Record<string, any>>;

  @Column("jsonb", {
    name: "variables",
    default: () => "'[]'",
  })
  public variables: Array<Record<string, any>>;

  @Column("jsonb", {
    name: "meta",
    default: () => "'{}'",
  })
  public meta: Record<string, any>;
}
