import { revalidatePath } from "next/cache";
import { getDatabase } from "@/lib/db/client";
import { FinanceError } from "@/lib/domain/errors";
import { apiError, apiSuccess } from "@/lib/http/api";
import { IMPORT_LIMITS } from "@/lib/import/tabular";
import { maybeCreateAutomaticBackup } from "@/lib/services/backups";
import { commitImportPreview, type ImportMapping } from "@/lib/services/import";
import { getMeta, setMeta } from "@/lib/services/meta";

export const runtime = "nodejs";

function requiredText(data: FormData, key: string): string {
  const value = data.get(key);
  if (typeof value !== "string" || !value) {
    throw new FinanceError("import_preview_required", "Pré-visualiza novamente o ficheiro.", 409);
  }
  return value;
}

export async function POST(request: Request) {
  try {
    const db = await getDatabase();
    if ((await getMeta("data_mode", "personal", db)) === "demo") {
      throw new FinanceError(
        "demo_mode_read_only",
        "Apaga ou converte os dados de demonstração antes de importar o teu histórico.",
        409,
      );
    }
    const data = await request.formData();
    const file = data.get("file");
    if (!(file instanceof File)) {
      throw new FinanceError("import_file_required", "Seleciona novamente o ficheiro a importar.");
    }
    if (file.size === 0 || file.size > IMPORT_LIMITS.fileBytes) {
      throw new FinanceError("invalid_import_size", "O ficheiro tem de ter no máximo 10 MB.", 413);
    }
    let mapping: ImportMapping;
    try {
      mapping = JSON.parse(requiredText(data, "mapping")) as ImportMapping;
    } catch (error) {
      if (error instanceof FinanceError) throw error;
      throw new FinanceError("invalid_import_mapping", "O mapeamento não é válido.");
    }
    const result = await commitImportPreview(
      { data: await file.arrayBuffer(), fileName: file.name, mimeType: file.type },
      {
        mapping,
        expectedFileSha256: requiredText(data, "expectedFileSha256"),
        expectedMappingHash: requiredText(data, "expectedMappingHash"),
        allowDateConflicts: data.get("allowDateConflicts") === "true",
      },
    );
    await setMeta("onboarding_completed", true, db);
    await setMeta("data_mode", "personal", db);
    await maybeCreateAutomaticBackup(db);
    revalidatePath("/");
    revalidatePath("/historico");
    revalidatePath("/categorias");
    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}
