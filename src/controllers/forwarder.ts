import {
  EllipsiesController,
  EllipsiesExtends,
  Body,
  UseBefore,
} from "@similie/ellipsies";
import { Forwarder, ForwarderTemplate, ForwardMap } from "src/models";

@EllipsiesExtends("forwarders")
export class ForwarderController extends EllipsiesController<Forwarder> {
  public constructor() {
    super(Forwarder);
  }
  @UseBefore((req, res, next) => {
    if (res.locals.user && !req.body.creator) {
      req.body.creator = res.locals.user.uid;
    }
    next();
  })
  public override async create(@Body() value: Partial<ForwarderTemplate>) {
    return super.create(value);
  }
}

@EllipsiesExtends("forwardmaps")
export class ForwardMapController extends EllipsiesController<ForwardMap> {
  public constructor() {
    super(ForwardMap);
  }
}

@EllipsiesExtends("forwardtemplates")
export class ForwardTemplateController extends EllipsiesController<ForwarderTemplate> {
  public constructor() {
    super(ForwarderTemplate);
  }
  @UseBefore((req, res, next) => {
    if (res.locals.user && !req.body.owner) {
      req.body.owner = res.locals.user.uid;
    }
    next();
  })
  public override async create(@Body() value: Partial<ForwarderTemplate>) {
    return super.create(value);
  }
}
