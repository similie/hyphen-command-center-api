import AWS from "aws-sdk";
import SystemIdentity from "../models/identity";
import IdentityCertificates from "../models/certificate";
import { Device } from "src/models";
import { CertificateManagerBase } from "./certificate-manager";

export class AwsCertificateManager implements CertificateManagerBase {
  private readonly iot: AWS.Iot;
  private identity: SystemIdentity | null = null;
  public constructor() {
    this.iot = new AWS.Iot({
      region: process.env.AWS_REGION || "us-east-1",
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    });
  }

  public get id() {
    if (!this.identity) {
      throw new Error("Identity not initialized");
    }
    return this.identity.identity;
  }

  // ───────────────────────────────────────────────────────────────
  // 🧩 DEFAULT IDENTITY
  // ───────────────────────────────────────────────────────────────
  public async ensureDefaultIdentity(name?: string): Promise<SystemIdentity> {
    let identity = await SystemIdentity.findOne({ where: { primary: true } });

    if (!identity) {
      identity = new SystemIdentity();
      identity.name =
        name || process.env.SYSTEM_IDENTITY_NAME || "CommandCenter";
      identity.primary = true;
      await identity.save();

      // ✅ Ensure Thing exists
      try {
        await this.iot.createThing({ thingName: identity.name }).promise();
        console.log(`🧱 Created Thing '${identity.name}'`);
      } catch (err: any) {
        if (err.code === "ResourceAlreadyExistsException") {
          console.log(`ℹ️ Thing '${identity.name}' already exists`);
        } else {
          throw err;
        }
      }

      // ✅ Create new certificate and attach to Thing
      const cert = await this.createCertificates(identity.identity);
      console.log(`✅ Created certificate for '${identity.identity}'`);

      await this.iot
        .attachThingPrincipal({
          thingName: identity.name,
          principal: cert.certArn,
        })
        .promise();

      console.log(`🔗 Attached certificate to Thing '${identity.name}'`);
    } else {
      console.log(`ℹ️ Found existing default identity ${identity.identity}`);
    }
    this.identity = identity;
    return identity;
  }

  // ───────────────────────────────────────────────────────────────
  // 🔒 TERMINATE: FULL THING + CERT DESTRUCTION
  // ───────────────────────────────────────────────────────────────
  public async terminateDevice(device: Device): Promise<void> {
    console.log(`🧹 Terminating device '${device.identity}'...`);

    const record = await IdentityCertificates.findOne({
      where: { identity: device.identity },
    });

    if (!record) {
      return;
    }
    // Terminate the certificate if one exists
    if (record) await this.terminateCertificate(record.identity);

    // Delete the AWS Thing itself
    try {
      await this.iot.deleteThing({ thingName: device.identity }).promise();
      console.log(`🗑️ Deleted Thing '${device.identity}'`);
    } catch (err: any) {
      if (err.code === "ResourceNotFoundException") {
        console.log(`ℹ️ Thing '${device.identity}' already deleted.`);
      } else {
        console.warn(`⚠️ Failed to delete Thing '${device.identity}': ${err}`);
      }
    }
  }

  // ───────────────────────────────────────────────────────────────
  // 🔐 TERMINATE CERTIFICATE ONLY
  // ───────────────────────────────────────────────────────────────
  public async terminateCertificate(deviceIdentity: string): Promise<void> {
    const record = await IdentityCertificates.findOne({
      where: { identity: deviceIdentity },
    });
    const identity = record.identity;
    const certificateArn = record.certArn;
    const certificateId = record.certId;
    console.log(
      `🧹 Terminating certificate '${certificateId}' for '${identity}'`,
    );
    if (!certificateId || certificateId.length < 64) {
      console.warn(`⚠️ Invalid or missing certificateId for '${identity}'`);
      await record.remove();
      return;
    }

    // Detach from things
    try {
      const { things } = await this.iot
        .listPrincipalThings({ principal: certificateArn })
        .promise();

      for (const thingName of things || []) {
        await this.iot
          .detachThingPrincipal({ thingName, principal: certificateArn })
          .promise();
        console.log(`🔗 Detached from Thing '${thingName}'`);
      }
    } catch (err) {
      console.warn(`⚠️ Could not detach from things: ${err}`);
    }

    // Detach policies
    try {
      const { policies } = await this.iot
        .listAttachedPolicies({ target: certificateArn })
        .promise();

      for (const policy of policies || []) {
        await this.iot
          .detachPolicy({
            policyName: policy.policyName!,
            target: certificateArn,
          })
          .promise();
        console.log(`📜 Detached policy '${policy.policyName}'`);
      }
    } catch (err) {
      console.warn(`⚠️ Could not detach policy: ${err}`);
    }

    // Deactivate certificate
    try {
      await this.iot
        .updateCertificate({ certificateId, newStatus: "INACTIVE" })
        .promise();
      console.log(`🚫 Deactivated certificate '${certificateId}'`);
    } catch (err) {
      console.warn(`⚠️ Could not deactivate: ${err}`);
    }

    // Delete certificate
    try {
      await this.iot
        .deleteCertificate({ certificateId, forceDelete: true })
        .promise();
      console.log(`🗑️ Deleted certificate '${certificateId}'`);
    } catch (err) {
      console.warn(`⚠️ Could not delete certificate: ${err}`);
    }

    // Remove DB record
    await record.remove();
    console.log(`✅ Removed local certificate record for '${identity}'`);
  }

  // ───────────────────────────────────────────────────────────────
  // 🚀 PROVISION NEW DEVICE CERTIFICATE + THING
  // ───────────────────────────────────────────────────────────────
  public async provisionDeviceCertificate(
    device: Device,
  ): Promise<IdentityCertificates> {
    const thingName = device.identity;
    console.log(`🚀 Provisioning device '${thingName}'...`);

    // Ensure Thing exists
    try {
      await this.iot.createThing({ thingName }).promise();
      console.log(`🧱 Created Thing '${thingName}'`);
    } catch (err: any) {
      if (err.code === "ResourceAlreadyExistsException") {
        console.log(`ℹ️ Thing '${thingName}' already exists`);
      } else throw err;
    }

    // Create certificate + key
    const { certificateArn, certificatePem, keyPair } = await this.iot
      .createKeysAndCertificate({ setAsActive: true })
      .promise();

    const certificateId = certificateArn.split("/").pop()!;
    console.log(`🔐 Created new certificate '${certificateId}'`);

    // Attach default policy
    const policyName = process.env.AWS_IOT_POLICY_NAME || "DefaultDevicePolicy";
    await this.ensurePolicyExists(policyName);
    await this.iot
      .attachPolicy({ policyName, target: certificateArn })
      .promise();
    console.log(`📜 Attached policy '${policyName}'`);

    // Attach certificate to Thing
    await this.iot
      .attachThingPrincipal({ thingName, principal: certificateArn })
      .promise();
    console.log(`🔗 Attached certificate to Thing '${thingName}'`);

    // Fetch Amazon Root CA
    const caPem = await AwsCertificateManager.getAmazonRootCA();

    // Save DB record
    const record = new IdentityCertificates();
    record.identity = device.identity;
    record.name = `AWS IoT Certificate for ${device.identity}`;
    record.cert = certificatePem;
    record.key = keyPair?.PrivateKey || "";
    record.ca = caPem;
    record.certArn = certificateArn;
    record.certId = certificateId;
    await record.save();

    console.log(`✅ Stored new certificate for device '${device.identity}'`);

    return record;
  }

  // ───────────────────────────────────────────────────────────────
  // 🧩 GENERIC CERTIFICATE CREATION (for system identity, etc.)
  // ───────────────────────────────────────────────────────────────
  public async createCertificates(
    identity: string,
  ): Promise<IdentityCertificates> {
    const { certificateArn, certificatePem, keyPair } = await this.iot
      .createKeysAndCertificate({ setAsActive: true })
      .promise();

    const certificateId = certificateArn.split("/").pop()!;
    const policyName = process.env.AWS_IOT_POLICY_NAME || "DefaultDevicePolicy";
    await this.ensurePolicyExists(policyName);

    await this.iot
      .attachPolicy({ policyName, target: certificateArn })
      .promise();
    console.log(`📜 Attached policy '${policyName}' to certificate`);

    const caPem = await AwsCertificateManager.getAmazonRootCA();

    const record = new IdentityCertificates();
    record.identity = identity;
    record.name = `AWS IoT Certificate for ${identity}`;
    record.cert = certificatePem;
    record.key = keyPair?.PrivateKey || "";
    record.ca = caPem;
    record.certArn = certificateArn;
    record.certId = certificateId;
    await record.save();

    console.log(
      `✅ Created new certificate '${certificateId}' for '${identity}'`,
    );
    return record;
  }

  // ───────────────────────────────────────────────────────────────
  // 📜 POLICY ENSURE
  // ───────────────────────────────────────────────────────────────
  private async ensurePolicyExists(policyName: string) {
    try {
      await this.iot.getPolicy({ policyName }).promise();
    } catch (err: any) {
      if (err.code === "ResourceNotFoundException") {
        console.log(`⚙️ Creating policy '${policyName}'...`);
        await this.iot
          .createPolicy({
            policyName,
            policyDocument: JSON.stringify({
              Version: "2012-10-17",
              Statement: [
                {
                  Effect: "Allow",
                  Action: [
                    "iot:Connect",
                    "iot:Publish",
                    "iot:Subscribe",
                    "iot:Receive",
                  ],
                  Resource: "*",
                },
              ],
            }),
          })
          .promise();
        console.log(`✅ Created policy '${policyName}'`);
      } else throw err;
    }
  }

  // ───────────────────────────────────────────────────────────────
  // 🔗 ATTACH EXISTING CERT TO THING
  // ───────────────────────────────────────────────────────────────
  private async attachThingPrincipal(
    thingName: string,
    cert: IdentityCertificates,
  ) {
    try {
      await this.iot
        .attachThingPrincipal({
          thingName,
          principal: cert.certArn,
        })
        .promise();
      console.log(`🔗 Attached certificate to thing '${thingName}'`);
    } catch (err) {
      console.warn(`⚠️ Could not attach Thing principal: ${err}`);
    }
  }

  // ───────────────────────────────────────────────────────────────
  // 📥 FETCH AWS ROOT CA
  // ───────────────────────────────────────────────────────────────
  static async getAmazonRootCA(): Promise<string> {
    const url = "https://www.amazontrust.com/repository/AmazonRootCA1.pem";
    return await fetch(url).then((r) => r.text());
  }
}

// export class AwsCertificateManager {
//   private readonly iot: AWS.Iot;
//   private static _instance: AwsCertificateManager | undefined;
//   private identity: SystemIdentity | null = null;
//   private constructor() {
//     this.iot = new AWS.Iot({
//       region: process.env.AWS_REGION || "us-east-1",
//       accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//       secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//     });
//   }

//   public static get instance(): AwsCertificateManager {
//     if (!this._instance) this._instance = new AwsCertificateManager();
//     return this._instance;
//   }

//   public get id() {
//     if (!this.identity) {
//       throw new Error("Identity not initialized");
//     }
//     return this.identity.identity;
//   }

//   // ───────────────────────────────────────────────────────────────
//   // 🧩 DEFAULT IDENTITY
//   // ───────────────────────────────────────────────────────────────
//   public async ensureDefaultIdentity(name?: string): Promise<SystemIdentity> {
//     let identity = await SystemIdentity.findOne({ where: { primary: true } });

//     if (!identity) {
//       identity = new SystemIdentity();
//       identity.name =
//         name || process.env.SYSTEM_IDENTITY_NAME || "CommandCenter";
//       identity.primary = true;
//       await identity.save();

//       // ✅ Ensure Thing exists
//       try {
//         await this.iot.createThing({ thingName: identity.name }).promise();
//         console.log(`🧱 Created Thing '${identity.name}'`);
//       } catch (err: any) {
//         if (err.code === "ResourceAlreadyExistsException") {
//           console.log(`ℹ️ Thing '${identity.name}' already exists`);
//         } else {
//           throw err;
//         }
//       }

//       // ✅ Create new certificate and attach to Thing
//       const cert = await this.createCertificates(identity.identity);
//       console.log(`✅ Created certificate for '${identity.identity}'`);

//       await this.iot
//         .attachThingPrincipal({
//           thingName: identity.name,
//           principal: cert.certArn,
//         })
//         .promise();

//       console.log(`🔗 Attached certificate to Thing '${identity.name}'`);
//     } else {
//       console.log(`ℹ️ Found existing default identity ${identity.identity}`);
//     }
//     this.identity = identity;
//     return identity;
//   }

//   // ───────────────────────────────────────────────────────────────
//   // 🔒 TERMINATE: FULL THING + CERT DESTRUCTION
//   // ───────────────────────────────────────────────────────────────
//   public async terminateDevice(device: Device): Promise<void> {
//     console.log(`🧹 Terminating device '${device.identity}'...`);

//     const record = await IdentityCertificates.findOne({
//       where: { identity: device.identity },
//     });

//     if (!record) {
//       return;
//     }
//     // Terminate the certificate if one exists
//     if (record) await this.terminateCertificate(record.identity);

//     // Delete the AWS Thing itself
//     try {
//       await this.iot.deleteThing({ thingName: device.identity }).promise();
//       console.log(`🗑️ Deleted Thing '${device.identity}'`);
//     } catch (err: any) {
//       if (err.code === "ResourceNotFoundException") {
//         console.log(`ℹ️ Thing '${device.identity}' already deleted.`);
//       } else {
//         console.warn(`⚠️ Failed to delete Thing '${device.identity}': ${err}`);
//       }
//     }
//   }

//   // ───────────────────────────────────────────────────────────────
//   // 🔐 TERMINATE CERTIFICATE ONLY
//   // ───────────────────────────────────────────────────────────────
//   public async terminateCertificate(deviceIdentity: string): Promise<void> {
//     const record = await IdentityCertificates.findOne({
//       where: { identity: deviceIdentity },
//     });
//     const identity = record.identity;
//     const certificateArn = record.certArn;
//     const certificateId = record.certId;
//     console.log(`🧹 Terminating certificate for '${identity}'...`, record);
//     if (!certificateId || certificateId.length < 64) {
//       console.warn(`⚠️ Invalid or missing certificateId for '${identity}'`);
//       await record.remove();
//       return;
//     }

//     console.log(
//       `🧹 Terminating certificate '${certificateId}' for '${identity}'`,
//     );

//     // Detach from things
//     try {
//       const { things } = await this.iot
//         .listPrincipalThings({ principal: certificateArn })
//         .promise();

//       for (const thingName of things || []) {
//         await this.iot
//           .detachThingPrincipal({ thingName, principal: certificateArn })
//           .promise();
//         console.log(`🔗 Detached from Thing '${thingName}'`);
//       }
//     } catch (err) {
//       console.warn(`⚠️ Could not detach from things: ${err}`);
//     }

//     // Detach policies
//     try {
//       const { policies } = await this.iot
//         .listAttachedPolicies({ target: certificateArn })
//         .promise();

//       for (const policy of policies || []) {
//         await this.iot
//           .detachPolicy({
//             policyName: policy.policyName!,
//             target: certificateArn,
//           })
//           .promise();
//         console.log(`📜 Detached policy '${policy.policyName}'`);
//       }
//     } catch (err) {
//       console.warn(`⚠️ Could not detach policy: ${err}`);
//     }

//     // Deactivate certificate
//     try {
//       await this.iot
//         .updateCertificate({ certificateId, newStatus: "INACTIVE" })
//         .promise();
//       console.log(`🚫 Deactivated certificate '${certificateId}'`);
//     } catch (err) {
//       console.warn(`⚠️ Could not deactivate: ${err}`);
//     }

//     // Delete certificate
//     try {
//       await this.iot
//         .deleteCertificate({ certificateId, forceDelete: true })
//         .promise();
//       console.log(`🗑️ Deleted certificate '${certificateId}'`);
//     } catch (err) {
//       console.warn(`⚠️ Could not delete certificate: ${err}`);
//     }

//     // Remove DB record
//     await record.remove();
//     console.log(`✅ Removed local certificate record for '${identity}'`);
//   }

//   // ───────────────────────────────────────────────────────────────
//   // 🚀 PROVISION NEW DEVICE CERTIFICATE + THING
//   // ───────────────────────────────────────────────────────────────
//   public async provisionDeviceCertificate(
//     device: Device,
//   ): Promise<IdentityCertificates> {
//     const thingName = device.identity;
//     console.log(`🚀 Provisioning device '${thingName}'...`);

//     // Ensure Thing exists
//     try {
//       await this.iot.createThing({ thingName }).promise();
//       console.log(`🧱 Created Thing '${thingName}'`);
//     } catch (err: any) {
//       if (err.code === "ResourceAlreadyExistsException") {
//         console.log(`ℹ️ Thing '${thingName}' already exists`);
//       } else throw err;
//     }

//     // Create certificate + key
//     const { certificateArn, certificatePem, keyPair } = await this.iot
//       .createKeysAndCertificate({ setAsActive: true })
//       .promise();

//     const certificateId = certificateArn.split("/").pop()!;
//     console.log(`🔐 Created new certificate '${certificateId}'`);

//     // Attach default policy
//     const policyName = process.env.AWS_IOT_POLICY_NAME || "DefaultDevicePolicy";
//     await this.ensurePolicyExists(policyName);
//     await this.iot
//       .attachPolicy({ policyName, target: certificateArn })
//       .promise();
//     console.log(`📜 Attached policy '${policyName}'`);

//     // Attach certificate to Thing
//     await this.iot
//       .attachThingPrincipal({ thingName, principal: certificateArn })
//       .promise();
//     console.log(`🔗 Attached certificate to Thing '${thingName}'`);

//     // Fetch Amazon Root CA
//     const caPem = await AwsCertificateManager.getAmazonRootCA();

//     // Save DB record
//     const record = new IdentityCertificates();
//     record.identity = device.identity;
//     record.name = `AWS IoT Certificate for ${device.identity}`;
//     record.cert = certificatePem;
//     record.key = keyPair?.PrivateKey || "";
//     record.ca = caPem;
//     record.certArn = certificateArn;
//     record.certId = certificateId;
//     await record.save();

//     console.log(`✅ Stored new certificate for device '${device.identity}'`);

//     return record;
//   }

//   // ───────────────────────────────────────────────────────────────
//   // 🧩 GENERIC CERTIFICATE CREATION (for system identity, etc.)
//   // ───────────────────────────────────────────────────────────────
//   public async createCertificates(
//     identity: string,
//   ): Promise<IdentityCertificates> {
//     const { certificateArn, certificatePem, keyPair } = await this.iot
//       .createKeysAndCertificate({ setAsActive: true })
//       .promise();

//     const certificateId = certificateArn.split("/").pop()!;
//     const policyName = process.env.AWS_IOT_POLICY_NAME || "DefaultDevicePolicy";
//     await this.ensurePolicyExists(policyName);

//     await this.iot
//       .attachPolicy({ policyName, target: certificateArn })
//       .promise();
//     console.log(`📜 Attached policy '${policyName}' to certificate`);

//     const caPem = await AwsCertificateManager.getAmazonRootCA();

//     const record = new IdentityCertificates();
//     record.identity = identity;
//     record.name = `AWS IoT Certificate for ${identity}`;
//     record.cert = certificatePem;
//     record.key = keyPair?.PrivateKey || "";
//     record.ca = caPem;
//     record.certArn = certificateArn;
//     record.certId = certificateId;
//     await record.save();

//     console.log(
//       `✅ Created new certificate '${certificateId}' for '${identity}'`,
//     );
//     return record;
//   }

//   // ───────────────────────────────────────────────────────────────
//   // 📜 POLICY ENSURE
//   // ───────────────────────────────────────────────────────────────
//   private async ensurePolicyExists(policyName: string) {
//     try {
//       await this.iot.getPolicy({ policyName }).promise();
//     } catch (err: any) {
//       if (err.code === "ResourceNotFoundException") {
//         console.log(`⚙️ Creating policy '${policyName}'...`);
//         await this.iot
//           .createPolicy({
//             policyName,
//             policyDocument: JSON.stringify({
//               Version: "2012-10-17",
//               Statement: [
//                 {
//                   Effect: "Allow",
//                   Action: [
//                     "iot:Connect",
//                     "iot:Publish",
//                     "iot:Subscribe",
//                     "iot:Receive",
//                   ],
//                   Resource: "*",
//                 },
//               ],
//             }),
//           })
//           .promise();
//         console.log(`✅ Created policy '${policyName}'`);
//       } else throw err;
//     }
//   }

//   // ───────────────────────────────────────────────────────────────
//   // 🔗 ATTACH EXISTING CERT TO THING
//   // ───────────────────────────────────────────────────────────────
//   private async attachThingPrincipal(
//     thingName: string,
//     cert: IdentityCertificates,
//   ) {
//     try {
//       await this.iot
//         .attachThingPrincipal({
//           thingName,
//           principal: cert.certArn,
//         })
//         .promise();
//       console.log(`🔗 Attached certificate to thing '${thingName}'`);
//     } catch (err) {
//       console.warn(`⚠️ Could not attach Thing principal: ${err}`);
//     }
//   }

//   // ───────────────────────────────────────────────────────────────
//   // 📥 FETCH AWS ROOT CA
//   // ───────────────────────────────────────────────────────────────
//   static async getAmazonRootCA(): Promise<string> {
//     const url = "https://www.amazontrust.com/repository/AmazonRootCA1.pem";
//     return await fetch(url).then((r) => r.text());
//   }
// }
