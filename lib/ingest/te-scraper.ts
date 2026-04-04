/**
 * Scraper de TennisExplorer para partidos terminados del día actual.
 * Extrae: score, surface confirmada, round, duración.
 * No tiene stats de servicio (TE no las expone en HTML).
 */

import { upsertMatchStat, upsertPlayer, isMatchProcessed, markMatchProcessed } from "../db/queries";
import { normalizeSurface, normalizeRound } from "../analytics/player-resolver";
import { getPlayerStyle, classifyTimeOfDay } from "../analytics/player-styles";
import type { ATPMatch } from "../../app/api/matches/route";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";

interface MatchDetail {
  score: string | null;
  surface: string | null;
  round: string | null;
  durationMin: number | null;
  date: string;
}

async function fetchMatchDetail(teMatchId: string): Promise<MatchDetail | null> {
  try {
    const res = await fetch(
      `https://www.tennisexplorer.com/match-detail/?id=${teMatchId}`,
      {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(8_000),
      }
    );
    if (!res.ok) return null;
    const html = await res.text();

    // Formato info: "Today, 01:05, Houston, round of 16, clay"
    const infoMatch = html.match(
      /class="boxBasic lGray">[^,]+,\s*[\d:]+,\s*<a[^>]*>[^<]+<\/a>,\s*([^,<]+),\s*([^<\n]+)/i
    );
    const round   = infoMatch ? normalizeRound(infoMatch[1].trim()) : null;
    const surface = infoMatch ? normalizeSurface(infoMatch[2].trim()) : null;

    // Score: buscar resultado tipo "6-3 6-4"
    const scoreMatch = html.match(/class="score[^"]*"[^>]*>([^<]{3,30})<\/td>/);
    const score = scoreMatch ? scoreMatch[1].trim() : null;

    // Duración: "1:25" o "75 min"
    let durationMin: number | null = null;
    const durMatch = html.match(/(\d+):(\d{2})\s*(?:h|hours|hrs)?/);
    if (durMatch) durationMin = parseInt(durMatch[1]) * 60 + parseInt(durMatch[2]);

    // Fecha del partido
    const dateMatch = html.match(/(\d{4}-\d{2}-\d{2})|(\d{2}\.\d{2}\.\d{4})/);
    let date = new Date().toISOString().slice(0, 10);
    if (dateMatch) {
      const raw = dateMatch[0];
      if (raw.includes(".")) {
        const [d, m, y] = raw.split(".");
        date = `${y}-${m}-${d}`;
      } else {
        date = raw;
      }
    }

    return { score, surface, round, durationMin, date };
  } catch {
    return null;
  }
}

/**
 * Procesa una lista de partidos terminados hoy.
 * Para cada uno que no esté ya en processed_matches, lo scrapea y guarda en DB.
 */
export async function scrapeFinishedMatches(matches: ATPMatch[]): Promise<{ scraped: number; errors: number }> {
  const finished = matches.filter((m) => m.status === "finished");
  let scraped = 0;
  let errors = 0;

  const today = new Date().toISOString().slice(0, 10);

  await Promise.all(
    finished.map(async (m) => {
      const teMatchId = `te_${m.id}`;

      if (isMatchProcessed(teMatchId)) return;

      const detail = await fetchMatchDetail(m.id);
      if (!detail) { errors++; return; }

      const surface = detail.surface ?? m.surface ?? null;
      const round   = detail.round ?? m.round ?? null;

      // Hora y franja horaria
      const matchTime  = m.time ?? null;
      const timeOfDay  = classifyTimeOfDay(matchTime);

      // Registrar jugadores
      upsertPlayer({ te_slug: m.player1Slug, atp_code: null, full_name: m.player1, sackmann_id: null });
      upsertPlayer({ te_slug: m.player2Slug, atp_code: null, full_name: m.player2, sackmann_id: null });

      const base = {
        te_match_id: teMatchId,
        match_date: today,
        tournament: m.tournament,
        surface,
        round,
        score: detail.score,
        duration_min: detail.durationMin,
        match_time: matchTime,
        time_of_day: timeOfDay === "unknown" ? null : timeOfDay,
        aces: null, double_faults: null, serve_pts: null,
        first_in: null, first_won: null, second_won: null,
        serve_games: null, bp_saved: null, bp_faced: null,
        return_pts_won: null, winners: null, unforced_errors: null,
        source: "te_scrape",
        best_of: null, tourney_level: null, indoor: null, opponent_rank: null,
        sets_played: null, won_deciding: null, tb_played: null, tb_won: null,
        bp_converted: null, bp_opportunities: null, court_speed: null,
      };

      upsertMatchStat({
        ...base,
        te_slug: m.player1Slug,
        opponent_slug: m.player2Slug,
        opponent_style: getPlayerStyle(m.player2Slug),
        result: null,
      });
      upsertMatchStat({
        ...base,
        te_slug: m.player2Slug,
        opponent_slug: m.player1Slug,
        opponent_style: getPlayerStyle(m.player1Slug),
        result: null,
      });

      markMatchProcessed(teMatchId, "stats_found");
      scraped++;
    })
  );

  return { scraped, errors };
}
