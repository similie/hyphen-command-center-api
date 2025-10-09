import AWS from "aws-sdk";
import SystemIdentity from "../models/identity";
import IdentityCertificates from "../models/certificate";
export class AwsCertificateManager {
    iot;
    static _instance;
    constructor() {
        this.iot = new AWS.Iot({
            region: process.env.AWS_REGION || "us-east-1",
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        });
    }
    static get instance() {
        if (!this._instance) {
            this._instance = new AwsCertificateManager();
        }
        return this._instance;
    }
    /** Ensure there's always one primary identity and valid certs */
    async ensureDefaultIdentity() {
        let identity = await SystemIdentity.findOne({
            where: { primary: true },
        });
        if (!identity) {
            identity = new SystemIdentity();
            identity.name = process.env.SYSTEM_IDENTITY_NAME || "CommandCenter";
            identity.primary = true;
            await identity.save();
            const cert = await this.createCertificates(identity.identity);
            console.log(`✅ Created new system identity + certificate for ${identity.identity}`);
            // Optionally, attach Thing to certificate (nice for AWS fleet mgmt)
            await this.attachThingPrincipal(identity.name, cert);
        }
        else {
            console.log(`ℹ️ Found existing default identity ${identity.identity}`);
        }
        return identity;
    }
    /** Create new AWS IoT certificate + attach policy */
    async createCertificates(identity) {
        const { certificateArn, certificatePem, keyPair } = await this.iot
            .createKeysAndCertificate({ setAsActive: true })
            .promise();
        console.log(`🔐 Created new certificate: ${certificateArn}`);
        // 🔸 Attach IoT policy (create it if it doesn't exist yet)
        const policyName = process.env.AWS_IOT_POLICY_NAME || "DefaultDevicePolicy";
        await this.ensurePolicyExists(policyName);
        await this.iot
            .attachPolicy({
            policyName,
            target: certificateArn,
        })
            .promise();
        console.log(`📜 Attached policy '${policyName}' to certificate.`);
        const caPem = await AwsCertificateManager.getAmazonRootCA();
        const record = new IdentityCertificates();
        record.identity = identity;
        record.name = `AWS IoT Certificate for ${identity}`;
        record.cert = certificatePem || "";
        record.key = keyPair?.PrivateKey || "";
        record.ca = caPem;
        await record.save();
        return record;
    }
    /** Ensure a default IoT policy exists, or create it */
    async ensurePolicyExists(policyName) {
        try {
            await this.iot.getPolicy({ policyName }).promise();
            console.log(`ℹ️ Policy '${policyName}' already exists.`);
        }
        catch (err) {
            if (err.code === "ResourceNotFoundException") {
                console.log(`⚙️ Creating new IoT policy '${policyName}'...`);
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
                console.log(`✅ Policy '${policyName}' created.`);
            }
            else {
                throw err;
            }
        }
    }
    /** Attach the cert to a Thing (optional, but best practice) */
    async attachThingPrincipal(thingName, cert) {
        try {
            await this.iot
                .createThing({ thingName })
                .promise()
                .catch(() => { }); // ignore if exists
            const { certificates } = await this.iot
                .listCertificates({ pageSize: 10 })
                .promise();
            // Try to find our matching cert ARN
            const certificateArn = certificates?.find((c) => c.certificateId && cert.cert.includes(c.certificateId))?.certificateArn ?? certificates?.[0]?.certificateArn;
            if (certificateArn) {
                await this.iot
                    .attachThingPrincipal({
                    thingName,
                    principal: certificateArn,
                })
                    .promise();
                console.log(`🔗 Attached certificate to thing '${thingName}'.`);
            }
            else {
                console.warn(`⚠️ No matching certificate ARN found to attach to Thing '${thingName}'.`);
            }
        }
        catch (err) {
            console.warn(`⚠️ Could not attach Thing principal: ${err}`);
        }
    }
    /** Fetch the AWS Root CA */
    static async getAmazonRootCA() {
        const url = "https://www.amazontrust.com/repository/AmazonRootCA1.pem";
        const pem = await fetch(url).then((r) => r.text());
        return pem;
    }
}
