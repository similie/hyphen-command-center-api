import {
  EllipsiesController,
  EllipsiesExtends,
  ControllerFunctionNames,
} from "@similie/ellipsies";
import { Heartbeat } from "src/models";

@EllipsiesExtends("heartbeats")
export default class HeartbeatController extends EllipsiesController<Heartbeat> {
  public constructor() {
    super(Heartbeat, [
      ControllerFunctionNames.FIND,
      ControllerFunctionNames.SCHEMA,
    ]);
  }
}
