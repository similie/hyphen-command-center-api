import { Entity, Column, EllipsiesBaseModelUUID, In } from "@similie/ellipsies";
import { SensorType } from "./types/sensor";
import { Device } from "./device";

@Entity("device_sensor", { schema: "public" })
export class DeviceSensor extends EllipsiesBaseModelUUID {
  @Column("uuid", {
    name: "device",
  })
  public device: string;

  @Column("uuid", {
    name: "sensor",
  })
  public sensor: string;

  @Column("varchar", {
    name: "key",
  })
  public key: string;

  public static async queryForDevice(device: Device): Promise<
    (Sensor & {
      relation: DeviceSensor;
    })[]
  > {
    const results = await this.find({ where: { device: device.id } });
    const sensorIds = results.map((ds) => ds.sensor);
    const sensors = await Sensor.find({ where: { id: In(sensorIds) } });
    return results.map((ds) => {
      const deviceSensor = sensors.find((sensor) => sensor.id === ds.sensor);
      return { ...deviceSensor, relation: ds } as Sensor & {
        relation: DeviceSensor;
      };
    });
  }

  public static async applyDeviceSync(key: string, device: Device) {
    if (!key) {
      return;
    }
    const hasDevice = await this.findOne({
      where: { device: device.id, key },
    });
    if (hasDevice) {
      return;
    }

    const deviceIdentity = key.split(":")[0];
    const sensor = await Sensor.findOne({
      where: { identity: deviceIdentity },
    });

    if (!sensor) {
      return;
    }

    const sds = this.create({
      device: device.id,
      sensor: sensor.id,
      key,
    });

    return await sds.save();
  }
}
@Entity("sensor", { schema: "public" })
export class Sensor extends EllipsiesBaseModelUUID {
  @Column("varchar", {
    name: "name",
  })
  public name: string;

  @Column("varchar", {
    name: "identity",
    unique: true,
  })
  public identity: string;

  @Column("text", {
    name: "description",
    nullable: true,
  })
  public description?: string;

  @Column("simple-array", {
    name: "pins",
    nullable: true,
  })
  public pins?: string[];

  @Column("integer", {
    name: "max",
    default: 0,
  })
  public max: number;

  @Column("varchar", {
    name: "sensor_type",
    default: SensorType.GENERIC,
  })
  public sensorType: SensorType;

  @Column("varchar", {
    name: "avatar",
    nullable: true,
  })
  public avatar?: string;

  @Column("jsonb", {
    name: "meta",
    default: () => "'{}'",
  })
  public meta: Record<string, any>;

  public seeds() {
    return [
      {
        name: "ATMOS41",
        identity: "all_weather",
        description:
          "A multi-parameter sensor for environmental data collection",
        pins: [],
        max: 1,
        sensorType: "sdi-12",
        meta: {},
        id: "0ce53b1e-c885-46f1-a8f0-0b7ce4d73ad8",
      },
      {
        name: "TEROS11",
        identity: "soil_moisture",
        description: "A soil moisture and soil temperature sensor from Meter",
        pins: [],
        max: 8,
        sensorType: "sdi-12",
        meta: {},
        id: "899dfa1c-979f-4b63-a731-b504501b5cfb",
      },
      {
        name: "Elemental Battery",
        identity: "battery",
        description:
          "Hyphen Elemental 4050 XR (8.4v) or 4060 XR (12.6v) battery system on I2C",
        pins: [],
        max: 1,
        sensorType: "i2c",
        meta: {},
        id: "75b46c85-ceea-4dc8-9941-4b36e3821454",
      },
    ];
  }
}
