import {
  EllipsiesController,
  EllipsiesExtends,
  Req,
  ExpressRequest,
  Get,
  Post,
  Body,
} from "@similie/ellipsies";
import { Decoder, Device } from "src/models";
import { generateUniqueId, generateUniqueUUID, UUID } from "src/utils/tools";

@EllipsiesExtends("decoders")
export default class DecoderController extends EllipsiesController<Decoder> {
  public constructor() {
    super(Decoder);
  }

  @Post("/test")
  public async runDecoder(
    @Body() body: { payload: string; decoder: Decoder; topic: string },
  ) {
    if (!body.payload || !body.decoder || !body.topic) {
      throw new Error("Payload, topic, and decoder are required");
    }

    const device = {
      name: "Test Device",
      identity: generateUniqueId(),
      notes: "A device for testing",
      meta: {},
    };

    const results = await Decoder.decode(body.decoder, {
      topic: body.topic,
      message: Buffer.from(body.payload),
      uid: generateUniqueUUID(),
      device,
    });
    console.log("Decoder results:", results);
    return { results };
  }

  @Get("/check")
  public async checkDecoder(
    @Req() req: ExpressRequest,
  ): Promise<{ ok: boolean }> {
    const json = JSON.parse(req.query.where || ({} as any));
    const { name } = json;
    console.log("Checking decoder name:", req.query);
    if (!name || typeof name !== "string") {
      return { ok: false };
    }
    const decoder = await Decoder.getByName(name);
    return { ok: !!decoder };
  }
}
