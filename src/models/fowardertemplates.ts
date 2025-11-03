import { Entity, Column, EllipsiesBaseModelUUID } from "@similie/ellipsies";
import { ForwarderTargetKind, ForwarderTargetTemplates } from "./types";
import { UUID } from "src/utils/tools";
import { url } from "inspector";

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

  public seeds() {
    return [
      {
        name: "Parabl Forwarder",
        description:
          "Forwards payloads to Parabl for storage and early warning processing",
        enabled: true,
        condition: null,
        decoderIds: [
          "e563afc4-305f-46d8-86e9-9bc8efacf771",
          "d8ccb8e0-33fa-41f3-894a-cf1cacbffe74",
        ],
        mapIds: [
          "ff2b45c2-516d-45db-b158-d9727fcfd701",
          "b66c4262-e94f-48b9-b07f-c17123d9844e",
          "609f429b-2df2-4aab-bc37-561f0fb07c0f",
        ],
        transformerIds: null,
        targets: [
          {
            type: ForwarderTargetKind.HTTP,
            name: "Parabl Ingest Endpoint",
            method: "POST",
            urlTemplate: "https://my.parabl.io/api/v1/delivery",
            headers: [
              {
                key: "authentication",
                value: "",
                derived: true,
                required: false,
              },
              { key: "secret", value: "", derived: true, required: false },
            ],
          },
        ],
        retryPolicy: { backoffMs: 60000, maxAttempts: 3 },
        owner: "301e149b-a10d-41b8-a6f6-a47a7317ab95",
        id: "722292ed-434b-4251-8778-ba7261f4acf8",
      },
      {
        name: "Parable Site-Level Integration",
        description: "This allows us to globally integration the device",
        enabled: true,
        condition: "",
        decoderIds: [
          "e563afc4-305f-46d8-86e9-9bc8efacf771",
          "f1c82248-2e37-4901-9aca-91778ac06b4b",
        ],
        mapIds: [
          "ff2b45c2-516d-45db-b158-d9727fcfd701",
          "b66c4262-e94f-48b9-b07f-c17123d9844e",
          "609f429b-2df2-4aab-bc37-561f0fb07c0f",
        ],
        transformerIds: ["32d7a3d1-3977-439a-9de2-f04909d6693d"],
        targets: [
          {
            kind: "http",
            method: "POST",
            headers: [
              {
                key: "authentication",
                value: "",
                derived: true,
                required: false,
              },
              { key: "secret", value: "", derived: true, required: false },
            ],
            urlTemplate: "http://localhost:1337/api/v1/devices/simplify",
            bodyTemplate: [],
          },
        ],
        retryPolicy: { backoffMs: 1000, maxAttempts: 3 },
        owner: "301e149b-a10d-41b8-a6f6-a47a7317ab95",
        id: "04a285d1-2003-4cd0-a2ff-633dfff2b91d",
      },
    ];
  }
}
