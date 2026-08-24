import nextEnv from "@next/env";
import { closeDatabase, initializeDatabaseFile, inspectDatabaseStatus } from "../src/lib/db/client";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const status = await inspectDatabaseStatus();
if (status.code === "not_initialized") {
  await initializeDatabaseFile();
} else if (status.code !== "ready") {
  throw new Error("A base de dados privada não está disponível. Verifica o volume e o caminho configurado.");
} else {
  await initializeDatabaseFile();
}
await closeDatabase();
process.stdout.write("Migrations concluídas.\n");
