import uvicorn
import logging
import shutil
import re
from fastapi import FastAPI, Request
import subprocess, tempfile, os, zipfile, asyncio, stat, textwrap
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)   # ensure your logger will log at DEBUG level
handler = logging.StreamHandler()
# handler.setLevel(logging.DEBUG)   # handler must also allow DEBUG
# formatter = logging.Formatter('%(asctime)s | %(levelname)s | %(name)s | %(message)s')
# handler.setFormatter(formatter)
logger.addHandler(handler)
app = FastAPI()
@app.post("/build")

def extract_build_path(script: str) -> str:
    """
    Extract the build path from the platformio.ini script.
    Looks for a line like: build_dir = /some/path
    """
    env_name = ""
    match = re.search(r"\[env:([a-zA-Z0-9_\-]+)\]", script)
    if match:
        env_name = match.group(1)
    else:
        # fallback or error
        raise ValueError("Environment name not found in script")
    
    if not env_name:
        raise ValueError("Environment name is empty")

    build_path = f".pio/build/{env_name}"
    return build_path

async def build(request: Request):
    payload = await request.json()
    repo = payload["repository"]
    device = payload["device"]
    profile = payload["profile"]
    certs = payload["certificates"]

    # Use delete=False so the directory is *not* removed upon exit
    build_dir = os.path.join("/workspace", "debug_build_" + device["identity"])
    if os.path.exists(build_dir):
        try:
        # remove the directory and all its contents
            shutil.rmtree(build_dir)
        except Exception as e:
            logger.error(f"Could not remove build dir {build_dir}: {e}")
    os.makedirs(build_dir, exist_ok=True)
    os.chdir(build_dir)
    logger.info(f"DEBUG: Using tmpdir: {build_dir}")

    # 1️⃣ Clone repo
    ssh_path = os.path.join(build_dir, "id_rsa")
    key_raw = repo.get("sshKey", "")
    if key_raw:
        key = key_raw.strip().replace("\r\n", "\n")
        with open(ssh_path, "w", newline="\n") as keyfile:
            keyfile.write(key + "\n")
        os.chmod(ssh_path, stat.S_IRUSR | stat.S_IWUSR)
        ssh_dir = os.path.join(build_dir, ".ssh")
        os.makedirs(ssh_dir, exist_ok=True)
        with open(os.path.join(ssh_dir, "config"), "w", newline="\n") as cfg:
            cfg.write(textwrap.dedent("""\
                Host *
                    StrictHostKeyChecking no
                    UserKnownHostsFile /dev/null
            """))
        subprocess.run([
            "git", "config", "--global",
            "core.sshCommand",
            f"ssh -i {ssh_path} -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
        ], check=True)
        logger.info(f"✅ SSH key configured at {ssh_path}")
    else:
        logger.info("ℹ️ No sshKey provided – assuming public repository access")

    subprocess.run(["git", "clone", "-b", repo["branch"], repo["url"], "repo"], check=True)
    os.chdir("repo")

    # 2️⃣ Inject platformio.ini
    script = profile["script"].format(device=device)
    
    with open("platformio.ini", "w", newline="\n") as f:
        f.write(script)
    
    cert_dir = os.path.join("src", "certs")
    os.makedirs(cert_dir, exist_ok=True)
    for name, content in certs.items():
        filepath = os.path.join(cert_dir, name)
        with open(filepath, "w", encoding="utf-8", newline="\n") as f:
            f.write(content)
        logger.info(f"✅ Wrote certificate: {filepath} ({len(content)} bytes)")
        
        # 4️⃣ Patch platformio.ini (if not already present)
    # ini_path = os.path.join(build_dir, "repo", "platformio.ini")
    # with open(ini_path, "r", encoding="utf-8") as f:
    #     lines = f.readlines()

    # if not any("board_build.embed_files" in l for l in lines):
    #     with open(ini_path, "a", encoding="utf-8", newline="\n") as f:
    #         f.write("\nboard_build.embed_files =\n")
    #         f.write("  src/certs/root-ca.pem\n")
    #         f.write("  src/certs/device-cert.pem\n")
    #         f.write("  src/certs/private-key.pem\n")
    #     logger.info("✅ Added embedded certificate config to platformio.ini")
    # else:
    #     logger.info("ℹ️ embed_files already defined, skipping append.")

    # 3️⃣ Copy certificates
    # Write certificates with verification
    for name, content in certs.items():
        filepath = os.path.join("data", name)
        with open(filepath, "w", encoding="utf-8", newline="\n") as f:
            f.write(content)
        
        # VERIFY!
        size = os.path.getsize(filepath)
        logger.info(f"✅ {name}: {size} bytes")
        
        if size == 0:
            raise Exception(f"File is empty: {name}")

    # 4️⃣ Run build
    proc = await asyncio.create_subprocess_shell(
        "pio run && pio run -t buildfs -v",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    async for line in proc.stdout:
        logger.info(line.decode().rstrip())
    await proc.wait()

    # 5️⃣ Package artifacts
    os.makedirs("/workspace/build", exist_ok=True)
    zip_name = f"{device['identity']}.zip"
    zip_path = os.path.join("/workspace/build", zip_name)

    build_path = ".pio/build/esp32dev"
    try:
        build_path = extract_build_path(script)
    except Exception as e:
        logger.error(f"Could not extract build path from script: {e}. Using default path.")
    with zipfile.ZipFile(zip_path, "w") as out:
        for f_name in ["bootloader.bin", "partitions.bin", "firmware.bin", "spiffs.bin"]:
            path = os.path.join(build_path, f_name)
            if os.path.exists(path):
                out.write(path, arcname=f_name)

    logger.info(f"✅ Build artifacts stored at {zip_path}")
    logger.info("🔍 You can inspect this directory inside the container or at /tmp/similie-builds/<buildId> on host")

    return {"status": "done", "artifact": zip_path}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
# @app.post("/build")
# async def build(request: Request):
#     payload = await request.json()
#     repo = payload["repository"]
#     device = payload["device"]
#     profile = payload["profile"]
#     certs = payload["certificates"]
    


#     with tempfile.TemporaryDirectory(delete=False) as tmpdir:
#         os.chdir(tmpdir)
#         logger.info("DEBUG tmpdir =", tmpdir)
#         logger.info("DEBUG cwd =", os.getcwd())
#         # ───────────────────────────────────────────────
#         # 1️⃣ Handle SSH key for private repos
#         ssh_path = os.path.join(tmpdir, "id_rsa")
#         key_raw = repo.get("sshKey", "")
#         if key_raw:
#             logger.info(f"Using SSH key for repo access: {ssh_path}", flush=True)
#             # Normalize line endings and trim whitespace
#             key = key_raw.strip().replace("\r\n", "\n")

#             # Detect header format
#             if key.startswith("-----BEGIN RSA PRIVATE KEY-----"):
#                 logger.info("ℹ️ Detected RSA PEM format", flush=True)
#             elif key.startswith("-----BEGIN OPENSSH PRIVATE KEY-----"):
#                 logger.info("ℹ️ Detected OpenSSH private key format", flush=True)
#             else:
#                 logger.info("⚠️ Unknown key header format, using as-is", flush=True)

#             # Ensure ends with newline
#             if not key.endswith("\n"):
#                 key += "\n"

#             # Write the key file
#             with open(ssh_path, "w", newline="\n") as f:
#                 f.write(key)
#             os.chmod(ssh_path, stat.S_IRUSR | stat.S_IWUSR)
#             logger.info("DEBUG: key path:", ssh_path)
#             logger.info("DEBUG: exists:", os.path.exists(ssh_path))
#             if os.path.exists(ssh_path):
#                 logger.info("DEBUG: mode:", oct(os.stat(ssh_path).st_mode))
#             else:
#                 logger.info("ERROR: key file not found")
#             # Convert if needed: for OpenSSH formats convert to PEM
#             # (optional but helps compatibility)
#             # try:
#             #     subprocess.run(
#             #         ["ssh-keygen", "-p", "-m", "PEM", "-f", ssh_path, "-N", ""],
#             #         check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE
#             #     )
#             #     logger.info("✅ Converted key to PEM format", flush=True)
#             # except subprocess.CalledProcessError as e:
#             #     logger.info(f"⚠️ ssh-keygen PEM conversion failed: {e}", flush=True)

#             # Create SSH config to skip strict host checking
#             ssh_dir = os.path.join(tmpdir, ".ssh")
#             os.makedirs(ssh_dir, exist_ok=True)
#             with open(os.path.join(ssh_dir, "config"), "w", newline="\n") as cfg:
#                 cfg.write(textwrap.dedent("""\
#                     Host *
#                         StrictHostKeyChecking no
#                         UserKnownHostsFile /dev/null
#                 """))
#             os.chmod(os.path.join(ssh_dir, "config"), stat.S_IRUSR | stat.S_IWUSR)

#             # Configure Git to use this identity file
#             subprocess.run([
#                 "git", "config", "--global",
#                 "core.sshCommand",
#                 f"ssh -i {ssh_path} -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
#             ], check=True)
#             logger.info(f"✅ SSH key configured at {ssh_path}", flush=True)
#         else:
#             logger.info("ℹ️ No sshKey provided – assuming public repository access", flush=True)

#         # ───────────────────────────────────────────────
#         # 2️⃣ Clone the repository
#         subprocess.run(
#             ["git", "clone", "-b", repo["branch"], repo["url"], "repo"],
#             check=True
#         )
#         os.chdir("repo")

#         # ───────────────────────────────────────────────
#         # 3️⃣ Inject platformio.ini
#         script = profile["script"].format(device=device)
#         logger.info("Generated platformio.ini:", script)
#         with open("platformio.ini", "w") as f:
#             f.write(script)

#         # ───────────────────────────────────────────────
#         # 4️⃣ Copy certificates into data folder
#         os.makedirs("data", exist_ok=True)
#         for name, content in certs.items():
#             with open(f"data/{name}", "w") as f:
#                 f.write(content)

#         # ───────────────────────────────────────────────
#         # 5️⃣ Run the build
#         proc = await asyncio.create_subprocess_shell(
#             "pio run && pio run -t buildfs",
#             stdout=asyncio.subprocess.PIPE,
#             stderr=asyncio.subprocess.STDOUT
#         )
#         async for line in proc.stdout:
#             logger.info(line.decode().rstrip(), flush=True)
#         await proc.wait()

#         # ───────────────────────────────────────────────
#         # 6️⃣ Package the artifacts
#         zip_name = f"{device['identity']}_artifacts.zip"
#         build_path = ".pio/build/esp32dev"
#         with zipfile.ZipFile(zip_name, "w") as out:
#             for fname in ["bootloader.bin", "partitions.bin", "firmware.bin", "spiffs.bin"]:
#                 path = os.path.join(build_path, fname)
#                 if os.path.exists(path):
#                     out.write(path, arcname=fname)
#         return {"status": "done", "artifact": zip_name}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)