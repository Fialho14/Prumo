import { NextResponse } from "next/server";
import { toSafeError } from "@/lib/domain/errors";

export function apiError(error: unknown): NextResponse {
  const safe = toSafeError(error);
  return NextResponse.json(
    { ok: false, error: { code: safe.code, message: safe.message } },
    { status: safe.status, headers: { "Cache-Control": "no-store" } },
  );
}
export function apiSuccess<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(
    { ok: true, data },
    {
      ...init,
      headers: { "Cache-Control": "no-store", ...init?.headers },
    },
  );
}
