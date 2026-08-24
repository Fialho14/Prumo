"use server";

import { revalidatePath } from "next/cache";
import { getDatabase, initializeDatabaseFile } from "@/lib/db/client";
import { FinanceError, toSafeError } from "@/lib/domain/errors";
import type { Category, Snapshot, SnapshotValue } from "@/lib/domain/types";
import {
  configureAutomaticBackups,
  createVerifiedBackup,
  maybeCreateAutomaticBackup,
  type AutomaticBackupSettings,
} from "@/lib/services/backups";
import {
  createCategory,
  deleteCategory,
  reorderCategories,
  setCategoryArchived,
  updateCategory,
} from "@/lib/services/categories";
import { getMeta, setMeta } from "@/lib/services/meta";
import {
  createSnapshot,
  deleteSnapshot,
  duplicateSnapshot,
  quickEditSnapshot,
  updateSnapshot,
} from "@/lib/services/snapshots";
import { seedDemoData } from "@/lib/seeds/seed";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

async function action<T>(work: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await work() };
  } catch (error) {
    const safe = toSafeError(error);
    return { ok: false, error: { code: safe.code, message: safe.message } };
  }
}

function refreshFinance() {
  revalidatePath("/");
  revalidatePath("/historico");
  revalidatePath("/categorias");
  revalidatePath("/definicoes");
}

async function assertPersonalDataMode() {
  const db = await getDatabase();
  if ((await getMeta("data_mode", "personal", db)) === "demo") {
    throw new FinanceError(
      "demo_mode_read_only",
      "Estás a explorar dados de demonstração. Apaga-os ou converte-os explicitamente antes de registar dados reais.",
      409,
    );
  }
}

export async function initializeDatabaseAction(): Promise<ActionResult<true>> {
  return action(async () => {
    await initializeDatabaseFile();
    return true as const;
  });
}

export async function createSnapshotAction(input: {
  date: string;
  note?: string | null;
  values: SnapshotValue[];
  allowSameDate?: boolean;
}): Promise<ActionResult<Snapshot>> {
  return action(async () => {
    await assertPersonalDataMode();
    const snapshot = await createSnapshot(input);
    await maybeCreateAutomaticBackup();
    refreshFinance();
    return snapshot;
  });
}

export async function updateSnapshotAction(
  id: string,
  input: {
    date: string;
    note?: string | null;
    values: SnapshotValue[];
    revision: number;
    allowSameDate?: boolean;
  },
): Promise<ActionResult<Snapshot>> {
  return action(async () => {
    await assertPersonalDataMode();
    await createVerifiedBackup({ reason: "pre-delete" });
    const snapshot = await updateSnapshot(id, input);
    await maybeCreateAutomaticBackup();
    refreshFinance();
    return snapshot;
  });
}

export async function deleteSnapshotAction(id: string): Promise<ActionResult<true>> {
  return action(async () => {
    await assertPersonalDataMode();
    await createVerifiedBackup({ reason: "pre-delete" });
    await deleteSnapshot(id);
    refreshFinance();
    return true as const;
  });
}

export async function duplicateSnapshotAction(
  id: string,
  date: string,
): Promise<ActionResult<Snapshot>> {
  return action(async () => {
    await assertPersonalDataMode();
    const snapshot = await duplicateSnapshot(id, date);
    await maybeCreateAutomaticBackup();
    refreshFinance();
    return snapshot;
  });
}

export async function quickEditSnapshotAction(input: {
  categoryId: string;
  amountCents: number;
  date: string;
  allowSameDate?: boolean;
}): Promise<ActionResult<Snapshot>> {
  return action(async () => {
    await assertPersonalDataMode();
    const snapshot = await quickEditSnapshot(input);
    await maybeCreateAutomaticBackup();
    refreshFinance();
    return snapshot;
  });
}

export async function createCategoryAction(input: {
  name: string;
  type: Category["type"];
  color: string;
  icon: string;
}): Promise<ActionResult<Category>> {
  return action(async () => {
    await assertPersonalDataMode();
    const category = await createCategory(input);
    await maybeCreateAutomaticBackup();
    refreshFinance();
    return category;
  });
}

export async function updateCategoryAction(
  id: string,
  input: {
    name: string;
    type: Category["type"];
    color: string;
    icon: string;
    revision?: number;
  },
): Promise<ActionResult<Category>> {
  return action(async () => {
    await assertPersonalDataMode();
    const category = await updateCategory(id, input);
    await maybeCreateAutomaticBackup();
    refreshFinance();
    return category;
  });
}

export async function archiveCategoryAction(
  id: string,
  archived: boolean,
): Promise<ActionResult<true>> {
  return action(async () => {
    await assertPersonalDataMode();
    await setCategoryArchived(id, archived);
    await maybeCreateAutomaticBackup();
    refreshFinance();
    return true as const;
  });
}

export async function deleteCategoryAction(id: string): Promise<ActionResult<true>> {
  return action(async () => {
    await assertPersonalDataMode();
    await createVerifiedBackup({ reason: "pre-delete" });
    await deleteCategory(id);
    refreshFinance();
    return true as const;
  });
}

export async function reorderCategoriesAction(ids: string[]): Promise<ActionResult<true>> {
  return action(async () => {
    await assertPersonalDataMode();
    await reorderCategories(ids);
    await maybeCreateAutomaticBackup();
    refreshFinance();
    return true as const;
  });
}

export async function seedDemoDataAction(): Promise<ActionResult<true>> {
  return action(async () => {
    const db = await getDatabase();
    await seedDemoData(db);
    await setMeta("onboarding_completed", true, db);
    await setMeta("data_mode", "demo", db);
    refreshFinance();
    return true as const;
  });
}

export async function completeEmptyOnboardingAction(): Promise<ActionResult<true>> {
  return action(async () => {
    await setMeta("onboarding_completed", true);
    await setMeta("data_mode", "personal");
    refreshFinance();
    return true as const;
  });
}

export async function resetDemoDataAction(): Promise<ActionResult<true>> {
  return action(async () => {
    const db = await getDatabase();
    if ((await getMeta("data_mode", "personal", db)) !== "demo") {
      throw new FinanceError("not_demo_mode", "A base de dados já está em modo pessoal.", 409);
    }
    const unexpected = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM snapshots WHERE source <> 'demo') AS snapshots,
           (SELECT COUNT(*) FROM categories WHERE id NOT LIKE 'demo-%') AS categories`,
      )
      .get() as { snapshots: number; categories: number };
    if (unexpected.snapshots > 0 || unexpected.categories > 0) {
      throw new FinanceError(
        "demo_contains_personal_changes",
        "Foram encontrados dados acrescentados à demonstração. Cria um backup e converte-a em base pessoal para não perder informação.",
        409,
      );
    }
    await createVerifiedBackup({ database: db, reason: "pre-delete" });
    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare("DELETE FROM snapshots").run();
      db.prepare("DELETE FROM import_batches").run();
      db.prepare("DELETE FROM categories").run();
      db.prepare("DELETE FROM app_meta").run();
      const insert = db.prepare(
        "INSERT INTO app_meta (key, value_json, updated_at) VALUES (?, ?, ?)",
      );
      insert.run("onboarding_completed", JSON.stringify(true), now);
      insert.run("data_mode", JSON.stringify("personal"), now);
    })();
    refreshFinance();
    revalidatePath("/onboarding");
    return true as const;
  });
}

export async function convertDemoToPersonalAction(): Promise<ActionResult<true>> {
  return action(async () => {
    const db = await getDatabase();
    if ((await getMeta("data_mode", "personal", db)) !== "demo") {
      throw new FinanceError("not_demo_mode", "A base de dados já está em modo pessoal.", 409);
    }
    await setMeta("data_mode", "personal", db);
    refreshFinance();
    return true as const;
  });
}

export async function configureAutomaticBackupsAction(
  enabled: boolean,
): Promise<ActionResult<AutomaticBackupSettings>> {
  return action(async () => {
    const settings = await configureAutomaticBackups(enabled);
    revalidatePath("/definicoes");
    revalidatePath("/definicoes/backups");
    return settings;
  });
}
