import { FinanceError } from "@/lib/domain/errors";
import { apiError, apiSuccess } from "@/lib/http/api";
import { MAX_BACKUP_BYTES, restoreBackupDocument } from "@/lib/services/backups";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const data = await request.formData();
    const file = data.get("file");
    const expectedChecksum = data.get("expectedChecksum");
    if (!(file instanceof File)) {
      throw new FinanceError("backup_file_required", "Seleciona novamente o backup a restaurar.");
    }
    if (file.size === 0 || file.size > MAX_BACKUP_BYTES) {
      throw new FinanceError("invalid_backup_size", "O backup tem de ter no máximo 25 MB.", 413);
    }
    if (typeof expectedChecksum !== "string") {
      throw new FinanceError("restore_confirmation_required", "Valida o backup antes de restaurar.", 409);
    }
    const result = await restoreBackupDocument(await file.arrayBuffer(), { expectedChecksum });
    return apiSuccess({
      categories: result.categories,
      snapshots: result.snapshots,
      checksum: result.checksum,
    });
  } catch (error) {
    return apiError(error);
  }
}
