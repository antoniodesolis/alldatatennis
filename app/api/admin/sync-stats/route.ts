/**
 * POST /api/admin/sync-stats
 * Dispara manualmente el scraping de partidos terminados hoy.
 * También puede usarse desde Windows Task Scheduler con:
 *   curl -X POST http://localhost:3000/api/admin/sync-stats
 */

import { runMigrations } from "../../../../lib/db/schema";
import { scrapeFinishedMatches } from "../../../../lib/ingest/te-scraper";
import { resetPatterns } from "../../../../lib/analytics/patterns";
import { getDbStats } from "../../../../lib/db/queries";

runMigrations();

export async function POST() {
  try {
    // Obtener partidos del día desde la API interna
    const res = await fetch("http://localhost:3000/api/matches", {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`matches API HTTP ${res.status}`);

    const data = await res.json();
    const matches = data.matches ?? [];

    const { scraped, errors } = await scrapeFinishedMatches(matches);

    // Invalidar patrones de jugadores afectados
    const finished = matches.filter((m: { status: string }) => m.status === "finished");
    const slugs = new Set<string>();
    for (const m of finished) {
      if (m.player1Slug) slugs.add(m.player1Slug);
      if (m.player2Slug) slugs.add(m.player2Slug);
    }
    for (const slug of slugs) resetPatterns(slug);

    const dbStats = getDbStats();

    return Response.json({
      ok: true,
      matchesFound: matches.length,
      finished: finished.length,
      scraped,
      errors,
      patternsInvalidated: slugs.size,
      db: dbStats,
    });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

export async function GET() {
  runMigrations();
  const dbStats = getDbStats();
  return Response.json({ db: dbStats });
}
