import { Device, DeviceConfig } from "src/models";
import { DeviceSensor, Sensor } from "src/models/sensor";
import {
  DeviceConfigActionType,
  DeviceConfigEnum,
  SensorType,
} from "src/models/types";
import { UUID } from "@similie/hyphen-command-server-types";

export class SensorTypeRules {
  constructor(
    private readonly sensorType: SensorType,
    private readonly device: Device,
  ) {}

  private assignUniqueIdentity(
    current: (Sensor & { relation: DeviceSensor })[],
  ) {
    if (!current.length) {
      return `0`;
    }
    const ids: string[] = [];
    for (const sensor of current) {
      if (!sensor.relation.key) {
        continue;
      }
      const split = sensor.relation.key.split(":");
      if (!split.length || split.length < 2) {
        return `1`;
      }
      const id = split[1];
      if (!isNaN(Number(id))) {
        ids.push(id);
      }
    }

    ids.sort((a, b) => Number(a) - Number(b));
    let uniqueId = 0;
    for (let i = 0; i < ids.length; i++) {
      const currentId = Number(ids[i]);
      if (currentId === uniqueId) {
        uniqueId++;
      } else {
        break;
      }
    }
    return `${uniqueId}`;
  }

  private getIdentity(
    current: (Sensor & { relation: DeviceSensor })[],
  ): string {
    switch (this.sensorType) {
      case SensorType.SDI_12:
        return this.assignUniqueIdentity(current);
      default:
        return "";
    }
  }

  private getPin(
    thisSensor: Sensor,
    current: (Sensor & { relation: DeviceSensor })[],
  ) {
    if (!thisSensor.pins || thisSensor.pins.length === 0) {
      return "";
    } else if (!current.length) {
      return thisSensor.pins[0];
    }
    const usedPins: string[] = [];
    for (const sensor of current) {
      if (!sensor.relation.key) {
        continue;
      }
      const split = sensor.relation.key.split(":");
      if (!split.length || split.length < 3) {
        continue;
      }
      const pin = split[2];
      usedPins.push(pin);
    }

    for (const pin of thisSensor.pins) {
      if (!usedPins.includes(pin)) {
        return pin;
      }
    }
    return "";
  }

  public async sendSyncToChannel(device: Device, user?: UUID) {
    const deviceConfig = await DeviceConfig.createConfig({
      identity: device.identity,
      user: user,
      state: DeviceConfigEnum.WAITING,
      actionName: "showDevices",
      actionType: DeviceConfigActionType.FUNCTION,
      noNullify: true,
      data: "",
    });
    return deviceConfig;
  }

  public async sendRemoveToChannel(key: string, device: Device, user?: UUID) {
    // First, cancel any existing addDevice requests for this key
    const current = await DeviceConfig.findOne({
      where: {
        identity: device.identity,
        state: DeviceConfigEnum.WAITING,
        actionType: DeviceConfigActionType.FUNCTION,
        actionName: "addDevice",
        noNullify: true,
        data: key,
      },
    });

    if (current) {
      current.state = DeviceConfigEnum.CANCELED;
      await current.save();
    }

    const deviceConfig = await DeviceConfig.createConfig({
      identity: device.identity,
      user: user,
      state: DeviceConfigEnum.WAITING,
      actionName: "removeDevice",
      actionType: DeviceConfigActionType.FUNCTION,
      noNullify: true,
      data: key,
    });
    return deviceConfig;
  }

  public async sendAddToChannel(key: string, device: Device, user?: UUID) {
    const deviceConfig = await DeviceConfig.createConfig({
      identity: device.identity,
      user: user,
      noNullify: true,
      state: DeviceConfigEnum.WAITING,
      actionName: "addDevice",
      actionType: DeviceConfigActionType.FUNCTION,
      data: key,
    });
    return deviceConfig;
  }

  public async build(key: string): Promise<string> {
    const thisSensor = await Sensor.findOne({
      where: { sensorType: this.sensorType },
    });
    if (!thisSensor) {
      throw new Error(
        `Sensor type ${this.sensorType} not found in sensors database.`,
      );
    }
    const devices = await DeviceSensor.queryForDevice(this.device);
    const filteredDevices = devices.filter(
      (d) => d.sensorType === this.sensorType,
    );
    if (thisSensor.max > 0 && filteredDevices.length > thisSensor.max) {
      throw new Error(
        `Device ${this.device.name} exceeds the maximum number of sensors allowed for type ${this.sensorType}. Maximum: ${thisSensor.max}, Found: ${filteredDevices.length}`,
      );
    }

    const identity = this.getIdentity(filteredDevices);
    const pin = this.getPin(thisSensor, filteredDevices);
    let identityKey = `${key}`;
    if (identity) {
      identityKey += `:${identity}`;
    }
    if (pin) {
      identityKey += `:${pin}`;
    }
    return identityKey;
  }
}
