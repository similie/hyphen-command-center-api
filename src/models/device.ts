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
  MoreThanOrEqual,
  LessThan,
  DataSourceRegistry,
} from "@similie/ellipsies";
import {
  CertificateManager,
  PlatformIOBuilder,
  signToken,
  SimilieQuery,
} from "src/services";
import { RedisCache } from "src/services/redis";
import { generateUniqueId, UUID } from "src/utils/tools";
import IdentityCertificates from "./certificate";
import SourceRepository from "./repository";
import { DeviceSensor, Sensor } from "./sensor";
import { SensorTypeRules } from "src/services/sensor";
import {
  BuildPayload,
  DeviceConfigActionType,
  DeviceConfigEnum,
  DeviceContentItems,
  SensorType,
} from "./types";
import { DeviceConfig, Heartbeat } from ".";
import DeviceStreams from "./devicestream";
import unzipper from "unzipper";
import fs from "fs";
import os from "os";
import path from "path";
import { pipeline } from "stream/promises";
import { Writable } from "stream";
@Entity("device_profile", { schema: "public" })
export class DeviceProfile extends EllipsiesBaseModelUUID {
  @Column("varchar", {
    name: "name",
  })
  public name: string;
  @Column("integer", {
    name: "offline",
    default: 15,
  })
  public offline: number;
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

  public seeds() {
    return [
      {
        name: "HyphenElemental4",
        configSchema: {
          apn: "string",
          sim_pin: "string",
          mqtt_port: "number",
          wifi_pass: "string",
          wifi_ssid: "string",
          topic_base: "string",
          mqtt_endpoint: "string",
        },
        defConfigSchema: {
          apn: "internet",
          mqtt_port: 8883,
          wifi_pass: "ChangeByDesign",
          wifi_ssid: "Similie\\ Guests",
          topic_base: "Hy/",
          mqtt_endpoint: "a2hreerobwhgvz-ats.iot.us-east-1.amazonaws.com",
        },
        script:
          "[env:esp32dev]\n" +
          "platform = espressif32\n" +
          "board = esp32dev\n" +
          "framework = arduino\n" +
          "monitor_speed = 115200\n" +
          "upload_speed = 921600\n" +
          "board_upload.flash_size = 16MB\n" +
          "board_build.partitions = part_16mb_app.csv\n" +
          "monitor_filters = esp32_exception_decoder\n" +
          "board_build.embed_txtfiles =\n" +
          "  src/certs/root-ca.pem\n" +
          "  src/certs/device-cert.pem\n" +
          "  src/certs/private-key.pem\n" +
          "lib_deps = \n" +
          "    guernica0131/HyphenConnect@^1.0.3\n" +
          "    envirodiy/SDI-12@2.1.4\n" +
          "    emanuelefeola/ArduinoHttpClient@^0.5.0\n" +
          "    ArduinoJson@^7.4.2\n" +
          "    https://github.com/similie/Adafruit-VC0706-Serial-Camera-Library\n" +
          "    greiman/SdFat@^2.2.3\n" +
          "    adafruit/Adafruit INA219\n" +
          "  \n" +
          "build_flags = \n" +
          " -D CORE_DEBUG_LEVEL=ARDUHAL_LOG_LEVEL_VERBOSE\n" +
          ' -D CELLULAR_APN=\\"{config.apn}\\"\n' +
          ' -D GSM_SIM_PIN=\\"{config.sim_pin}\\"\n' +
          ' -D MQTT_IOT_ENDPOINT=\\"{config.mqtt_endpoint}\\"\n' +
          " -D MQTT_IOT_PORT={config.mqtt_port} \n" +
          ' -D DEVICE_PUBLIC_ID=\\"{device.identity}\\" \n' +
          " -D TINY_GSM_MODEM_SIM7600\n" +
          " -D LED_PIN=14\n" +
          " -D UART_BAUD=115200\n" +
          " -D CELLULAR_PIN_TX=27\n" +
          " -D CELLULAR_PIN_RX=26\n" +
          " -D CELLULAR_POWER_PIN_AUX=4\n" +
          " -D CELLULAR_POWER_PIN=25\n" +
          ' -D DEFAULT_WIFI_SSID=\\"{config.wifi_ssid}\\"\n' +
          ' -D DEFAULT_WIFI_PASS=\\"{config.wifi_pass}\\"\n' +
          ' -D MQTT_TOPIC_BASE=\\"{config.topic_base}\\" \n' +
          " -D MQTT_MAX_PACKET_SIZE=2048\n" +
          " -D MQTT_KEEP_ALIVE_INTERVAL=300\n" +
          " -D MQTT_KEEP_ALIVE_INTERVAL_LOOP_OFFSET=0.04\n" +
          " -D MQTT_SOCKET_TIMEOUT=20\n" +
          " -D HYPHEN_THREADED\n" +
          " -D NETWORK_MODE=2\n" +
          " -D CONFIG_SPIRAM_USE_CAPS_ALLOC=1\n" +
          " -D DISABLE_FS_H_WARNING\n" +
          " -D BOARD_HAS_PSRAM\n" +
          " -D BUILD_TIMESTAMP=$UNIX_TIME",
        repository: "0cb25098-35ce-4ac6-a950-b43ab6d723c3",
        partitions: [
          { type: "bootloader.bin", address: 4096 },
          { type: "firmware.bin", address: 65536 },
          { type: "spiffs.bin", address: 11599872 },
          { type: "partitions.bin", address: 32768 },
        ],
        id: "e45d8b56-20d6-4766-bd96-787fb499516d",
      },
    ];
  }

  public static getProfileCount(): Promise<
    { profile_id: string; profile_name: string; device_count: number }[]
  > {
    const query = `SELECT
  dp.id        AS profile_id,
  dp.name      AS profile_name,
  COUNT(d.id)::integer  AS device_count
FROM "device_profile" dp
LEFT JOIN "device" d
  ON d."profile" = dp."id"
GROUP BY
  dp.id,
  dp.name
ORDER BY
  device_count DESC;`;
    return DataSourceRegistry.getInstance().dataSource.query(query);
  }
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
    this.identity = this.identity || generateUniqueId(12);
  }

  public static async deviceStatistics() {
    const totalDevices = await this.count();
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const onlineDevices = await this.count({
      where: { lastTouched: MoreThanOrEqual(fifteenMinutesAgo) },
    });
    const offlineDevices = await this.count({
      where: { lastTouched: LessThan(fifteenMinutesAgo) },
    });

    const deviceTypeCount = await DeviceProfile.getProfileCount();
    const deviceWeeklyCounts = await DeviceStreams.getWeeklyStreamCount();

    return {
      totalDevices,
      onlineDevices,
      offlineDevices,
      deviceTypeCount,
      deviceWeeklyCounts,
    };
  }

  public static async deviceDetails(
    identity: string,
  ): Promise<DeviceContentItems> {
    const device = await this.findOne({
      where: { identity },
    });
    const sensors = await DeviceSensor.queryForDevice(device);
    const heartbeat = await Heartbeat.find({
      where: { device: identity },
      order: { date: "DESC" },
      take: 1,
    });

    const deviceType = await DeviceProfile.findOne({
      where: { id: device?.profile as UUID },
    });
    return {
      heartbeat: heartbeat[0],
      device,
      deviceType,
      sensors,
    };
  }

  public static async getSensorsForDevice(deviceId: string) {
    const agent = new QueryAgent<Device>(Device, {
      where: { id: deviceId as UUID },
    });
    const device = await agent.findOneById(deviceId);
    if (!device) {
      throw new NotAcceptableError("Device not found");
    }
    const sensors = await DeviceSensor.queryForDevice(device);
    return { device, sensors };
  }

  public static async generateDeviceOTAConfig(
    body: { deviceId: string; buildId: string; host: string },
    user: any,
  ) {
    const url = new URL(body.host);
    const payload = {
      port: +url.port || 443,
      host: url.hostname,
      url: url.pathname + `devices/ota/${body.deviceId}/${body.buildId}`,
      token: signToken(user),
    };
    console.log("OTA Payload:", payload);
    const deviceConfig = await DeviceConfig.createConfig({
      identity: body.deviceId,
      user: user.uid,
      state: DeviceConfigEnum.WAITING,
      actionName: "otaUpdate",
      actionType: DeviceConfigActionType.FUNCTION,
      noNullify: true,
      data: JSON.stringify(payload),
    });
    return deviceConfig as DeviceConfig;
  }

  public static async getDevicesForOtaUpdate(
    deviceId: string,
    buildId: string,
    res: ExpressResponse,
  ) {
    const hostBuildRoot =
      process.env.HOST_BUILDS_PATH || path.join(os.tmpdir(), "similie-builds");
    console.log("Body Parameters:", { deviceId, buildId });
    const zipPath = path.join(hostBuildRoot, buildId, `${deviceId}.zip`);

    console.log(`🔍 Looking for OTA build artifact at ${zipPath}...`);
    if (!fs.existsSync(zipPath)) {
      throw new NotAcceptableError("OTA build artifact not found");
    }

    // Create a read stream from the zip file
    const zipStream = fs.createReadStream(zipPath);

    // Find and extract the firmware.bin file on the fly
    const directory = zipStream.pipe(unzipper.Parse({ forceStream: true }));

    let fileFound = false;

    for await (const entry of directory) {
      const fileName = entry.path;
      console.log(`🔍 Found OTA build artifact: ${fileName}`);
      if (fileName.endsWith("firmware.bin")) {
        fileFound = true;
        const contentLength = entry.vars.uncompressedSize || 0;
        console.log(
          `📦 Streaming OTA firmware for ${deviceId} (${contentLength} bytes)...`,
        );
        // Set headers for OTA binary stream
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="firmware.bin"`,
        );
        res.setHeader("Content-Length", contentLength.toString());
        res.setHeader("Connection", "close");

        console.log(`📦 Streaming OTA firmware for ${deviceId}...`);

        const CHUNK_SIZE = 64 * 1024; // 64 KB
        const DELAY_MS = 25; // 25 ms pause between chunks (adjust as needed)

        // Create a writable stream wrapper for res so we can await drain
        const writable: Writable = new Writable({
          write(chunk, encoding, callback) {
            const ok = res.write(chunk, encoding);
            if (!ok) {
              res.once("drain", () => callback());
            } else {
              callback();
            }
          },
          final(callback) {
            res.end();
            callback();
          },
        });

        // Read from entry in chunks and write to writable
        let totalWritten = 0;
        for await (const chunk of entry) {
          // Optionally slice chunk if very large
          let offset = 0;
          while (offset < (chunk as Buffer).length) {
            const sliceLen = Math.min(
              CHUNK_SIZE,
              (chunk as Buffer).length - offset,
            );
            const slice = (chunk as Buffer).slice(offset, offset + sliceLen);
            writable.write(slice);
            totalWritten += sliceLen;
            offset += sliceLen;
            if (totalWritten % (512 * 1024) === 0) {
              console.log(`… ${totalWritten}/${contentLength} bytes`);
            }
            await new Promise((r) => setTimeout(r, DELAY_MS));
          }
        }
        await new Promise<void>((r, rej) => {
          writable.end(() => r());
          writable.on("error", rej);
        });

        // Stream the binary directly to the response
        // await new Promise<void>((resolve, reject) => {
        //   entry.pipe(res);
        //   entry.on("end", resolve);
        //   entry.on("error", reject);
        // });
        // Use pipeline to respect back-pressure
        // pipeline(entry, res);
        // return pipeline(entry, res);
        console.log(`✅ Firmware stream complete for ${deviceId}`);
        break;
      } else {
        entry.autodrain();
      }
    }

    if (!fileFound) {
      console.error(`❌ firmware.bin not found in ${zipPath}`);
      res.status(404).json({ error: "Firmware not found in artifact" });
    }

    // Optionally cleanup (only if safe and ephemeral)
    try {
      // fs.unlinkSync(zipPath);
    } catch (e) {
      console.warn(`⚠️ Could not delete build artifact: ${e}`);
    }

    return res;
  }

  public static async addSensorToDevice(
    deviceId: string,
    identity: string,
    user?: UUID,
  ) {
    const agent = new QueryAgent<Device>(Device, {
      where: { id: deviceId as UUID },
    });
    const device = await agent.findOneById(deviceId);
    if (!device) {
      throw new NotAcceptableError("Device not found");
    }

    const deviceSensor = await Sensor.findOne({
      where: { identity },
    });

    if (!deviceSensor) {
      throw new NotAcceptableError("Sensor not found on device");
    }
    const sRules = new SensorTypeRules(deviceSensor.sensorType, device);
    const key = await sRules.build(deviceSensor.identity);
    const newDeviceSensor = DeviceSensor.create({
      device: device.id,
      sensor: deviceSensor.id,
      key,
    });
    const sensor = await newDeviceSensor.save();
    await sRules.sendAddToChannel(key, device, user);

    return { device, sensor };
  }

  public static async syncSensorWithDevice(deviceId: string, user?: UUID) {
    const agent = new QueryAgent<Device>(Device, {
      where: { id: deviceId as UUID },
    });
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
    const agent = new QueryAgent<Device>(Device, {
      where: { id: deviceId as UUID },
    });
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

    const sensorRecord = await Sensor.findOne({
      where: { id: sensorToRemove.sensor as UUID },
    });

    await sensorToRemove.remove();
    const sRules = new SensorTypeRules(sensorRecord.sensorType, device);
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
      where: { id: device.profile as UUID },
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
    const sendProfile = await DeviceProfile.create({
      ...deviceProfile,
      script: interpolatedScript as string,
    });
    const buildPayload: BuildPayload = {
      device,
      profile: sendProfile,
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
  ): Promise<Device[]> {
    const agent = new QueryAgent<Device>(Device, { where: search });
    const devices = (await agent.getObjects()) as Device[];
    if (!devices || devices.length === 0) {
      throw new Error("Device not found");
    }
    for (const device of devices) {
      await CertificateManager.instance.terminateCertificate(device.identity);
      await CertificateManager.instance.provisionDeviceCertificate(device);
      await RedisCache.set(this.deviceCacheId(device.identity), device, 86400); // Cache for 24 hours
    }
    return devices;
  }

  public static async destroyDevice(device: Device): Promise<void> {
    try {
      await CertificateManager.instance.terminateDevice(device);
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

  public static async createDevice(data: Partial<Device>): Promise<Device> {
    const agent = new QueryAgent<Device>(Device, {});
    const device = (await agent.create(data)) as Device;
    if (!device) {
      throw new Error("Error creating device");
    }
    await RedisCache.set(this.deviceCacheId(device.identity), device, 86400); // Cache for 24 hours
    try {
      await CertificateManager.instance.provisionDeviceCertificate(device);
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
