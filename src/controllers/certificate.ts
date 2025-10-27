import {
  EllipsiesController,
  EllipsiesExtends,
  Get,
  Param,
  Res,
  ExpressResponse,
} from "@similie/ellipsies";
import IdentityCertificates from "../models/certificate";
import JSZip from "jszip";

@EllipsiesExtends("certificates")
export default class IdentityController extends EllipsiesController<IdentityCertificates> {
  public constructor() {
    super(IdentityCertificates, []);
  }
  /**
   * GET /identities/download
   * Returns a ZIP of {cert.pem, key.pem, ca.pem} for a given identity
   */
  @Get("/download/:identity")
  public async downloadCertificate(
    @Param("identity") identity: string,
    @Res() res: ExpressResponse,
  ): Promise<Response> {
    // const { identity } = body;
    if (!identity) {
      return res
        .status(400)
        .json({ error: "Missing 'identity' in request body" });
    }
    const record = await IdentityCertificates.findOne({ where: { identity } });
    if (!record) {
      return res
        .status(404)
        .json({ error: `No certificates found for identity '${identity}'` });
    }
    // 2️⃣ Create ZIP archive
    const zip = new JSZip();
    zip.file(`${identity}/device-cert.pem`, record.cert);
    zip.file(`${identity}/private-key.pem`, record.key);
    zip.file(`${identity}/root-ca.pem`, record.ca);

    const zipBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
    });

    // 3️⃣ Set response headers
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${identity}_certs.zip"`,
    );
    res.setHeader("Content-Length", zipBuffer.length);

    // 4️⃣ Stream the zip buffer
    res.end(zipBuffer);

    console.log(
      `📤 Sent certificate bundle for '${identity}' (${zipBuffer.length} bytes)`,
    );

    return res;
  }
}
