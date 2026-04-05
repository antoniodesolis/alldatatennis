/**
 * Scraper de TennisExplorer para partidos terminados del día actual.
 * Extrae: score, surface, round, duración y stats completas de servicio/devolución.
 *
 * La página match-detail de TE contiene una tabla de estadísticas con filas:
 *   Aces | DF | 1st serve % | 1st serve won % | 2nd serve won % |
 *   BP saved/faced | Winners | Unforced errors
 * Una columna por jugador (p1 = winner, p2 = loser en la vista de TE).
 */

import { upsertMatchStat, upsertPlayer, isMatchProcessed, markMatchProcessed } from "../db/queries";
import { normalizeSurface, normalizeRound } from "../analytics/player-resolver";
import { getPlayerStyle, classifyTimeOfDay } from "../analytics/player-styles";
import { analyzeMatch, parseScore } from "../analytics/match-patterns";
import type { PlayerMatchStats } from "../analytics/match-patterns";
import { getDb } from "../db/client";
import type { ATPMatch } from "../../app/api/matches/route";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";

// ── Tipos internos ─────────────────────────────────────────

interface RawPlayerStats {
  aces: number | null;
  doubleFaults: number | null;
  firstServePct: number | null;
  firstServeWonPct: number | null;
  secondServeWonPct: number | null;
  bpSaved: number | null;
  bpFaced: number | null;
  bpConverted: number | null;
  bpOpportunities: number | null;
  winners: number | null;
  unforcedErrors: number | null;
}

interface MatchDetail {
  score: string | null;
  surface: string | null;
  round: string | null;
  durationMin: number | null;
  date: string;
  p1Stats: RawPlayerStats;  // winner (fila superior en TE)
  p2Stats: RawPlayerStats;  // loser
}

const EMPTY_STATS: RawPlayerStats = {
  aces: null, doubleFaults: null,
  firstServePct: null, firstServeWonPct: null, secondServeWonPct: null,
  bpSaved: null, bpFaced: null, bpConverted: null, bpOpportunities: null,
  winners: null, unforcedErrors: null,
};

// ── Helpers de parseo ─────────────────────────────────────

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/** Extrae número entero de "4/6" → [4, 6] o "72%" → [72, null] */
function parseFraction(raw: string): [number | null, number | null] {
  const pct = raw.match(/(\d+)\s*%/);
  if (pct) return [parseInt(pct[1]), null];
  const frac = raw.match(/(\d+)\s*\/\s*(\d+)/);
  if (frac) return [parseInt(frac[1]), parseInt(frac[2])];
  const num = raw.match(/^(\d+)$/);
  if (num) return [parseInt(num[1]), null];
  return [null, null];
}

/**
 * Parsea la tabla de estadísticas de TE.
 * TE usa filas <tr> con celdas: nombre_stat | val_p1 | val_p2
 * El primer jugador listado es siempre el ganador.
 */
function parseStatsTable(html: string): { p1: RawPlayerStats; p2: RawPlayerStats } {
  const p1 = { ...EMPTY_STATS };
  const p2 = { ...EMPTY_STATS };

  // Buscar todas las filas de la tabla de stats
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;

  while ((m = rowRe.exec(html)) !== null) {
    const cells: string[] = [];
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(m[1])) !== null) {
      cells.push(stripTags(cm[1]));
    }
    if (cells.length < 3) continue;

    const label = cells[0].toLowerCase();
    const v1 = cells[1];
    const v2 = cells[2];

    if (/aces?/.test(label)) {
      p1.aces = parseInt(v1) || null;
      p2.aces = parseInt(v2) || null;
    } else if (/double|doble/.test(label)) {
      p1.doubleFaults = parseInt(v1) || null;
      p2.doubleFaults = parseInt(v2) || null;
    } else if (/1st serve[^w]|primer servicio[^g]|1\.?\s*serve[^w]/i.test(label)) {
      p1.firstServePct = parseFraction(v1)[0] != null ? parseFraction(v1)[0]! / 100 : null;
      p2.firstServePct = parseFraction(v2)[0] != null ? parseFraction(v2)[0]! / 100 : null;
    } else if (/1st serve won|1st\s+won|primer servicio ganado/i.test(label)) {
      p1.firstServeWonPct = parseFraction(v1)[0] != null ? parseFraction(v1)[0]! / 100 : null;
      p2.firstServeWonPct = parseFraction(v2)[0] != null ? parseFraction(v2)[0]! / 100 : null;
    } else if (/2nd serve won|2nd\s+won|segundo servicio ganado/i.test(label)) {
      p1.secondServeWonPct = parseFraction(v1)[0] != null ? parseFraction(v1)[0]! / 100 : null;
      p2.secondServeWonPct = parseFraction(v2)[0] != null ? parseFraction(v2)[0]! / 100 : null;
    } else if (/break.*saved|bp.*saved/i.test(label)) {
      const [s1, f1] = parseFraction(v1);
      const [s2, f2] = parseFraction(v2);
      p1.bpSaved = s1; p1.bpFaced = f1;
      p2.bpSaved = s2; p2.bpFaced = f2;
    } else if (/break.*conv|bp.*conv/i.test(label)) {
      const [c1, o1] = parseFraction(v1);
      const [c2, o2] = parseFraction(v2);
      p1.bpConverted = c1; p1.bpOpportunities = o1;
      p2.bpConverted = c2; p2.bpOpportunities = o2;
    } else if (/winner/i.test(label) && !/unforced|error/i.test(label)) {
      p1.winners = parseInt(v1) || null;
      p2.winners = parseInt(v2) || null;
    } else if (/unforced|error no forzado/i.test(label)) {
      p1.unforcedErrors = parseInt(v1) || null;
      p2.unforcedErrors = parseInt(v2) || null;
    }
  }

  return { p1, p2 };
}

// ── Scraper principal ─────────────────────────────────────

async function fetchMatchDetail(teMatchId: string): Promise<MatchDetail | null> {
  try {
    const res = await fetch(
      `https://www.tennisexplorer.com/match-detail/?id=${teMatchId}`,
      {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(10_000),
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

    // Score del partido (formato "6-3 7-6(4)")
    const scoreMatch = html.match(/class="score[^"]*"[^>]*>([^<]{3,40})<\/td>/);
    const score = scoreMatch ? scoreMatch[1].trim() : null;

    // Duración en minutos
    let durationMin: number | null = null;
    const durMatch = html.match(/(\d{1,2}):(\d{2})\s*(?:h|hrs?)?(?:\s|$)/);
    if (durMatch) {
      const h = parseInt(durMatch[1]);
      const min = parseInt(durMatch[2]);
      // Solo válido si parece tiempo de partido (entre 30 min y 5 h)
      const total = h * 60 + min;
      if (total >= 30 && total <= 300) durationMin = total;
    }

    // Fecha
    const dateMatch = html.match(/(\d{4}-\d{2}-\d{2})|(\d{2}\.\d{2}\.\d{4})/);
    let date = new Date().toISOString().slice(0, 10);
    if (dateMatch) {
      const raw = dateMatch[0];
      if (raw.includes(".")) {
        const [d, mo, y] = raw.split(".");
        date = `${y}-${mo}-${d}`;
      } else {
        date = raw;
      }
    }

    // Stats de servicio/devolución
    const { p1: p1Stats, p2: p2Stats } = parseStatsTable(html);

    return { score, surface, round, durationMin, date, p1Stats, p2Stats };
  } catch {
    return null;
  }
}

// ── Guarda insight en match_insights ─────────────────────

async function saveMatchInsight(
  teMatchId: string,
  winnerSlug: string,
  loserSlug: string,
  matchDate: string,
  tournament: string,
  surface: string | null,
  score: string | null,
  detail: MatchDetail,
): Promise<void> {
  const db = getDb();

  const winnerStats: PlayerMatchStats = {
    aces: detail.p1Stats.aces,
    doubleFaults: detail.p1Stats.doubleFaults,
    firstServePct: detail.p1Stats.firstServePct,
    firstServeWonPct: detail.p1Stats.firstServeWonPct,
    secondServeWonPct: detail.p1Stats.secondServeWonPct,
    bpSaved: detail.p1Stats.bpSaved,
    bpFaced: detail.p1Stats.bpFaced,
    bpConverted: detail.p1Stats.bpConverted,
    bpOpportunities: detail.p1Stats.bpOpportunities,
    winners: detail.p1Stats.winners,
    unforcedErrors: detail.p1Stats.unforcedErrors,
  };
  const loserStats: PlayerMatchStats = {
    aces: detail.p2Stats.aces,
    doubleFaults: detail.p2Stats.doubleFaults,
    firstServePct: detail.p2Stats.firstServePct,
    firstServeWonPct: detail.p2Stats.firstServeWonPct,
    secondServeWonPct: detail.p2Stats.secondServeWonPct,
    bpSaved: detail.p2Stats.bpSaved,
    bpFaced: detail.p2Stats.bpFaced,
    bpConverted: detail.p2Stats.bpConverted,
    bpOpportunities: detail.p2Stats.bpOpportunities,
    winners: detail.p2Stats.winners,
    unforcedErrors: detail.p2Stats.unforcedErrors,
  };

  const insight = analyzeMatch(score, winnerStats, loserStats);

  await db.execute({
    sql: `
      INSERT INTO match_insights
        (te_match_id, match_date, winner_slug, loser_slug, tournament, surface, score,
         match_pattern, insights_json, enriched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
      ON CONFLICT(te_match_id) DO UPDATE SET
        match_pattern = excluded.match_pattern,
        insights_json = excluded.insights_json,
        enriched_at   = excluded.enriched_at
    `,
    args: [
      teMatchId, matchDate, winnerSlug, loserSlug,
      tournament, surface, score,
      insight.pattern,
      JSON.stringify(insight),
    ],
  });
}

// ── Derivar sets_played, tb_played, tb_won ────────────────

function deriveSetStats(score: string | null, isWinner: boolean): {
  sets_played: number | null;
  won_deciding: number | null;
  tb_played: number | null;
  tb_won: number | null;
} {
  if (!score) return { sets_played: null, won_deciding: null, tb_played: null, tb_won: null };
  const sets = parseScore(score);
  if (sets.length === 0) return { sets_played: null, won_deciding: null, tb_played: null, tb_won: null };

  const setsPlayed = sets.length;
  const wonDeciding = isWinner && setsPlayed >= 3 ? 1 : 0;
  const tbPlayed = sets.filter((s) => s.tiebreak !== null).length;
  // Winner gana todos sus sets, incluyendo los TBs que ganó (winner > loser en cada set)
  const tbWon = isWinner
    ? sets.filter((s) => s.tiebreak !== null && s.winner > s.loser).length
    : sets.filter((s) => s.tiebreak !== null && s.loser > s.winner).length;

  return { sets_played: setsPlayed, won_deciding: wonDeciding, tb_played: tbPlayed, tb_won: tbWon };
}

// ── API pública ───────────────────────────────────────────

/**
 * Procesa una lista de partidos terminados hoy.
 * Para cada uno que no esté ya en processed_matches, lo scrapea, guarda las
 * stats reales en player_match_stats y el análisis del patrón en match_insights.
 */
export async function scrapeFinishedMatches(matches: ATPMatch[]): Promise<{ scraped: number; errors: number }> {
  const finished = matches.filter((m) => m.status === "finished");
  let scraped = 0;
  let errors = 0;

  const today = new Date().toISOString().slice(0, 10);

  await Promise.all(
    finished.map(async (m) => {
      const teMatchId = `te_${m.id}`;

      if (await isMatchProcessed(teMatchId)) return;

      const detail = await fetchMatchDetail(m.id);
      if (!detail) { errors++; return; }

      const surface = detail.surface ?? m.surface ?? null;
      const round   = detail.round ?? m.round ?? null;
      const matchTime = m.time ?? null;
      const timeOfDay = classifyTimeOfDay(matchTime);

      // Determinar ganador/perdedor desde el match (player1 = ganador cuando winner="player1")
      const winnerSlug = m.winner === "player1" ? m.player1Slug : m.player2Slug;
      const loserSlug  = m.winner === "player1" ? m.player2Slug : m.player1Slug;

      // p1Stats siempre corresponde al ganador en la página de TE
      const winnerRaw = detail.p1Stats;
      const loserRaw  = detail.p2Stats;

      await upsertPlayer({ te_slug: m.player1Slug, atp_code: null, full_name: m.player1, sackmann_id: null });
      await upsertPlayer({ te_slug: m.player2Slug, atp_code: null, full_name: m.player2, sackmann_id: null });

      const winnerSetStats = deriveSetStats(detail.score, true);
      const loserSetStats  = deriveSetStats(detail.score, false);

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
        source: "te_scrape",
        best_of: null, tourney_level: null, indoor: null, opponent_rank: null,
        court_speed: null,
        serve_pts: null, first_in: null, first_won: null, second_won: null,
        serve_games: null, return_pts_won: null,
      };

      // Ganador
      await upsertMatchStat({
        ...base,
        te_slug: winnerSlug,
        opponent_slug: loserSlug,
        opponent_style: getPlayerStyle(loserSlug),
        result: "W",
        aces: winnerRaw.aces,
        double_faults: winnerRaw.doubleFaults,
        bp_saved: winnerRaw.bpSaved,
        bp_faced: winnerRaw.bpFaced,
        bp_converted: winnerRaw.bpConverted,
        bp_opportunities: winnerRaw.bpOpportunities,
        winners: winnerRaw.winners,
        unforced_errors: winnerRaw.unforcedErrors,
        ...winnerSetStats,
      });

      // Perdedor
      await upsertMatchStat({
        ...base,
        te_slug: loserSlug,
        opponent_slug: winnerSlug,
        opponent_style: getPlayerStyle(winnerSlug),
        result: "L",
        aces: loserRaw.aces,
        double_faults: loserRaw.doubleFaults,
        bp_saved: loserRaw.bpSaved,
        bp_faced: loserRaw.bpFaced,
        bp_converted: loserRaw.bpConverted,
        bp_opportunities: loserRaw.bpOpportunities,
        winners: loserRaw.winners,
        unforced_errors: loserRaw.unforcedErrors,
        ...loserSetStats,
      });

      // Guardar análisis del partido en match_insights
      await saveMatchInsight(
        teMatchId, winnerSlug, loserSlug,
        today, m.tournament, surface, detail.score, detail,
      );

      await markMatchProcessed(teMatchId, "stats_found");
      scraped++;
    })
  );

  return { scraped, errors };
}
