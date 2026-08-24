import { buildBackupDocument } from "@/lib/services/backups";
import { apiError } from "@/lib/http/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const now = new Date();
    const document = await buildBackupDocument(undefined, now);
    const stamp = now.toISOString().slice(0, 19).replace(/[T:]/g, "-");
    return new Response(`${JSON.stringify(document, null, 2)}\n`, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="prumo-backup-${stamp}.json"`,
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
