import SystemIdentity from "../models/identity";
import IdentityCertificates from "../models/certificate";
import { Device } from "src/models";

export abstract class CertificateManagerBase {
  id: string;
  public async ensureDefaultIdentity(name?: string): Promise<SystemIdentity> {
    throw new Error("Method not implemented.");
  }
  public async terminateDevice(device: Device): Promise<void> {
    throw new Error("Method not implemented.");
  }
  public async provisionDeviceCertificate(
    device: Device,
  ): Promise<IdentityCertificates> {
    throw new Error("Method not implemented.");
  }
  public async terminateCertificate(deviceIdentity: string): Promise<void> {
    throw new Error("Method not implemented.");
  }
  public async createCertificates(
    identity: string,
  ): Promise<IdentityCertificates> {
    throw new Error("Method not implemented.");
  }
}

export class CertificateManager {
  private static _instance: CertificateManager | undefined;
  private readonly base: CertificateManagerBase;
  private constructor(base?: CertificateManagerBase) {
    // Initialization code if needed
    this.base = base;
  }

  public static init(base: CertificateManagerBase) {
    if (!this._instance) {
      this._instance = new CertificateManager(base);
    }
    return this._instance;
  }

  public static get instance(): CertificateManagerBase {
    if (!this._instance) {
      throw new Error("CertificateManager not initialized. Call init() first.");
    }
    return this._instance.base;
  }
}
