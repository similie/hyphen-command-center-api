import * as Ellipsies from "@similie/ellipsies";
const { EllipsiesController, EllipsiesExtends } = Ellipsies;
import IdentityCertificates from "../models/identity";

@EllipsiesExtends("users")
export default class IdentityController extends EllipsiesController<IdentityCertificates> {
  public constructor() {
    super(IdentityCertificates);
  }
  /**
   * Create a custom route
   */
}
