import type { NextRequest } from "next/server";

// Proxy para las fotos de jugadores ATP.
// El CDN de atptour.com devuelve 403 si no hay Referer correcto.
// Esta ruta actúa como intermediario desde el servidor (donde no aplica CORS).

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/photo/[code]">
) {
  const { code } = await ctx.params;

  // Validar: solo letras y números, 4 chars
  if (!/^[a-zA-Z0-9]{2,6}$/.test(code)) {
    return new Response("Invalid code", { status: 400 });
  }

  const atpUrl = `https://www.atptour.com/-/media/alias/player-headshot/${code.toUpperCase()}`;

  try {
    const res = await fetch(atpUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        Referer: "https://www.atptour.com/en/rankings/singles",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok || !res.body) {
      console.warn(`[photo] ATP ${res.status} for code=${code}`);
      return new Response(null, { status: 404 });
    }

    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    return new Response(res.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400", // 24h
      },
    });
  } catch (err) {
    console.error(`[photo] fetch error for code=${code}:`, (err as Error).message);
    return new Response(null, { status: 502 });
  }
}
