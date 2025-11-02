import {
  EllipsiesController,
  EllipsiesExtends,
  Body,
  Req,
  ExpressRequest,
  BadRequestError,
  ControllerFunctionNames,
  UseBefore,
  FindOptionsWhere,
  IModelUpdateValues,
} from "@similie/ellipsies";

import { ParameterValue } from "src/models";

@EllipsiesExtends("parameters")
export default class ParameterValueController extends EllipsiesController<ParameterValue> {
  public constructor() {
    super(ParameterValue, [
      ControllerFunctionNames.SCHEMA,
      ControllerFunctionNames.FIND,
      ControllerFunctionNames.CREATE,
      ControllerFunctionNames.DESTROY,
      ControllerFunctionNames.DESTROY_ONE,
      ControllerFunctionNames.UPDATE,
    ]);
  }

  public override async find(
    @Req() req: ExpressRequest,
  ): Promise<ParameterValue[]> {
    const records = await super.find(req);
    return records.map((record) => record.toJSON());
  }
  @UseBefore((req, res, next) => {
    if (res.locals.user && !req.body.owner) {
      req.body.owner = res.locals.user.uid;
    }
    next();
  })
  public override async create(@Body() value: Partial<ParameterValue>) {
    try {
      const record = (await ParameterValue.createValue(
        value,
      )) as ParameterValue;
      return record.toJSON();
    } catch (error) {
      console.error("Error creating Parameter Value:", error);
      throw new BadRequestError("Message and topic are required");
    }
  }

  public override async destroy(
    @Body() value: FindOptionsWhere<ParameterValue>,
  ) {
    try {
      const record = (await super.destroy(value)) as ParameterValue;
      return record.toJSON();
    } catch (error) {
      throw new BadRequestError("Message and topic are required");
    }
  }

  public override async update(
    @Body() value: IModelUpdateValues<ParameterValue>,
  ) {
    try {
      const record = (await super.update(value)) as ParameterValue;
      if (!record) {
        throw new Error("Parameter Value not found for update");
      }
      return record.toJSON();
    } catch (error) {
      throw new BadRequestError("Message and topic are required");
    }
  }
}
