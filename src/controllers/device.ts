import {
  EllipsiesController,
  EllipsiesExtends,
  Post,
  Body,
  QueryAgent,
  Param,
  UseBefore,
  InternalServerError,
} from "@similie/ellipsies";
import Device from "../models/device";
import { UUID } from "src/utils/tools";

@EllipsiesExtends("devices")
export default class DeviceController extends EllipsiesController<Device> {
  public constructor() {
    super(Device);
  }

  @UseBefore((req, res, next) => {
    if (res.locals.user && !req.body.owner) {
      req.body.owner = res.locals.user.uid;
    }
    next();
  })
  public override async create(
    @Body() body: Partial<Device>,
  ): Promise<Device | Device[]> {
    console.log("Creating device with body:", body);
    const device = await Device.create(body);
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

  @Post("/invalidate-certificate")
  public async rebuildCertificate(
    @Body() body: Partial<Device>,
  ): Promise<Device> {
    return Device.buildCertificateForDevice(body);
  }
}
