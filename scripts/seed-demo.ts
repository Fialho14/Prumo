import nextEnv from "@next/env";
import { closeDatabase, getDatabase, initializeDatabaseFile, inspectDatabaseStatus } from "../src/lib/db/client";
import { seedDemoData } from "../src/lib/seeds/seed";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
const status = await inspectDatabaseStatus();
if (status.code === "not_initialized") await initializeDatabaseFile();
const db = await getDatabase();
await seedDemoData(db);
await closeDatabase();
process.stdout.write("Dados de demonstração adicionados.\n");
