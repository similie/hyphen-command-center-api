import { randomUUID } from "crypto";
import Docker, { Container } from "dockerode";
import { ExpressResponse } from "@similie/ellipsies";
import { BuildPayload } from "src/models/types";
import fs from "fs";
import os from "os";
import path from "path";
export class PlatformIOBuilder {
  private static dockerInstance: Docker | null = null;

  public static get docker() {
    if (!this.dockerInstance) {
      this.dockerInstance = new Docker({ socketPath: "/var/run/docker.sock" });
    }
    return this.dockerInstance;
  }

  private static async checkReadyBuild(container: Container) {
    let ready = false;
    for (let i = 0; i < 20; i++) {
      const exec = await container.exec({
        Cmd: [
          "sh",
          "-c",
          "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/docs || true",
        ],
        AttachStdout: true,
        AttachStderr: false,
      });

      const stream = await exec.start({ hijack: true, stdin: false });

      // Some Dockerode versions return { output: Stream }
      const outputStream: any = stream.output || stream;
      let response = "";

      await new Promise<void>((resolve) => {
        outputStream.on("data", (chunk: Buffer) => {
          response += chunk.toString("utf-8");
        });
        outputStream.on("end", () => resolve());
      });

      if (response.includes("200")) {
        console.log(`✅ Container ready`);
        ready = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    return ready;
  }

  public static async executePayload(
    payload: BuildPayload,
    container: Container,
  ) {
    // Send payload to internal endpoint
    const exec = await container.exec({
      Cmd: [
        "curl",
        "-X",
        "POST",
        "-H",
        "Content-Type: application/json",
        "-d",
        JSON.stringify(payload),
        "http://127.0.0.1:8080/build",
      ],
      AttachStdout: true,
      AttachStderr: true,
    });
    return exec.start({ hijack: true, stdin: false });
  }

  public static sanitize = (buffer) => {
    // Replace invalid UTF-8 sequences with replacement char
    const str = buffer.toString("utf8");
    // Remove control characters except newline/tab
    return str
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "")
      .replace(/\n/g, "\ndata: ");
  };

  public static ensureBuildDir(buildId: string) {
    const hostTmpRoot = os.tmpdir(); // System temp dir
    const hostBuildPath = path.join(hostTmpRoot, "similie-builds", buildId);
    fs.mkdirSync(hostBuildPath, { recursive: true });

    return hostBuildPath;
  }
  public static async runBuildContainer(
    payload: BuildPayload,
    res: ExpressResponse,
  ) {
    console.log("Starting build container with payload for device:", payload);
    const buildId = randomUUID();
    const containerName = `similie-builder-${buildId}`;
    console.log(`🚀 Starting container: ${containerName}`);
    const buildPath = this.ensureBuildDir(buildId);
    console.log(`📁 Created host build directory: ${buildPath}`);
    const container: Container = await this.docker.createContainer({
      Image: "similie/platformio-builder:latest",
      name: containerName,
      Tty: false,
      AttachStdout: true,
      AttachStderr: true,
      HostConfig: {
        AutoRemove: false, // manual cleanup
        Binds: [`${buildPath}:/workspace/build`],
      },
      Cmd: ["python", "server.py"],
      WorkingDir: "/workspace",
    });

    await container.start();
    await new Promise((r) => setTimeout(r, 1000));
    // ensure container is running before we do anything
    let inspect = await container.inspect();
    const logs = await container.logs({ stdout: true, stderr: true });
    console.error(
      `🧩 Container ${containerName} logs before exit:\n${logs.toString()}`,
    );
    if (!inspect.State.Running) {
      throw new Error(
        `Container ${containerName} exited immediately with status ${inspect.State.ExitCode}`,
      );
    }

    // attach to logs
    const logStream = await container.logs({
      follow: true,
      stdout: true,
      stderr: true,
      since: 0,
    });

    logStream.on("data", (chunk) => {
      res.write(`data: ${this.sanitize(chunk)}\n\n`);
    });

    let ready = await this.checkReadyBuild(container);

    if (!ready) {
      await container.remove({ force: true });
      throw new Error(`FastAPI in ${containerName} not ready after 10s`);
    }

    const execStream = await this.executePayload(payload, container);
    execStream.on("data", (chunk) => {
      res.write(`data: ${this.sanitize(chunk)}\n\n`);
    });

    // ✅ Wait for the exec command (the build) to finish
    await new Promise<void>((resolve) => {
      execStream.on("end", () => resolve());
    });
    // i want to know the exit code
    // const result = await container.wait();
    await container.remove({ force: true });
    const zipPath = path.join(buildPath, `${payload.device.identity}.zip`);
    if (fs.existsSync(zipPath)) {
      res.write("data: Build complete\n\n");
      res.write(`data: __BUILD_ID__:${buildId}\n\n`);
      res.end();
    } else {
      res.end("Build failed: no artifacts found");
    }
  }
}
