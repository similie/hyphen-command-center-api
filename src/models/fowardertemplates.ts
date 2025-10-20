import { Entity, Column, EllipsiesBaseModelUUID } from "@similie/ellipsies";
import { ForwarderTargetTemplates } from "./types";
import { UUID } from "src/utils/tools";

@Entity("forwarder_template", { schema: "public" })
export default class ForwarderTemplate extends EllipsiesBaseModelUUID {
  @Column("varchar", { name: "name" }) name!: string;

  @Column("text", { name: "description", nullable: true }) description?: string;

  @Column("boolean", { name: "enabled", default: true }) enabled!: boolean;
  // optional filters/conditions
  @Column("text", { name: "condition", nullable: true })
  condition?: string; // js function: function when(context){ return boolean; }

  @Column("simple-array", { name: "decoder_ids", nullable: true })
  decoderIds?: string[]; // list of Decoder ids

  @Column("simple-array", { name: "map_ids", nullable: true })
  mapIds?: string[]; // list of ForwardMap ids

  @Column("simple-array", { name: "transformer_ids", nullable: true })
  transformerIds?: string[]; // list of Transformer ids

  @Column("jsonb", { name: "targets" })
  targets!: ForwarderTargetTemplates[]; // one or more outputs

  // optional retry policy / DLQ
  @Column("jsonb", { name: "retry_policy", nullable: true })
  retryPolicy?: { maxAttempts?: number; backoffMs?: number };
  @Column("uuid", {
    name: "avatar",
    nullable: true,
  })
  public avatar?: UUID;
  @Column("uuid", {
    name: "owner",
    nullable: true,
  })
  public owner?: UUID;
}
