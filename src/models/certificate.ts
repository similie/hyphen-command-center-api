import { Entity, Column, EllipsiesBaseModelUUID } from "@similie/ellipsies";

@Entity("certificate", { schema: "public" })
export default class IdentityCertificates extends EllipsiesBaseModelUUID {
  @Column("varchar", {
    name: "name",
  })
  public name: string;
  @Column("varchar", {
    name: "identity",
    unique: true,
  })
  public identity: string;
  @Column("text", {
    name: "cert",
  })
  public cert: string;
  @Column("text", {
    name: "key",
  })
  public key: string;

  @Column("text", {
    name: "ca",
    default: false,
  })
  public ca: string;

  @Column("text", {
    name: "cert_id",
    unique: true,
    // nullable: true,
  })
  public certId: string;

  @Column("text", {
    name: "cert_arn",
    unique: true,
    nullable: true,
  })
  public certArn: string;

  // ... Add more fields as needed
}
