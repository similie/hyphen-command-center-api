import { DeviceSensor, Sensor } from "../sensor";

export enum SensorType {
  GENERIC = "generic",
  SDI_12 = "sdi-12",
  ANALOG = "analog",
  DIGITAL = "digital",
  I2C = "i2c",
  SPI = "spi",
  UART = "uart",
}

export type SensorWithKey = Sensor & { relation: DeviceSensor };
