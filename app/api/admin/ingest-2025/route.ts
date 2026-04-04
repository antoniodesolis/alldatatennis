/**
 * POST /api/admin/ingest-2025
 *
 * Dispara la ingesta histórica de partidos ATP 2025-2026 desde TennisExplorer.
 * Streaming: devuelve cada mes como una línea NDJSON conforme se va procesando.
 *
 * Body (opcional):
 *   { "from": "2025-01-01" }   — fecha de inicio (por defecto 2025-01-01)
 *   { "month": 3, "year": 2025 } — un mes concreto
 *
 * GET /api/admin/ingest-2025  → instrucciones
 */

import { NextRequest } from "next/server";
import { scrapeTeMonth, ingestTEHistory } from "../../../../lib/ingest/te-history";

export async function GET() {
  return Response.json({
    description: "Ingesta histórica ATP 2025 desde TennisExplorer",
    usage: {
      "POST body vacío": "Ingesta completa desde 2025-01-01 hasta hoy (streaming NDJSON)",
      "POST { from: '2025-06-01' }": "Desde una fecha concreta",
      "POST { year: 2025, month: 3 }": "Un mes específico",
    },
    note: "El proceso puede tardar varios minutos. Monitoriza los logs del servidor.",
  });
}

export async function POST(req: NextRequest) {
  let body: { from?: string; year?: number; month?: number } = {};
  try { body = await req.json(); } catch { /* body vacío */ }

  // Modo: un mes específico → respuesta JSON normal
  if (body.year && body.month) {
    const result = await scrapeTeMonth(body.year, body.month);
    return Response.json({ ok: true, result });
  }

  // Modo: ingesta completa → respuesta streaming NDJSON
  const from = body.from ?? "2025-01-01";

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (obj: unknown) =>
        controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));

      send({ status: "started", from, ts: new Date().toISOString() });

      try {
        // Calcular meses a procesar
        const start = new Date(from);
        const now   = new Date();
        const cur   = new Date(start.getFullYear(), start.getMonth(), 1);
        let totalInserted = 0;
        let totalMatches  = 0;

        while (cur <= now) {
          const year  = cur.getFullYear();
          const month = cur.getMonth() + 1;

          const r = await scrapeTeMonth(year, month);
          totalMatches  += r.matches;
          totalInserted += r.inserted;
          send({
            month: `${year}-${String(month).padStart(2, "0")}`,
            matches: r.matches,
            inserted: r.inserted,
            dupes: r.dupes,
          });

          cur.setMonth(cur.getMonth() + 1);
        }

        send({
          status: "done",
          totalMatches,
          totalInserted,
          ts: new Date().toISOString(),
        });
      } catch (err) {
        send({ status: "error", message: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
