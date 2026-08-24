import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  closeDatabase,
  getDatabase,
  inspectDatabaseStatus,
  type FinanceDatabase,
} from "@/lib/db/client";
import {
  isStorageVolumeAvailable,
  resolveDatabaseConfig,
} from "@/lib/db/config";
import { FinanceError, toSafeError } from "@/lib/domain/errors";

describe("database storage states", () => {
  let originalDatabasePath: string | undefined;
  let originalDatabasePromise: Promise<FinanceDatabase> | undefined;
  let originalFinanceDbPath: string | undefined;
  const temporaryDirectories: string[] = [];

  beforeEach(() => {
    originalFinanceDbPath = process.env.FINANCE_DB_PATH;
    originalDatabasePromise = globalThis.__prumoDatabasePromise;
    originalDatabasePath = globalThis.__prumoDatabasePath;
    delete process.env.FINANCE_DB_PATH;
    globalThis.__prumoDatabasePromise = undefined;
    globalThis.__prumoDatabasePath = undefined;
  });

  afterEach(async () => {
    await closeDatabase();
    if (originalFinanceDbPath === undefined) {
      delete process.env.FINANCE_DB_PATH;
    } else {
      process.env.FINANCE_DB_PATH = originalFinanceDbPath;
    }
    globalThis.__prumoDatabasePromise = originalDatabasePromise;
    globalThis.__prumoDatabasePath = originalDatabasePath;
    while (temporaryDirectories.length > 0) {
      await fs.rm(temporaryDirectories.pop()!, { recursive: true, force: true });
    }
  });

  async function temporaryDirectory(): Promise<string> {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "prumo-storage-"));
    temporaryDirectories.push(directory);
    return directory;
  }

  it("rejeita FINANCE_DB_PATH relativo e expõe um estado invalid_path seguro", async () => {
    process.env.FINANCE_DB_PATH = "dados/finance.db";

    expect(() => resolveDatabaseConfig("/private/tmp/project")).toThrow(
      "FINANCE_DB_PATH tem de ser um caminho absoluto válido.",
    );
    await expect(inspectDatabaseStatus()).resolves.toMatchObject({
      code: "invalid_path",
      configured: true,
      displayPath: "dados/finance.db",
    });
    await expect(getDatabase()).rejects.toThrow(
      "FINANCE_DB_PATH tem de ser um caminho absoluto válido.",
    );
    expect(globalThis.__prumoDatabasePromise).toBeUndefined();
  });

  it("não cria uma base alternativa quando o volume configurado não está montado", async () => {
    const configuredPath = path.join(
      "/Volumes",
      "__prumo_test_volume_unmounted__",
      "Financas",
      "finance.db",
    );
    process.env.FINANCE_DB_PATH = configuredPath;

    await expect(inspectDatabaseStatus()).resolves.toMatchObject({
      code: "volume_unavailable",
      configured: true,
      displayPath: configuredPath,
    });
    await expect(getDatabase()).rejects.toMatchObject({
      name: "FinanceError",
      code: "database_volume_unavailable",
      status: 503,
    });

    await expect(fs.stat(path.dirname(configuredPath))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(globalThis.__prumoDatabasePromise).toBeUndefined();
  });

  it("devolve volume_unavailable para uma pasta configurada inexistente sem a criar", async () => {
    const root = await temporaryDirectory();
    const missingParent = path.join(root, "volume-desmontado", "Financas");
    const configuredPath = path.join(missingParent, "finance.db");
    process.env.FINANCE_DB_PATH = configuredPath;

    await expect(inspectDatabaseStatus()).resolves.toMatchObject({
      code: "volume_unavailable",
      configured: true,
      displayPath: configuredPath,
      detail: "ENOENT",
    });
    await expect(getDatabase()).rejects.toMatchObject({
      code: "database_volume_unavailable",
    });
    await expect(fs.stat(missingParent)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("identifica um ficheiro SQLite corrompido antes de o abrir para escrita", async () => {
    const root = await temporaryDirectory();
    const configuredPath = path.join(root, "finance.db");
    await fs.writeFile(configuredPath, "isto não é uma base de dados SQLite", {
      mode: 0o600,
    });
    process.env.FINANCE_DB_PATH = configuredPath;

    await expect(inspectDatabaseStatus()).resolves.toEqual({
      code: "corrupt",
      configured: true,
      displayPath: configuredPath,
    });
    await expect(getDatabase()).rejects.toMatchObject({
      name: "FinanceError",
      code: "database_corrupt",
      status: 503,
    });
    await expect(fs.readFile(configuredPath, "utf8")).resolves.toBe(
      "isto não é uma base de dados SQLite",
    );
  });

  it("considera disponível um caminho local fora de /Volumes", async () => {
    const root = await temporaryDirectory();
    await expect(
      isStorageVolumeAvailable(path.join(root, "finance.db")),
    ).resolves.toBe(true);
  });
});

describe("safe SQLite errors", () => {
  it.each([
    Object.assign(new Error("read failed"), { code: "SQLITE_IOERR" }),
    Object.assign(new Error("open failed"), { code: "SQLITE_CANTOPEN" }),
    Object.assign(new Error("write failed"), { code: "SQLITE_READONLY" }),
    new Error("disk I/O error"),
    new Error("database is locked"),
  ])("não expõe detalhes de falhas de I/O: %s", (error) => {
    expect(toSafeError(error)).toEqual({
      code: "database_unavailable",
      message:
        "Base de dados privada não disponível. Certifica-te de que o volume está desbloqueado e montado.",
      status: 503,
    });
  });

  it("preserva FinanceError já sanitizado e esconde erros desconhecidos", () => {
    expect(toSafeError(new FinanceError("known", "Mensagem segura", 409))).toEqual({
      code: "known",
      message: "Mensagem segura",
      status: 409,
    });
    expect(toSafeError(new Error("segredo interno"))).toEqual({
      code: "unexpected_error",
      message: "Não foi possível concluir esta operação.",
      status: 500,
    });
  });
});
