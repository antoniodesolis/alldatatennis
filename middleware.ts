import { NextRequest, NextResponse } from "next/server";

/**
 * Protege todos los endpoints /api/admin/* con ADMIN_SECRET.
 *
 * Acepta el secret en:
 *   - Header: Authorization: Bearer <secret>
 *   - Header: x-admin-secret: <secret>
 *
 * Si ADMIN_SECRET no está configurado en las variables de entorno,
 * los endpoints quedan abiertos (útil en desarrollo local sin configurar).
 */
export function middleware(req: NextRequest) {
  const secret = process.env.ADMIN_SECRET;

  // Sin secret configurado → abierto (dev local)
  if (!secret) return NextResponse.next();

  const authHeader = req.headers.get("authorization");
  const fromBearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const fromHeader = req.headers.get("x-admin-secret");
  const provided   = fromBearer ?? fromHeader;

  if (provided !== secret) {
    return NextResponse.json(
      { error: "Unauthorized", hint: "Requiere Authorization: Bearer <ADMIN_SECRET>" },
      { status: 401 },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/admin/:path*"],
};
