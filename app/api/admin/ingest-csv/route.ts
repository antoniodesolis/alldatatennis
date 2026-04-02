/**
 * POST /api/admin/ingest-csv
 * Descarga e ingesta los CSV históricos de Jeff Sackmann.
 * Body JSON: { years: [2023, 2024], charting: true }
 *
 * Ejemplo: curl -X POST http://localhost:3000/api/admin/ingest-csv \
 *   -H "Content-Type: application/json" \
 *   -d '{"years":[2023,2024],"charting":true}'
 *
 * AVISO: puede tardar varios minutos la primera vez.
 */

import { runMigrations } from "../../../../lib/db/schema";
import { ingestSackmannYear, ingestChartingCSV } from "../../../../lib/ingest/sackmann-csv";
import { getDbStats } from "../../../../lib/db/queries";

runMigrations();

export async function POST(req: Request) {
  let body: { years?: number[]; charting?: boolean } = {};
  try { body = await req.json(); } catch { /* sin body */ }

  const years   = body.years ?? [2024];
  const charting = body.charting ?? false;

  const results: Record<string, unknown> = {};

  for (const year of years) {
    if (year < 2010 || year > 2030) continue;
    try {
      results[`sackmann_${year}`] = await ingestSackmannYear(year);
    } catch (err) {
      results[`sackmann_${year}`] = { error: (err as Error).message };
    }
  }

  if (charting) {
    try {
      results["charting"] = await ingestChartingCSV();
    } catch (err) {
      results["charting"] = { error: (err as Error).message };
    }
  }

  const db = getDbStats();
  return Response.json({ ok: true, results, db });
}

export async function GET() {
  const db = getDbStats();
  return Response.json({
    info: "POST { years: [2023,2024], charting: true } para ingestar CSVs históricos",
    db,
  });
}
