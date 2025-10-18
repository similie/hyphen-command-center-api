import { Entity, Column, EllipsiesBaseModelUUID } from "@similie/ellipsies";
import { UUID } from "src/utils/tools";
import * as msgpackr from "msgpackr";

import { ParameterValueOwnerBy } from "./types/parameter";
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
    console.log("Decoding with codec:", runFunction);

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
}
