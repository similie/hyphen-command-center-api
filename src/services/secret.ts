import crypto from "crypto";

export class EnvCrypt {
  private readonly _algorithm = "aes-256-ctr";
  private readonly _secretKey: string;
  private _iv: string;
  constructor(iv: string) {
    this._iv = iv;
    this._secretKey =
      process.env.ENV_SECRET_KEY || "6241caa2f4b730f7edcb3e115c0948d5";
  }

  public get convertIv() {
    return Buffer.from(this.iv, "hex");
  }

  private get algorithm() {
    return this._algorithm;
  }

  private get iv() {
    return this._iv;
  }

  static cipherIv(value: number = 16): string {
    return crypto.randomBytes(value).toString("hex");
  }

  private get secretKey() {
    return this._secretKey;
  }

  public encrypt(text: any): string {
    const iv = this.convertIv;
    const cipher = crypto.createCipheriv(this.algorithm, this.secretKey, iv);
    const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
    return encrypted.toString("hex");
  }

  public decrypt = (hash: string) => {
    if (!hash) {
      throw new Error("A String Value is Required");
    }

    const decipher = crypto.createDecipheriv(
      this.algorithm,
      this.secretKey,
      this.convertIv, // Buffer.from(hash.iv, "hex")
    );

    const decrpyted = Buffer.concat([
      decipher.update(Buffer.from(hash, "hex")),
      decipher.final(),
    ]);

    return decrpyted.toString();
  };
}
