import { Heartbeat } from "..";
import { Device, DeviceProfile } from "../device";
import SourceRepository from "../repository";
import { SensorWithKey } from "./sensor";

export enum DeviceConfigEnum {
  ERROR = -1,
  WAITING = 0,
  RESOLVED = 1,
  CANCELED = 2,
  EXPIRED = 3,
}

export interface BuildPayload {
  device: Device;
  profile: DeviceProfile;
  repository: SourceRepository;
  certificates: Record<string, string>;
}
export type DeviceContentItems = {
  heartbeat: Heartbeat;
  device: Device;
  deviceType: DeviceProfile;
  sensors: SensorWithKey[];
};
