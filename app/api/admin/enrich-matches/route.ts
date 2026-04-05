/**
 * POST /api/admin/enrich-matches
 *
 * Enriquece partidos terminados recientes con análisis post-partido:
 *   1. Patrón del partido inferido del marcador (dominio/batalla/irregular/remontada)
 *   2. Búsqueda de crónica web (ATP Tour, prensa deportiva)
 *   3. Extracción de insights tácticos con Claude API (si hay ANTHROPIC_API_KEY)
 *   4. Acumulación de insights en player_insights para mejorar perfiles dinámicamente
 *
 * Parámetros de query:
 *   ?since=YYYY-MM-DD  (default: últimos 7 días)
 *   ?limit=N           (default: 30, max: 100)
 *
 * GET: devuelve stats del sistema de enriquecimiento
 */

import { runMigrations } from "../../../../lib/db/schema";
import { enrichRecentMatches } from "../../../../lib/ingest/match-enricher";
import { getDb } from "../../../../lib/db/client";

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "30"), 100);

    const defaultSince = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);
    const since = url.searchParams.get("since") ?? defaultSince;

    const hasClaudeKey = !!process.env.ANTHROPIC_API_KEY;

    const summary = await enrichRecentMatches(since, limit);

    return Response.json({
      ok: true,
      hasClaudeKey,
      since,
      limit,
      ...summary,
    });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

export async function GET() {
  await runMigrations();
  const db = getDb();

  const totalResult = await db.execute("SELECT COUNT(*) as n FROM match_insights");
  const totalInsights = (totalResult.rows[0] as unknown as { n: number }).n;

  const chronicleResult = await db.execute(
    "SELECT COUNT(*) as n FROM match_insights WHERE chronicle_url IS NOT NULL"
  );
  const withChronicle = (chronicleResult.rows[0] as unknown as { n: number }).n;

  const patternResult = await db.execute(`
    SELECT match_pattern, COUNT(*) as n
    FROM match_insights
    WHERE match_pattern IS NOT NULL
    GROUP BY match_pattern
  `);
  const patternCounts = patternResult.rows as unknown as Array<{ match_pattern: string; n: number }>;

  const playerInsightResult = await db.execute("SELECT COUNT(*) as n FROM player_insights");
  const playerInsightCount = (playerInsightResult.rows[0] as unknown as { n: number }).n;

  const recentResult = await db.execute(`
    SELECT te_match_id, match_date, winner_slug, loser_slug, match_pattern,
           chronicle_src, insights_json IS NOT NULL as has_insights
    FROM match_insights
    ORDER BY enriched_at DESC
    LIMIT 10
  `);
  const recentEnriched = recentResult.rows;

  const hasClaudeKey = !!process.env.ANTHROPIC_API_KEY;

  return Response.json({
    ok: true,
    hasClaudeKey,
    totalMatchInsights: totalInsights,
    withChronicle,
    patterns: Object.fromEntries(patternCounts.map((r) => [r.match_pattern, r.n])),
    playersWithInsights: playerInsightCount,
    recent: recentEnriched,
  });
}
