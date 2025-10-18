export enum ParameterValueOwnerBy {
  USER = "user",
  SYSTEM = "system",
  APPLICATION = "application",
  INTEGRATION = "integration",
  DEVICE = "device",
}

export type ParameterToForwardValue = {
  key: string;
  required: boolean;
  value?: string;
};
