import { Entity, Column, EllipsiesBaseModelUUID } from "@similie/ellipsies";
import { EnvCrypt } from "src/services";
import { UUID } from "src/utils/tools";
import { ParameterValueOwnerBy } from "./types/parameter";

@Entity("parameter_value", { schema: "public" })
export class ParameterValue extends EllipsiesBaseModelUUID {
  @Column("varchar", {
    name: "name",
  })
  public name: string;

  @Column("text", {
    name: "description",
    nullable: true,
  })
  public description?: string;

  @Column("varchar", {
    name: "key",
  })
  public key: string;

  @Column("varchar", {
    name: "value",
  })
  public value: string;

  @Column("boolean", {
    name: "secret",
    default: false,
  })
  public secret: boolean;

  @Column("varchar", {
    name: "iv",
    nullable: true,
  })
  public iv?: string;

  @Column("uuid", {
    name: "owner",
    nullable: true,
  })
  public owner?: UUID;

  @Column("varchar", {
    name: "owned_by",
    nullable: true,
    maxLength: 32,
    default: ParameterValueOwnerBy.USER,
  })
  public ownedBy?: ParameterValueOwnerBy;

  public decrypt() {
    if (!this.secret) {
      return this;
    }

    if (!this.iv) {
      throw new Error("We are unable to decrypt this value");
    }

    const envCrypt = new EnvCrypt(this.iv);
    this.value = envCrypt.decrypt(this.value);
    delete this.iv;
    return this;
  }

  public toJSON() {
    if (this.secret) {
      delete this.value;
      delete this.iv;
    }
    return this;
  }

  public static async createValue(values: Partial<ParameterValue>) {
    if (!values.key || !values.name || !values.value) {
      throw new Error(
        "Key, Name, and Value are required to create a Parameter Value",
      );
    }

    if (!values.secret) {
      values.secret = false;
      return this.create(values).save();
    }
    const iv = EnvCrypt.cipherIv();
    const envCrypt = new EnvCrypt(iv);
    values.value = envCrypt.encrypt(values.value);
    values.iv = iv;
    return this.create(values).save();
  }
}

@Entity("forward_map", { schema: "public" })
export class ForwardMap extends EllipsiesBaseModelUUID {
  @Column("varchar", {
    name: "name",
  })
  public name: string;

  @Column("text", {
    name: "description",
    nullable: true,
  })
  public description?: string;

  @Column("jsonb", {
    name: "values",
    default: () => "'[]'",
  })
  public values: Array<Record<string, string>>;
}
