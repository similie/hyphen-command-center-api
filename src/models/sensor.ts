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
    return sensors.map((sensor) => {
      const deviceSensor = results.find((ds) => ds.sensor === sensor.id);
      return { ...sensor, relation: deviceSensor } as Sensor & {
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
}
