import { UUID } from "src/utils/tools";
import ForwarderTemplate from "../fowardertemplates";

export enum ForwarderTargetKind {
  MQTT = "mqtt",
  HTTP = "http",
}

export type MsgCtx = {
  topic: string;
  message: Buffer | string | any;
  payload?: any; // e.g. decoded data
  _uid: string;
  device: any; // your Device type
  ts?: Date;
  keys?: Record<string, Record<string, string>>;
  template?: ForwarderTemplate;
  artifacts?: Record<string, any>; // e.g. decoded data, maps, etc.
};

export enum ParameterToForwardValue {
  HEADERS = "headers",
  BODY = "body",
  TOPIC = "topic",
  QUERY = "query",
}

export type ForwarderDeliverables = {
  host?: string;
  topic?: string;
  url: string;
  headers: Record<string, string>;
  body: Record<string, string> | string;
  method?: string;
};

export type MqttTarget = {
  kind: ForwarderTargetKind.MQTT;
  topicTemplate: string; // e.g. "/Hy/Config/{context.device.identity}/time"
  qos?: 0 | 1 | 2;
  retain?: boolean;
  payloadTemplate?: string[] | UUID[]; // optional template to override final payload body
  deliverables?: ForwarderDeliverables;
};

export type HttpTarget = {
  kind: ForwarderTargetKind.HTTP;
  method: "POST" | "PUT" | "PATCH" | "GET";
  urlTemplate: string; // e.g. "https://api.example.com/v1/events/{context.device.identity}"
  headers?: string[] | UUID[]; // can contain {secrets.FOO} or {params.BAR}
  bodyTemplate?: string[] | UUID[]; // JSON string template
  timeoutMs?: number;
  deliverables?: ForwarderDeliverables; // list of deliverables to track attempts
};

export type ForwarderTarget = MqttTarget | HttpTarget;

export type MqttTargetTemplate = {
  kind: ForwarderTargetKind.MQTT;
  topicTemplate: string; // e.g. "/Hy/Config/{context.device.identity}/time"
  payloadTemplate?: ParameterToForwardValue[]; // optional template to override final payload body
};

export type HttpTargetTemplate = {
  kind: ForwarderTargetKind.HTTP;
  method: "POST" | "PUT" | "PATCH" | "GET";
  urlTemplate: string; // e.g. "https://api.example.com/v1/events/{context.device.identity}"
  headers?: ParameterToForwardValue[]; // can contain {secrets.FOO} or {params.BAR}
  bodyTemplate?: ParameterToForwardValue[]; // JSON string template
};

export type ForwarderTargetTemplates = MqttTargetTemplate | HttpTargetTemplate;
