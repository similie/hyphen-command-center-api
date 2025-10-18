import { Entity, Column, EllipsiesBaseModelUUID } from "@similie/ellipsies";
import {
  ForwarderTarget,
  ParameterToForwardValue,
  ParameterValueOwnerBy,
} from "./types";
import { UUID } from "src/utils/tools";

@Entity("forwarder", { schema: "public" })
export default class Forwarder extends EllipsiesBaseModelUUID {
  @Column("varchar", { name: "name" }) name!: string;

  @Column("boolean", { name: "enabled", default: true }) enabled!: boolean;

  @Column("varchar", { name: "topic_pattern" })
  topicPattern!: string; // e.g. "Hy/Config/Time" or "Hy/+/+/Time" (we’ll match with MQTT wildcards)

  // optional filters/conditions
  @Column("text", { name: "condition", nullable: true })
  condition?: string; // js function: function when(context){ return boolean; }

  @Column("simple-array", { name: "decoder_ids", nullable: true })
  decoderIds?: string[]; // list of Decoder ids

  @Column("simple-array", { name: "map_ids", nullable: true })
  mapIds?: string[]; // list of ForwardMap ids

  @Column("jsonb", { name: "targets" })
  targets!: ForwarderTarget[]; // one or more outputs

  // optional retry policy / DLQ
  @Column("jsonb", { name: "retry_policy", nullable: true })
  retryPolicy?: { maxAttempts?: number; backoffMs?: number };

  @Column("jsonb", { name: "parameters", nullable: true, default: {} })
  parameters?: Record<ParameterToForwardValue, Record<string, string>>; // e.g. { topic: "Hy/DLQ" }

  @Column("uuid", {
    name: "owner",
    nullable: true,
  })
  public owner?: UUID;

  @Column("varchar", {
    name: "owned_by",
    nullable: true,
    maxLength: 32,
    default: ParameterValueOwnerBy.SYSTEM,
  })
  public ownedBy?: ParameterValueOwnerBy;

  @Column("integer", {
    name: "order",
    default: 0,
  })
  public order: number;

  @Column("uuid", {
    name: "template",
    nullable: true,
  })
  public template?: UUID;

  @Column("uuid", {
    name: "creator",
    nullable: true,
  })
  public creator?: UUID;

  // bind parameters by scope: "forwarder:<uuid>"
  // (read from ParameterValue table at runtime)
}
