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

  @Column("varchar", {
    name: "container_name",
  })
  public containerName: string;

  @Column("varchar", {
    name: "compose_name",
  })
  public buildPath: string;

  @Column("jsonb", {
    name: "meta",
    default: () => "'{}'",
  })
  public meta: Record<string, any>;

  public seeds() {
    return [
      {
        name: "Hyphen Community",
        url: "git@github.com:similie/hyphen-community.git",
        sshKey: "",
        branch: "main",
        containerName: "similie/platformio-builder:latest",
        buildPath: "hyphen",
        meta: {},
        id: "0cb25098-35ce-4ac6-a950-b43ab6d723c3",
      },
    ];
  }
}
