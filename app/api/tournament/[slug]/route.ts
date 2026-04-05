/**
 * GET /api/tournament/[slug]
 *
 * Devuelve datos combinados de un torneo:
 * - model: modelo histórico (tournament_models)
 * - edition: estadísticas de la edición actual (tournament_edition_stats)
 * - recentMatches: últimos 25 partidos terminados (match_insights)
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { getAllCourtModels } from "@/lib/analytics/court-speed";
import type { CourtModel } from "@/lib/analytics/court-speed";
import { getTournamentEditionStats, slugifyTourney } from "@/lib/analytics/tournament-stats";
import type { MatchInsightData } from "@/lib/analytics/match-patterns";

export interface TournamentMatchSummary {
  matchId: string;
  date: string;
  winnerSlug: string;
  loserSlug: string;
  score: string | null;
  pattern: string | null;
  sets: MatchInsightData["sets"];
  hints: string[];
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const db = getDb();

  // ── Modelo histórico ──────────────────────────────────────
  const allModels = await getAllCourtModels();
  const model = allModels.find((m) => slugifyTourney(m.tourney_name) === slug) ?? null;
  const tourneyName = model?.tourney_name ?? null;

  // ── Edición actual ────────────────────────────────────────
  const edition = await getTournamentEditionStats(slug);

  // ── Partidos recientes ────────────────────────────────────
  let recentMatches: TournamentMatchSummary[] = [];
  if (tourneyName) {
    const year = new Date().getFullYear();
    const matchResult = await db.execute({
      sql: `
        SELECT te_match_id, match_date, winner_slug, loser_slug, score, match_pattern, insights_json
        FROM match_insights
        WHERE tournament = ?
          AND strftime('%Y', match_date) = ?
          AND score IS NOT NULL
        ORDER BY match_date DESC
        LIMIT 25
      `,
      args: [tourneyName, String(year)],
    });

    recentMatches = (matchResult.rows as unknown as Array<{
      te_match_id: string;
      match_date: string;
      winner_slug: string;
      loser_slug: string;
      score: string | null;
      match_pattern: string | null;
      insights_json: string | null;
    }>).map((row) => {
      let sets: MatchInsightData["sets"] = [];
      let hints: string[] = [];
      if (row.insights_json) {
        try {
          const ins = JSON.parse(row.insights_json) as MatchInsightData;
          sets = ins.sets;
          hints = ins.narrativeHints ?? [];
        } catch { /* ignore */ }
      }
      return {
        matchId: row.te_match_id,
        date: row.match_date,
        winnerSlug: row.winner_slug,
        loserSlug: row.loser_slug,
        score: row.score,
        pattern: row.match_pattern,
        sets,
        hints,
      };
    });
  }

  // ── Surface desde model o edition ────────────────────────
  const surface = model?.surface ?? edition?.surface ?? null;

  return NextResponse.json({
    ok: true,
    slug,
    tourneyName,
    surface,
    model,
    edition,
    recentMatches,
  });
}
