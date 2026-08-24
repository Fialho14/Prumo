import { FinanceError } from "@/lib/domain/errors";
import { apiError, apiSuccess } from "@/lib/http/api";
import { MAX_BACKUP_BYTES, previewBackupRestore } from "@/lib/services/backups";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const data = await request.formData();
    const file = data.get("file");
    if (!(file instanceof File)) {
      throw new FinanceError("backup_file_required", "Seleciona um ficheiro de backup JSON.");
    }
    if (file.size === 0 || file.size > MAX_BACKUP_BYTES) {
      throw new FinanceError("invalid_backup_size", "O backup tem de ter no máximo 25 MB.", 413);
    }
    const preview = await previewBackupRestore(await file.arrayBuffer());
    return apiSuccess(preview);
  } catch (error) {
    return apiError(error);
  }
}
