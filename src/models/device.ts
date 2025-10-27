import {
  Entity,
  Column,
  EllipsiesBaseModelUUID,
  BeforeInsert,
  QueryAgent,
  ExpressRequest,
  ExpressResponse,
  BadRequestError,
  NotAcceptableError,
} from "@similie/ellipsies";
import {
  AwsCertificateManager,
  PlatformIOBuilder,
  SimilieQuery,
} from "src/services";
import { RedisCache } from "src/services/redis";
import { generateUniqueId, UUID } from "src/utils/tools";
import IdentityCertificates from "./certificate";
import SourceRepository from "./repository";
import { DeviceSensor, Sensor } from "./sensor";
import { SensorTypeRules } from "src/services/sensor";
import { SensorType } from "./types";

@Entity("device_profile", { schema: "public" })
export class DeviceProfile extends EllipsiesBaseModelUUID {
  @Column("varchar", {
    name: "name",
  })
  public name: string;
  @Column("jsonb", {
    name: "config_schema",
    default: () => "'{}'",
  })
  public configSchema: Record<string, any>;
  @Column("jsonb", {
    name: "def_config_schema",
    default: () => "'{}'",
  })
  public defConfigSchema: Record<string, any>;
  @Column("text", {
    name: "script",
    nullable: true,
  })
  public script?: string;
  @Column("uuid", {
    name: "avatar",
    nullable: true,
  })
  public avatar?: UUID;

  @Column("uuid", {
    name: "repository",
    nullable: true,
  })
  public repository?: UUID;

  @Column("jsonb", {
    name: "partitions",
    default: () => "'[]'",
  })
  public partitions?: { address: number; type: string }[];
}
@Entity("device", { schema: "public" })
export class Device extends EllipsiesBaseModelUUID {
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
    name: "notes",
    nullable: true,
  })
  public notes?: string;

  @Column("varchar", {
    name: "assigned_identity",
    nullable: true,
  })
  public assignedIdentity?: string;

  @Column("jsonb", {
    name: "meta",
    default: () => "'{}'",
  })
  public meta: Record<string, any>;

  @Column("float8", {
    name: "lat",
    nullable: true,
  })
  public lat?: number;

  @Column("float8", {
    name: "lng",
    nullable: true,
  })
  public lng?: number;
  @Column("uuid", {
    name: "owner",
    nullable: true,
  })
  public owner?: string;

  @Column("uuid", {
    name: "profile",
    nullable: true,
  })
  public profile?: string;

  @Column("timestamp with time zone", {
    name: "last_touched",
    nullable: true,
  })
  public lastTouched?: Date;

  @BeforeInsert()
  setDefaults() {
    this.identity = this.identity || generateUniqueId();
  }

  public static async getSensorsForDevice(deviceId: string) {
    const agent = new QueryAgent<Device>(Device, { where: { id: deviceId } });
    const device = await agent.findOneById(deviceId);
    if (!device) {
      throw new NotAcceptableError("Device not found");
    }
    const sensors = await DeviceSensor.queryForDevice(device);
    return { device, sensors };
  }

  public static async addSensorToDevice(
    deviceId: string,
    identity: string,
    user?: UUID,
  ) {
    const agent = new QueryAgent<Device>(Device, { where: { id: deviceId } });
    const device = await agent.findOneById(deviceId);
    if (!device) {
      throw new NotAcceptableError("Device not found");
    }

    const deviceSensors = await Sensor.findOne({
      where: { identity },
    });

    if (!deviceSensors) {
      throw new NotAcceptableError("Sensor not found on device");
    }
    const sRules = new SensorTypeRules(deviceSensors.type, device);
    const key = await sRules.build(deviceSensors.identity);
    const newDeviceSensor = DeviceSensor.create({
      device: device.id,
      sensor: deviceSensors.id,
      key,
    });
    const sensor = await newDeviceSensor.save();
    await sRules.sendAddToChannel(key, device, user);

    return { device, sensor };
  }

  public static async syncSensorWithDevice(deviceId: string, user?: UUID) {
    const agent = new QueryAgent<Device>(Device, { where: { id: deviceId } });
    const device = await agent.findOneById(deviceId);
    if (!device) {
      throw new NotAcceptableError("Device not found");
    }

    const sRules = new SensorTypeRules(SensorType.GENERIC, device);
    await sRules.sendSyncToChannel(device, user);
    return device;
  }

  public static async removeSensorFromDevice(
    deviceId: string,
    sensorKey: string,
    user?: UUID,
  ) {
    const agent = new QueryAgent<Device>(Device, { where: { id: deviceId } });
    const device = await agent.findOneById(deviceId);
    if (!device) {
      throw new NotAcceptableError("Device not found");
    }

    const deviceSensors = await DeviceSensor.find({
      where: { device: device.id, key: sensorKey },
    });
    const sensorToRemove = deviceSensors.pop();
    if (!sensorToRemove) {
      throw new NotAcceptableError("Sensor not found on device");
    }

    await sensorToRemove.remove();
    const sRules = new SensorTypeRules(deviceSensors.type, device);
    await sRules.sendRemoveToChannel(sensorToRemove.key, device, user);

    return { device, sensor: sensorToRemove };
  }

  public static async buildSoftwareForDevice(
    req: ExpressRequest,
    res: ExpressResponse,
  ) {
    const { device: deviceID, config } = req.body as {
      device: string;
      config: Record<string, any>;
    };
    if (!deviceID) {
      throw new BadRequestError("Missing 'device' in request body");
    }
    const agent = new QueryAgent<Device>(Device, { where: {} });
    const device = await agent.findOneById(deviceID);

    if (!device || !device.profile) {
      throw new NotAcceptableError("Device not found");
    }

    const record = await IdentityCertificates.findOne({
      where: { identity: device.identity },
    });

    if (!record) {
      throw new NotAcceptableError("No certificates found for device");
    }

    const { ca, key, cert } = record;

    const deviceProfile = await DeviceProfile.findOne({
      where: { id: device.profile },
    });

    if (!deviceProfile || !deviceProfile.repository) {
      throw new NotAcceptableError("No device profile found");
    }

    const sourceRepo = await SourceRepository.findOne({
      where: { id: deviceProfile.repository },
    });

    if (!sourceRepo) {
      throw new NotAcceptableError("No source repository found");
    }

    const interpolatedScript = SimilieQuery.interpolate(
      deviceProfile.script || "",
      {
        device,
        config: Object.assign({}, deviceProfile.defConfigSchema, config || {}),
      },
    );
    const buildPayload = {
      device,
      profile: { ...deviceProfile, script: interpolatedScript },
      repository: sourceRepo,
      certificates: {
        // specific filenames expected by Hyphen Connect firmware
        "device-cert.pem": cert,
        "private-key.pem": key,
        "root-ca.pem": ca,
      },
    };

    return await PlatformIOBuilder.runBuildContainer(buildPayload, res);
  }

  public static deviceCacheId(identity: string): string {
    return `device:${identity}`;
  }

  public static async buildCertificateForDevice(
    search: Partial<Device>,
  ): Promise<Device> {
    const agent = new QueryAgent<Device>(Device, { where: search });
    const devices = await agent.getObjects();
    if (!devices || devices.length === 0) {
      throw new Error("Device not found");
    }
    for (const device of devices) {
      await AwsCertificateManager.instance.terminateCertificate(
        device.identity,
      );
      await AwsCertificateManager.instance.provisionDeviceCertificate(device);
      await RedisCache.set(this.deviceCacheId(device.identity), device, 86400); // Cache for 24 hours
    }
    return devices;
  }

  public static async destroyDevice(device: Device): Promise<void> {
    try {
      await AwsCertificateManager.instance.terminateDevice(device);
      console.log(
        `✅ Destroyed AWS IoT certificate for device ${device.identity}`,
      );
    } catch (err) {
      console.error(
        `Error destroying AWS IoT certificate for device ${device.identity}:`,
        err,
      );
    }
  }

  public static async create(data: Partial<Device>): Promise<Device> {
    const agent = new QueryAgent<Device>(Device, {});
    const device = await agent.create<Device>(data);
    if (!device) {
      throw new Error("Error creating device");
    }
    await RedisCache.set(this.deviceCacheId(device.identity), device, 86400); // Cache for 24 hours
    try {
      await AwsCertificateManager.instance.provisionDeviceCertificate(device);
      console.log(
        `✅ Created new AWS IoT certificate for device ${device.identity}`,
      );
    } catch (err) {
      console.error(
        `Error creating AWS IoT certificate for device ${device.identity}:`,
        err,
      );
    }
    return device;
  }
}
