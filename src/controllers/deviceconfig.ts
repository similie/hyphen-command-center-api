import {
  EllipsiesController,
  EllipsiesExtends,
  ControllerFunctionNames,
  UseBefore,
  Body,
  IModelUpdateValues,
  BadRequestError,
  Post,
  InternalServerError,
} from "@similie/ellipsies";
import { DeviceConfig } from "src/models";
import { DeviceShadowManager, ServiceRunner } from "src/services";
import { DeviceConfigEnum } from "../models/types";

@EllipsiesExtends("devicesconfig")
export default class DeviceConfigController extends EllipsiesController<DeviceConfig> {
  public constructor() {
    super(DeviceConfig, [
      ControllerFunctionNames.FIND,
      ControllerFunctionNames.SCHEMA,
      ControllerFunctionNames.CREATE,
      ControllerFunctionNames.UPDATE,
    ]);
  }

  @UseBefore((req, res, next) => {
    if (res.locals.user && !req.body.user) {
      req.body.user = res.locals.user.uid;
    }
    next();
  })
  public override async create(
    @Body() config: Partial<DeviceConfig>,
  ): Promise<DeviceConfig | DeviceConfig[]> {
    return DeviceConfig.createConfig(config);
  }

  public override async update(
    body: IModelUpdateValues<DeviceConfig>,
  ): Promise<DeviceConfig> {
    if (!body.query || !body.query.id) {
      throw BadRequestError("ID is required for update");
    }
    return super.update({
      query: body.query,
      update: { state: DeviceConfigEnum.CANCELED },
    });
  }

  @Post("/publish")
  public async publishConfig(
    @Body() body: { message: string; topic: string },
  ): Promise<{ ok: boolean }> {
    if (!body.topic) {
      throw new BadRequestError("Message and topic are required");
    }

    try {
      await DeviceShadowManager.sendMQTTMessage(body.topic, body.message);
    } catch (error) {
      throw new InternalServerError(
        "Failed to publish config: " + (error as Error).message,
      );
    }
    return { ok: true };
  }
}
