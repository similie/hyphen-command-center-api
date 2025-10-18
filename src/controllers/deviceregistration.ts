import {
  EllipsiesController,
  EllipsiesExtends,
  ControllerFunctionNames,
} from "@similie/ellipsies";
import { DeviceRegistration } from "src/models";

@EllipsiesExtends("registrations")
export default class DeviceRegistrationController extends EllipsiesController<DeviceRegistration> {
  public constructor() {
    super(DeviceRegistration, [
      ControllerFunctionNames.FIND,
      ControllerFunctionNames.SCHEMA,
    ]);
  }
}
