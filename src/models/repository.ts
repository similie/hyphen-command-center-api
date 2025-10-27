import { Entity, Column, EllipsiesBaseModelUUID } from "@similie/ellipsies";

@Entity("repository", { schema: "public" })
export default class SourceRepository extends EllipsiesBaseModelUUID {
  @Column("varchar", {
    name: "name",
  })
  public name: string;

  @Column("varchar", {
    name: "url",
  })
  public url: string;

  @Column("text", {
    name: "ssh_key",
  })
  public sshKey: string;

  @Column("varchar", {
    name: "branch",
  })
  public branch: string;

  @Column("jsonb", {
    name: "meta",
    default: () => "'{}'",
  })
  public meta: Record<string, any>;
}
