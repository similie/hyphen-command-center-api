import SystemIdentity from "../models/identity";
import IdentityCertificates from "../models/certificate";
export declare class AwsCertificateManager {
    static ensureDefaultIdentity(): Promise<SystemIdentity>;
    static createCertificates(identity: string): Promise<IdentityCertificates>;
    static getAmazonRootCA(): Promise<string>;
}
//# sourceMappingURL=aws.d.ts.map