import {
  EllipsiesController,
  EllipsiesExtends,
  Post,
  Body,
  QueryAgent,
  Param,
  UseBefore,
  InternalServerError,
  Req,
  ExpressRequest,
  Res,
  Get,
  Delete,
  Put,
  ExpressResponse,
} from "@similie/ellipsies";
import { Device, DeviceProfile } from "../models/device";
import { UUID } from "src/utils/tools";
import { SourceRepository } from "src/models";
import fs from "fs";
import os from "os";
import path from "path";
import { DeviceSensor, Sensor } from "src/models/sensor";
import { DeviceContentItems } from "src/models/types";
@EllipsiesExtends("repositories")
export class RepositoryController extends EllipsiesController<SourceRepository> {
  public constructor() {
    super(SourceRepository);
  }
}

@EllipsiesExtends("deviceprofiles")
export class DeviceProfileController extends EllipsiesController<DeviceProfile> {
  public constructor() {
    super(DeviceProfile);
  }
}

@EllipsiesExtends("devices")
export class DeviceController extends EllipsiesController<Device> {
  public constructor() {
    super(Device);
  }

  @UseBefore((req, res, next) => {
    if (res.locals.user && !req.body.owner) {
      req.body.owner = res.locals.user.uid;
    }
    next();
  })
  public override async create(@Body() body: Partial<Device>): Promise<Device> {
    const device = await Device.createDevice(body);
    return device;
  }

  public override async destroyOne(
    @Param("id") id: number | UUID,
  ): Promise<Device | null> {
    try {
      const agent = new QueryAgent<Device>(Device, { where: { id } });
      const device = await agent.destroyById();
      await Device.destroyDevice(device);
      return device;
    } catch (error: any) {
      console.error("Destroy Error", error.message);
      throw new InternalServerError(error.message);
    }
  }

  @Get("/statistics")
  public async getDeviceStatistics(): Promise<{ totalDevices: number }> {
    return Device.deviceStatistics();
  }

  @Get("/details/:identity")
  public async getDeviceDetails(
    @Param("identity") identity: string,
  ): Promise<DeviceContentItems> {
    return Device.deviceDetails(identity);
  }

  @Post("/invalidate-certificate")
  public async rebuildCertificate(
    @Body() body: Partial<Device>,
  ): Promise<Device[]> {
    return Device.buildCertificateForDevice(body);
  }

  @Get("/sensor/:id")
  public async getDeviceSensors(
    @Param("id") deviceId: string,
  ): Promise<{ device: Device; sensors: Sensor[] }> {
    return Device.getSensorsForDevice(deviceId);
  }

  @Post("/sensor")
  public async addSensorToDevice(
    @Body() body: { deviceId: string; identity: string },
    @Res() res: ExpressResponse,
  ): Promise<{ device: Device; sensor: DeviceSensor }> {
    return Device.addSensorToDevice(
      body.deviceId,
      body.identity,
      res.locals.user?.uid,
    );
  }

  @Put("/sensor")
  public async syncSensorWithDevice(
    @Body() body: { deviceId: string },
    @Res() res: ExpressResponse,
  ): Promise<Device> {
    return Device.syncSensorWithDevice(body.deviceId, res.locals.user?.uid);
  }

  @Delete("/sensor")
  public async removeSensorFromDevice(
    @Body() body: { deviceId: string; sensorKey: string },
    @Res() res: ExpressResponse,
  ): Promise<{ device: Device; sensor: DeviceSensor }> {
    return Device.removeSensorFromDevice(
      body.deviceId,
      body.sensorKey,
      res.locals.user?.uid,
    );
  }

  @Get("/artifacts/:deviceId/:buildId")
  public async getArtifact(
    @Param("deviceId") deviceId: string,
    @Param("buildId") buildId: string,
    @Res() res: ExpressResponse,
  ): Promise<ExpressResponse> {
    // Implement logic to retrieve the artifact for the given buildId
    const hostBuildRoot =
      process.env.HOST_BUILDS_PATH || path.join(os.tmpdir(), "similie-builds");
    const zipPath = path.join(
      hostBuildRoot,
      // os.tmpdir(),
      // "similie-builds",
      buildId,
      `${deviceId}.zip`,
    );
    if (fs.existsSync(zipPath)) {
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${deviceId}.zip"`,
      );

      await new Promise<void>((resolve, reject) => {
        const stream = fs.createReadStream(zipPath);
        stream.pipe(res);

        stream.on("close", () => {
          console.log(`✅ Artifact stream completed for ${zipPath}`);
          resolve();
        });

        stream.on("error", (err) => {
          console.error("❌ Stream error:", err);
          if (!res.headersSent) {
            res.status(500).json({ error: "Error streaming artifact" });
          } else {
            res.end();
          }

          reject(err);
        });
      });

      fs.unlinkSync(zipPath);
    } else {
      res.status(404).json({ error: "Artifact not found" });
    }

    return res;
  }

  @Post("/local-flash", { transformResponse: false, transformRequest: false })
  public async localFlash(
    @Req() req: ExpressRequest,
    @Res() res: ExpressResponse,
  ): Promise<ExpressResponse> {
    res.writeHead(200, {
      "Content-Type": "text/event-stream", // or other appropriate
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    try {
      await Device.buildSoftwareForDevice(req, res);
    } catch (err) {
      console.error("Error in localFlash:", err);
      if (!res.headersSent) {
        res.write(`event: error\ndata: ${err.message}\n\n`);
      }
    } finally {
      // Ensure we end the response exactly once
      if (!res.writableEnded) {
        res.end();
      }
    }

    return res;
  }
}
