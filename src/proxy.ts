import { NextResponse, type NextRequest } from "next/server";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function hostname(value: string | null): string {
  if (!value) return "";
  if (value.startsWith("[")) return value.slice(0, value.indexOf("]") + 1).toLowerCase();
  return value.split(":")[0].toLowerCase();
}

export function proxy(request: NextRequest) {
  const requestHost = hostname(request.headers.get("host"));
  if (!LOCAL_HOSTS.has(requestHost)) {
    return new NextResponse("Acesso permitido apenas a partir deste Mac.", { status: 421 });
  }

  const origin = request.headers.get("origin");
  if (origin && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    try {
      if (!LOCAL_HOSTS.has(new URL(origin).hostname.toLowerCase())) {
        return new NextResponse("Origem inválida.", { status: 403 });
      }
    } catch {
      return new NextResponse("Origem inválida.", { status: 403 });
    }
  }

  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  response.headers.set(
    "Content-Security-Policy",
    `default-src 'self'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`,
  );
  return response;
}

export const config = {
  matcher: "/:path*",
};
