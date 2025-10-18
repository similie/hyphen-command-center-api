import {
  Entity,
  Column,
  EllipsiesBaseModelUUID,
  BeforeInsert,
  QueryAgent,
} from "@similie/ellipsies";
import { AwsCertificateManager } from "src/services";
import { RedisCache } from "src/services/redis";
import { generateUniqueId } from "src/utils/tools";

@Entity("device", { schema: "public" })
export default class Device extends EllipsiesBaseModelUUID {
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

  @Column("timestamp with time zone", {
    name: "last_touched",
    nullable: true,
  })
  public lastTouched?: Date;

  @BeforeInsert()
  setDefaults() {
    this.identity = this.identity || generateUniqueId();
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
