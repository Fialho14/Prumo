import { FinanceError } from "@/lib/domain/errors";
import { apiError, apiSuccess } from "@/lib/http/api";
import { IMPORT_LIMITS } from "@/lib/import/tabular";
import { previewImportFile, type ImportMapping } from "@/lib/services/import";

export const runtime = "nodejs";

function parseMapping(value: FormDataEntryValue | null): ImportMapping | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    return JSON.parse(value) as ImportMapping;
  } catch {
    throw new FinanceError("invalid_import_mapping", "O mapeamento não é válido.");
  }
}
export async function POST(request: Request) {
  try {
    const data = await request.formData();
    const file = data.get("file");
    if (!(file instanceof File)) {
      throw new FinanceError("import_file_required", "Seleciona um ficheiro Excel ou CSV.");
    }
    if (file.size === 0 || file.size > IMPORT_LIMITS.fileBytes) {
      throw new FinanceError("invalid_import_size", "O ficheiro tem de ter no máximo 10 MB.", 413);
    }
    const mapping = parseMapping(data.get("mapping"));
    const sheetName = data.get("sheetName");
    const preview = await previewImportFile(
      { data: await file.arrayBuffer(), fileName: file.name, mimeType: file.type },
      {
        ...(mapping ? { mapping } : {}),
        ...(typeof sheetName === "string" && sheetName ? { sheetName } : {}),
      },
    );
    return apiSuccess(preview);
  } catch (error) {
    return apiError(error);
  }
}
