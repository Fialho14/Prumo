import { inspectDatabaseStatus } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await inspectDatabaseStatus();
  return Response.json(
    { status: status.code },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
