import { apiError, apiSuccess } from "@/lib/http/api";
import { createVerifiedBackup } from "@/lib/services/backups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const backup = await createVerifiedBackup({ reason: "manual" });
    return apiSuccess({
      fileName: backup.fileName,
      checksum: backup.checksum,
      bytes: backup.bytes,
      categories: backup.categories,
      snapshots: backup.snapshots,
    });
  } catch (error) {
    return apiError(error);
  }
}
