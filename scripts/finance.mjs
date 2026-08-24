import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const host = "127.0.0.1";
const port = 3000;
const url = `http://${host}:${port}`;
const validHealthStates = new Set([
  "ready",
  "not_initialized",
  "volume_unavailable",
  "permission_denied",
  "corrupt",
  "migration_failed",
  "invalid_path",
]);

let serverProcess;

function readLocalEnv() {
  const envPath = path.join(projectDir, ".env.local");
  if (!fs.existsSync(envPath)) return {};
  const entries = {};
  for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    entries[key] = value;
  }
  return entries;
}

function canReachApp() {
  return new Promise((resolve) => {
    const request = http.get(`${url}/api/health`, { timeout: 700 }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        if (body.length < 2_048) body += chunk;
      });
      response.on("end", () => {
        try {
          const payload = JSON.parse(body);
          resolve(response.statusCode === 200 && validHealthStates.has(payload.status));
        } catch {
          resolve(false);
        }
      });
    });
    request.on("error", () => resolve(false));
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
  });
}

function openBrowser() {
  if (process.platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
  }
}

function assertPrivateStorageAvailable(configuredDb) {
  if (!path.isAbsolute(configuredDb) || configuredDb.includes("\0")) {
    throw new Error("FINANCE_DB_PATH tem de ser um caminho absoluto válido.");
  }

  const parent = path.dirname(configuredDb);
  if (!fs.existsSync(parent)) {
    throw new Error(
      "Base de dados privada não disponível. Certifica-te de que o volume está desbloqueado e montado.",
    );
  }

  if (process.platform !== "darwin") return;
  const volumesRoot = "/Volumes";
  const relative = path.relative(volumesRoot, path.normalize(configuredDb));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return;
  const volumeName = relative.split(path.sep)[0];
  const mountPoint = path.join(volumesRoot, volumeName);
  try {
    const rootDevice = fs.statSync(volumesRoot).dev;
    const volumeDevice = fs.statSync(mountPoint).dev;
    if (rootDevice === volumeDevice) throw new Error("not-mounted");
  } catch {
    throw new Error(
      "Base de dados privada não disponível. Certifica-te de que o volume está desbloqueado e montado.",
    );
  }
}

async function hashProject() {
  const hash = crypto.createHash("sha256");
  const roots = ["src", "public", "next.config.ts", "tsconfig.json", "package-lock.json", "package.json"];

  async function add(relativePath) {
    const absolutePath = path.join(projectDir, relativePath);
    const stat = await fsp.lstat(absolutePath).catch(() => null);
    if (!stat) return;
    if (stat.isDirectory()) {
      const children = (await fsp.readdir(absolutePath)).sort();
      for (const child of children) await add(path.join(relativePath, child));
      return;
    }
    if (!stat.isFile()) return;
    hash.update(relativePath);
    hash.update(await fsp.readFile(absolutePath));
  }

  for (const root of roots) await add(root);
  return hash.digest("hex");
}

async function ensureLink(name, target) {
  const link = path.join(projectDir, name);
  const existing = await fsp.lstat(link).catch(() => null);
  if (existing?.isSymbolicLink()) {
    const current = await fsp.readlink(link);
    if (path.resolve(projectDir, current) === target) return;
    await fsp.unlink(link);
  } else if (existing) {
    throw new Error(
      `${name} existe dentro do projeto e ocuparia espaço no volume privado. ` +
        `Move ou apaga esse diretório e volta a executar npm run finance.`,
    );
  }
  await fsp.symlink(target, link, "dir");
}

async function ensureRuntime(localEnv) {
  const runtimeDir = process.env.PRUMO_RUNTIME_DIR?.trim() || localEnv.PRUMO_RUNTIME_DIR?.trim() ||
    path.join(os.homedir(), "Library", "Application Support", "Prumo", "runtime");
  if (!path.isAbsolute(runtimeDir) || runtimeDir.includes("\0")) {
    throw new Error("PRUMO_RUNTIME_DIR tem de ser um caminho absoluto válido.");
  }
  await fsp.mkdir(runtimeDir, { recursive: true, mode: 0o700 });

  const packageJson = await fsp.readFile(path.join(projectDir, "package.json"));
  const packageLock = await fsp.readFile(path.join(projectDir, "package-lock.json"));
  const dependencyHash = crypto.createHash("sha256").update(packageJson).update(packageLock).digest("hex");
  const dependencyStampPath = path.join(runtimeDir, ".dependency-stamp");
  const installedHash = await fsp.readFile(dependencyStampPath, "utf8").catch(() => "");

  if (installedHash !== dependencyHash || !fs.existsSync(path.join(runtimeDir, "node_modules", "next"))) {
    process.stdout.write("A preparar o Prumo pela primeira vez…\n");
    await fsp.writeFile(path.join(runtimeDir, "package.json"), packageJson);
    await fsp.writeFile(path.join(runtimeDir, "package-lock.json"), packageLock);
    const install = spawnSync("npm", ["ci", "--prefix", runtimeDir, "--no-audit", "--no-fund"], {
      cwd: projectDir,
      stdio: "inherit",
    });
    if (install.status !== 0) throw new Error("Não foi possível instalar as dependências locais.");
    await fsp.writeFile(dependencyStampPath, dependencyHash, { mode: 0o600 });
  }

  const nextDir = path.join(runtimeDir, ".next");
  await fsp.mkdir(nextDir, { recursive: true });
  await ensureLink("node_modules", path.join(runtimeDir, "node_modules"));
  await ensureLink(".next", nextDir);
  return runtimeDir;
}

async function waitUntilReady(child) {
  const started = Date.now();
  while (Date.now() - started < 45_000) {
    if (child.exitCode !== null) throw new Error("O servidor terminou antes de ficar pronto.");
    if (await canReachApp()) return;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error("O servidor demorou demasiado tempo a iniciar.");
}

async function main() {
  const prepareOnly = process.argv.includes("--prepare");
  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (!Number.isSafeInteger(nodeMajor) || nodeMajor < 22) {
    throw new Error(`O Prumo precisa de Node.js 22 ou superior (encontrado: ${process.version}).`);
  }

  if (!prepareOnly && await canReachApp()) {
    process.stdout.write(`O Prumo já está aberto em ${url}\n`);
    openBrowser();
    return;
  }

  const localEnv = readLocalEnv();
  const runtimeEnv = { ...localEnv, ...process.env };
  const configuredDb = runtimeEnv.FINANCE_DB_PATH?.trim();
  if (!prepareOnly && configuredDb) assertPrivateStorageAvailable(configuredDb);

  const runtimeDir = await ensureRuntime(localEnv);
  if (prepareOnly) {
    process.stdout.write(`Runtime local preparado em ${runtimeDir}\n`);
    return;
  }

  const projectHash = await hashProject();
  const buildStampPath = path.join(runtimeDir, ".build-stamp");
  const builtHash = await fsp.readFile(buildStampPath, "utf8").catch(() => "");
  const nextBin = path.join(runtimeDir, "node_modules", "next", "dist", "bin", "next");

  if (builtHash !== projectHash || !fs.existsSync(path.join(runtimeDir, ".next", "BUILD_ID"))) {
    process.stdout.write("A atualizar a aplicação local…\n");
    const build = spawnSync(process.execPath, [nextBin, "build", "--webpack"], {
      cwd: projectDir,
      stdio: "inherit",
      env: runtimeEnv,
    });
    if (build.status !== 0) throw new Error("A compilação local falhou.");
    await fsp.writeFile(buildStampPath, projectHash, { mode: 0o600 });
  }

  const child = spawn(
    process.execPath,
    [nextBin, "start", "--hostname", host, "--port", String(port)],
    { cwd: projectDir, stdio: "inherit", env: runtimeEnv },
  );
  serverProcess = child;
  const stop = () => child.kill("SIGTERM");
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  process.once("SIGHUP", stop);

  await waitUntilReady(child);
  process.stdout.write(`\nPrumo pronto em ${url}\n`);
  openBrowser();
  await new Promise((resolve) => child.once("exit", resolve));
}

main().catch((error) => {
  if (serverProcess && serverProcess.exitCode === null) serverProcess.kill("SIGTERM");
  process.stderr.write(`\n${error instanceof Error ? error.message : "Não foi possível iniciar o Prumo."}\n`);
  process.exitCode = 1;
});
