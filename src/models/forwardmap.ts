import { Entity, Column, EllipsiesBaseModelUUID } from "@similie/ellipsies";

import { UUID, EnvCrypt } from "@similie/hyphen-command-server-types";
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
    length: 32,
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

  public seeds() {
    return [
      {
        name: "40x0 BatteryMapper to Parabl",
        description:
          "Maps the values of the Hyphen Elemental 4060 or 4070 series of batteries",
        values: {
          b_p: "battery_power",
          b_v: "battery_voltage",
          bat: "bat_percent",
          s_v: "solar_voltage",
        },
        id: "ff2b45c2-516d-45db-b158-d9727fcfd701",
      },
      {
        name: "All Weather Mapping to Parabl",
        description:
          "This is the mapping for the values off the all weather stations",
        values: {
          h: "humidity",
          p: "pressure",
          s: "strikes",
          t: "temperature",
          x: "x_orientation",
          y: "y_orientation",
          wd: "wind_direction",
          ws: "wind_speed",
          a_p: "atmospheric_pressure",
          gws: "gust_wind_speed",
          hst: "humidity_sensor_temperature",
          pre: "precipitation",
          s_d: "strike_distance",
          sol: "solar",
          wse: "wind_speed_east",
          wsn: "wind_speed_north",
        },
        id: "b66c4262-e94f-48b9-b07f-c17123d9844e",
      },
      {
        name: "SoilMoisture to Parabl ",
        description: "This maps the soil moisture sensors to parabl",
        values: {
          s_t: "soil_temp",
          vwc: "vwc",
          s_t_1: "soil_temp",
          s_t_2: "soil_temp_1",
          vwc_1: "vwc",
          vwc_2: "vwc_1",
        },
        id: "609f429b-2df2-4aab-bc37-561f0fb07c0f",
      },
    ];
  }
}
