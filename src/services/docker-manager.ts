import Docker from "dockerode";
import fs from "fs";
import path from "path";
import { SourceRepository } from "src/models";
import tar from "tar-fs";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

export class BuildComposeManager {
  /**
   * Build a Docker image for one repository
   */
  public static async buildRepositoryImage(
    repo: SourceRepository,
  ): Promise<void> {
    const rootPath = process.cwd(); // or your configured base path
    const dockerfileDir = path.join(rootPath, "build-system", repo.buildPath);

    if (!fs.existsSync(dockerfileDir)) {
      throw new Error(
        `Dockerfile directory not found for ${repo.name}: ${dockerfileDir}`,
      );
    }
    console.log(`🚧 Building image for ${repo.name} from ${dockerfileDir}`);
    const tarStream = tar.pack(dockerfileDir);
    const imageTag = repo.containerName; // e.g. similie/platformio-builder:latest
    const buildStream = await docker.buildImage(tarStream, {
      t: imageTag,
      dockerfile: "Dockerfile",
      // buildargs: {
      //   BRANCH: repo.branch || "main",
      //   REPOSITORY_URL: repo.url,
      // },
    });

    // Stream logs to console
    await new Promise<void>((resolve, reject) => {
      docker.modem.followProgress(
        buildStream,
        (err: any, res: any) => (err ? reject(err) : resolve(res)),
        (event: any) => {
          if (event.stream) process.stdout.write(event.stream);
        },
      );
    });

    console.log(`✅ Built image: ${imageTag}`);
  }
}
