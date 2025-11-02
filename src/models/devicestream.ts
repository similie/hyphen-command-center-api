import {
  Entity,
  Column,
  EllipsiesBaseModelUUID,
  MoreThanOrEqual,
  QueryAgent,
  DataSourceRegistry,
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

  public static async getWeeklyStreamCount(): Promise<
    {
      week_start_date: string;
      week_label: string;
      date: string;
      weekday_name: string;
      stream_count: number;
    }[]
  > {
    // return [];
    const query = `WITH week_starts AS (
  -- Determine the Sunday-start of each week for the last 4 full weeks + current week
  SELECT 
    (date_trunc('week', current_date + interval '1 day') - interval '1 day')
      - (n * interval '1 week') AS week_start
  FROM generate_series(0, 3) AS n
),
all_days AS (
  -- Generate every day within those weeks
  SELECT
    ws.week_start,
    (ws.week_start + (d * interval '1 day'))::date AS day_date
  FROM week_starts ws
  CROSS JOIN generate_series(0, 6) AS d
),
stream_counts AS (
  -- Aggregate stream counts by day
  SELECT
    created_at::date AS day_date,
    COUNT(*) AS cnt
  FROM "device_streams"
  WHERE created_at::date >= (
          SELECT MIN(week_start)::date FROM week_starts
        )
    AND created_at::date <= current_date
  GROUP BY created_at::date
)
SELECT
  ad.week_start       AS week_start_date,
  to_char(ad.week_start, 'YYYY-MM-DD') AS week_label,
  ad.day_date         AS date,
  to_char(ad.day_date, 'FMDay')        AS weekday_name,
  COALESCE(sc.cnt, 0)::int             AS stream_count
FROM all_days ad
LEFT JOIN stream_counts sc
  ON sc.day_date = ad.day_date
ORDER BY
  ad.week_start,
  ad.day_date;`;
    return DataSourceRegistry.getInstance().dataSource.query(query);
  }

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
