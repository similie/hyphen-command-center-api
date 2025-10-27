import {
  Entity,
  Column,
  EllipsiesBaseModelUUID,
  MoreThanOrEqual,
  QueryAgent,
} from "@similie/ellipsies";
import { RedisCache } from "src/services";
import { Device } from "./device";

@Entity("device_streams", { schema: "public" })
export default class DeviceStreams extends EllipsiesBaseModelUUID {
  @Column("varchar", {
    name: "device",
  })
  public device: string;
  @Column("varchar", {
    name: "topic",
  })
  public topic: string;
  @Column("bytea", {
    name: "payload",
  })
  public payload: Buffer;

  public static async logStream(
    identity: string,
    topic: string,
    payload: string | Buffer,
  ) {
    const agent = new QueryAgent<Device>(Device, { where: { identity } });
    await agent.updateByQuery({ lastTouched: new Date() });
    const stream = new DeviceStreams();
    stream.device = identity;
    stream.topic = topic;
    stream.payload = Buffer.from(payload); // payload could already be a Buffer
    const saved = await stream.save();
    return saved;
  }

  public static deviceCacheId(identity: string) {
    return `device_streams:online:${identity}`;
  }

  public static async lastOnline(identity: string) {
    const since = new Date(new Date().getTime() - 15 * 60 * 1000);
    console.log("Checking online status for", identity, "since", {
      device: identity,
      createdAt: { ">=": since },
    });
    const stream = await DeviceStreams.findOne({
      where: { device: identity, createdAt: MoreThanOrEqual(since) },
      order: { createdAt: "DESC" },
    });
    if (stream) {
      await RedisCache.set(DeviceStreams.deviceCacheId(identity), stream, 300); // Cache for 5 minutes
    }

    return stream ?? null;
  }
}
