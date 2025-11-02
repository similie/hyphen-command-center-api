import { Entity, Column, EllipsiesBaseModelUUID } from "@similie/ellipsies";
import { UUID } from "src/utils/tools";
import * as msgpackr from "msgpackr";
import { RedisCache } from "src/services";
@Entity("decoder", { schema: "public" })
export default class Decoder extends EllipsiesBaseModelUUID {
  @Column("varchar", {
    name: "name",
    unique: true,
  })
  public name: string;

  @Column("text", {
    name: "description",
    nullable: true,
  })
  public description?: string;

  @Column("text", {
    name: "codec",
  })
  public codec: string;

  public static async decode(
    decoder: Decoder,
    context: {
      topic: string;
      message: Buffer;
      uid: string;
      device: any;
    },
  ) {
    const { codec } = decoder;

    const payload = context.message;

    const libs = {
      JSON,
      atob: (str: string) => Buffer.from(str, "base64").toString("utf8"),
      crypto,
      msgpackr,
      Buffer,
    };
    const runFunction = `"use strict"; 
        async function decode(payload, context, {JSON, atob, crypto, msgpackr, Buffer}) {
            ${
              codec.replace(/\\n/g, "\n").replace(/\\r/g, "\r") ||
              "return payload;"
            }
        };
        ; return decode(payload, context, libs);`;
    // console.log("Decoding with codec:", runFunction);

    try {
      // Build a sandboxed function
      const fn = new Function("payload", "context", "libs", runFunction);

      return fn(payload, context, libs);
    } catch (err) {
      console.error("Decoder error:", err);
      throw err;
    }
  }

  public static getDecoderKeyByName(name: string) {
    return `decoder:name:${name.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  }

  public static getDecoderKeyByUID(name: UUID) {
    return `decoder:name:${name}`;
  }

  public static async getById(uid: UUID) {
    const key = this.getDecoderKeyByUID(uid);
    const cached = await RedisCache.get<Decoder>(key);

    if (cached) {
      return cached;
    }
    const found = await this.findOne({ where: { id: uid } });
    if (found) {
      await RedisCache.set(key, found, 3600); // Cache for 1 hour
    }
    return found;
  }

  public static async getByName(name: string) {
    const key = this.getDecoderKeyByName(name);
    const cached = await RedisCache.get<Decoder>(key);
    if (cached) {
      return cached;
    }
    const found = await this.findOne({ where: { name } });
    if (found) {
      await RedisCache.set(key, found, 3600); // Cache for 1 hour
    }
    return found;
  }

  public seeds() {
    return [
      {
        name: "JSONParser",
        description: "Parses json types from string value",
        codec:
          "const message = payload.toString();\nreturn JSON.parse(message);",
        id: "e563afc4-305f-46d8-86e9-9bc8efacf771",
      },
      {
        name: "BufferToString",
        description:
          "This allows you to stringify the buffer before the the next decoder",
        codec: "return payload.toString();",
        id: "42ad308b-e826-44c7-9d25-78b6a9242621",
      },
      {
        name: "ParablPayload",
        description:
          "This parses the output off the device to a format that can be digested by Parabl",
        codec:
          "const values = {...payload.payload};\n" +
          "\n" +
          "values.date = payload.date;\n" +
          "\n" +
          "return values;",
        id: "d8ccb8e0-33fa-41f3-894a-cf1cacbffe74",
      },
      {
        name: "TransformBackFromRetention",
        description:
          "This converts our payload back to our original device payload",
        codec:
          "const values = {...payload};\n" +
          "const retained = {...payload.__retain};\n" +
          "delete values.__retain;\n" +
          "retained.payload = values;\n" +
          "return retained;",
        id: "32d7a3d1-3977-439a-9de2-f04909d6693d",
      },
      {
        name: "FlattenAndRetain",
        description: "This allows our mappers to transform our values",
        codec:
          "const values = {...payload};\n" +
          "const retain = {date: values.date, target: values.target, device: values.device, stale: values.stale || false};\n" +
          "const send = {...values.payload, __retain: retain};\n" +
          "return send;",
        id: "f1c82248-2e37-4901-9aca-91778ac06b4b",
      },
    ];
  }
}
