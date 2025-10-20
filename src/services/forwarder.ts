import {
  Decoder,
  Forwarder,
  ForwarderTemplate,
  ForwardMap,
  ParameterValue,
} from "src/models";
import {
  ForwarderTarget,
  ForwarderTargetKind,
  HttpTarget,
  MqttTarget,
  MsgCtx,
  ParameterValueOwnerBy,
} from "src/models/types";
import { In, QueryAgent } from "@similie/ellipsies";
import { SimilieQuery } from "./objectq";
import fetch, { RequestInit } from "node-fetch";
import { UUID } from "src/utils/tools";

export function mqttTopicMatch(topic: string, pattern: string) {
  // supports + and # per MQTT rules
  const esc = (s: string) => s.replace(/([$^\\.?*+()[\]{}|])/g, "\\$1");
  const re =
    "^" +
    pattern
      .split("/")
      .map((seg) => {
        if (seg === "+") return "[^/]+";
        if (seg === "#") return ".+";
        return esc(seg);
      })
      .join("/") +
    "$";
  return new RegExp(re).test(topic);
}

export class ForwarderService {
  private readonly fmQueryAgent: QueryAgent<ForwardMap>;
  private readonly dqQueryAgent: QueryAgent<Decoder>;
  constructor() {
    this.fmQueryAgent = new QueryAgent<ForwardMap>(ForwardMap, {});
    this.dqQueryAgent = new QueryAgent<Decoder>(Decoder, {});
  }
  async processMessageForDevice(
    owner: UUID,
    ownedBy: ParameterValueOwnerBy,
    ctx: MsgCtx,
    cb: (
      target: ForwarderTarget[],
      fwd: Forwarder,
      ctx: MsgCtx,
    ) => Promise<void>,
  ) {
    const forwarders = await Forwarder.find({
      where: { enabled: true, owner, ownedBy },
    });
    // we only process forwarders whose topic pattern matches the incoming topic
    const matches = forwarders.filter((f) =>
      mqttTopicMatch(ctx.topic, f.topicPattern),
    );
    // console.log("GOT THESE MATCHES", matches);
    if (!matches.length) return;

    for (const fwd of matches) {
      try {
        await this.runForwarder(fwd, ctx, cb);
      } catch (e) {
        // TODO: log, retry policy, DLQ, metrics
        console.error(`[Forwarder:${fwd.name}] failed`, e);
      }
    }
  }

  private convertToDecodeContent(ctx: MsgCtx) {
    return {
      ...ctx,
      uid: ctx._uid,
      message: ctx.message,
    };
  }

  private runMapper(
    transformed: Record<string, any>,
    maps: ForwardMap[],
    ctx: MsgCtx,
  ) {
    const hashedValues = new Map<string, string>();
    for (const map of maps) {
      const values = map.values || ({} as Record<string, string>);
      for (const [key, template] of Object.entries(values)) {
        if (hashedValues.has(key)) continue; // already set by a previous map
        hashedValues.set(
          key,
          ForwarderService.interpolate(template, {
            payload: transformed,
            context: ctx,
          }),
        );
      }
    }
    const sendTransformed = {};
    const keySet = new Set<string>();
    for (const key of Object.keys(transformed || {})) {
      if (keySet.has(key)) continue; // already set by a map
      keySet.add(key);
      const value = transformed[key];
      const mappedValue = hashedValues.get(key);
      sendTransformed[mappedValue || key] = value;
    }
    return sendTransformed;
  }

  private async pullKeys(fwd: Forwarder, ctx: MsgCtx) {
    const keys: Record<string, Record<string, string>> = {};
    const keyValues = await ParameterValue.find({
      where: {
        owner: fwd.id,
        ownedBy: ParameterValueOwnerBy.INTEGRATION,
      },
    });

    if (!keyValues.length) return keys;

    for (const kv of keyValues) {
      const originalVal = kv.value;
      const decoded = kv.decrypt();
      keys[kv.id] = {
        [kv.key]: decoded.value || originalVal,
      };
    }
    ctx.keys = keys;
    return keys;
  }

  private static parseHeaders(targetHeaders: string[] | UUID[], ctx: MsgCtx) {
    const headers: Record<string, string> = {};
    for (const h of targetHeaders || []) {
      if (!ctx.keys.hasOwnProperty(h)) {
        continue;
      }
      const head = ctx.keys[h];
      for (const [k, val] of Object.entries(head)) {
        const value = ForwarderService.interpolate(val, ctx);
        headers[k] = value;
      }
    }
    return headers;
  }

  private static createBodyContext(
    bodyTemplate: string[] | UUID[],
    ctx: MsgCtx,
  ) {
    const body: Record<string, string> = {
      ...(ctx.artifacts && typeof ctx.artifacts === "object"
        ? ctx.artifacts
        : ctx.payload && typeof ctx.payload === "object"
        ? ctx.payload
        : {}),
    };
    for (const key of bodyTemplate) {
      if (!ctx.keys.hasOwnProperty(key)) {
        continue;
      }
      const v = ctx.keys[key];
      for (const [k, val] of Object.entries(v)) {
        const value = ForwarderService.interpolate(val, ctx);
        body[k] = value;
      }
    }
    return body;
  }

  public async sendHttp(url: string, request: RequestInit) {
    const results = await fetch(url, request);
    if (!results.ok) {
      throw new Error(
        `HTTP request failed: ${results.status} ${results.statusText}`,
      );
    }
    try {
      return await results.json();
    } catch {
      return results.text();
    }
  }

  private static processHTTPTarget(target: HttpTarget, ctx: MsgCtx) {
    const url = ForwarderService.interpolate(target.urlTemplate, ctx);
    const headers = ForwarderService.parseHeaders(target.headers || [], ctx);
    const body = ForwarderService.createBodyContext(
      target.bodyTemplate || [],
      ctx,
    );
    target.deliverables = {
      url,
      headers,
      body,
      method: target.method,
    };
    return target;
  }

  private static processMQTTTarget(target: MqttTarget, ctx: MsgCtx) {
    const topic = ForwarderService.interpolate(target.topicTemplate, ctx);
    const body = ForwarderService.createBodyContext(
      target.payloadTemplate || [],
      ctx,
    );
    target.deliverables = {
      topic,
      body: JSON.stringify(body),
      url: "",
      headers: {},
    };
    return target;
  }

  public static renderTargetDeliverables(target: ForwarderTarget, ctx: MsgCtx) {
    if (target.kind === ForwarderTargetKind.MQTT) {
      return ForwarderService.processMQTTTarget(target as MqttTarget, ctx);
    } else if (target.kind === ForwarderTargetKind.HTTP) {
      return ForwarderService.processHTTPTarget(target as HttpTarget, ctx);
    }
    throw new Error(`Unknown target kind`);
  }

  private async runForwarder(
    fwd: Forwarder,
    ctx: MsgCtx,
    cb: (
      target: ForwarderTarget[],
      fwd: Forwarder,
      ctx: MsgCtx,
    ) => Promise<void>,
  ) {
    // 1) Decode
    let decoded: any = ctx.message;
    if (Buffer.isBuffer(decoded)) decoded = decoded; // keep; decoders handle buffers/strings

    await this.pullKeys(fwd, ctx);

    const template = await ForwarderTemplate.findOne({
      where: { id: fwd.template },
    });
    if (!template) {
      return;
    }
    ctx.template = template;
    if (template.decoderIds?.length) {
      const decoders = await Decoder.find({
        where: { id: In(template.decoderIds) },
      });
      for (const dec of decoders) {
        if (!dec) continue;
        // each decoder takes the output of the previous as input
        ctx.message = await Decoder.decode(
          dec,
          this.convertToDecodeContent(ctx),
        );
        ctx.payload = ctx.message; // also set payload for templates
      }
    }

    if (template.condition) {
      const ok = await SimilieQuery.evaluate(template.condition, ctx);
      if (!ok) return;
    }

    // 2) Map transforms
    if (template.mapIds?.length) {
      const maps = await ForwardMap.find({
        where: { id: In(template.mapIds) },
      });
      //   console.log("GOT THESE MAPS", ctx.payload, fwd.mapIds, maps);
      if (
        typeof ctx.payload === "object" &&
        !Array.isArray(ctx.payload) &&
        maps.length
      ) {
        ctx.message = this.runMapper(ctx.message, maps, ctx);
        ctx.payload = ctx.message;
      }
    }

    if (template.transformerIds?.length) {
      const decoders = await Decoder.find({
        where: { id: In(template.transformerIds) },
      });
      for (const dec of decoders) {
        if (!dec) continue;
        // each decoder takes the output of the previous as input
        ctx.message = await Decoder.decode(
          dec,
          this.convertToDecodeContent(ctx),
        );
        ctx.payload = ctx.message; // also set payload for templates
      }
    }

    await cb(fwd.targets || [], fwd, ctx);
  }

  public static interpolate(template: string, bag: Record<string, any>) {
    return template.replace(/\{([^}]+)\}/g, (_, expr) => {
      // allow literal payload injection (already JSON string)
      if (expr === "payload") {
        return typeof bag.payload === "string"
          ? bag.payload
          : JSON.stringify(bag.payload);
      }
      const val = SimilieQuery.get(bag, expr.trim());
      return val == null ? "" : String(val);
    });
  }
}
