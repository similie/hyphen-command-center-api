import { EllipsiesController, EllipsiesExtends } from "@similie/ellipsies";
import { Sensor } from "src/models/sensor";

@EllipsiesExtends("sensors")
export default class SensorController extends EllipsiesController<Sensor> {
  public constructor() {
    super(Sensor);
  }
}
