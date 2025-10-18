import {
  EllipsiesController,
  EllipsiesExtends,
  ControllerFunctionNames,
} from "@similie/ellipsies";
import { DeviceStream } from "src/models";

@EllipsiesExtends("streams")
export default class DeviceStreamController extends EllipsiesController<DeviceStream> {
  public constructor() {
    super(DeviceStream, [
      ControllerFunctionNames.FIND,
      ControllerFunctionNames.SCHEMA,
      ControllerFunctionNames.COUNT,
    ]);
  }
}
