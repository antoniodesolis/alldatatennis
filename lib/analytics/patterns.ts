/**
 * Calcula los patrones de un jugador a partir de sus estadísticas acumuladas.
 * Los guarda en player_patterns para evitar recalcular en cada request.
 */

import { getPlayerMatches, savePattern, getPattern, invalidatePatterns } from "../db/queries";
import type { MatchStatRow, PatternRow } from "../db/queries";
import { classifyMatchLength } from "./player-styles";
import type { PlayerStyle } from "./player-styles";

const PATTERN_TTL_MS = 30 * 60 * 1000; // 30 min antes de recalcular

// ── Helpers estadísticos ──────────────────────────────────

function avg(nums: (number | null)[]): number | null {
  const valid = nums.filter((n): n is number => n !== null);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function pct(num: (number | null)[], den: (number | null)[]): number | null {
  let n = 0, d = 0;
  for (let i = 0; i < num.length; i++) {
    if (num[i] !== null && den[i] !== null && den[i]! > 0) {
      n += num[i]!;
      d += den[i]!;
    }
  }
  return d > 0 ? n / d : null;
}

function winRateSplit(rows: MatchStatRow[]): SplitStat {
  const wins   = rows.filter((r) => r.result === "W").length;
  const losses = rows.filter((r) => r.result === "L").length;
  const total  = wins + losses;
  return { matches: rows.length, winRate: total > 0 ? wins / total : null, wins, losses };
}

// ── Tipos públicos ────────────────────────────────────────

export interface SplitStat {
  matches: number;
  winRate: number | null;
  wins: number;
  losses: number;
}

export interface DurationSplits {
  short: SplitStat;   // < 80 min
  medium: SplitStat;  // 80-150 min
  long: SplitStat;    // > 150 min
}

export interface TimeOfDaySplits {
  day: SplitStat;
  evening: SplitStat;
  night: SplitStat;
}

export interface OpponentStyleSplits {
  "big-server": SplitStat;
  "aggressive-baseliner": SplitStat;
  "all-court": SplitStat;
  "counter-puncher": SplitStat;
  "baseliner": SplitStat;
}

export interface TbStats {
  played: number;       // total tiebreaks jugados
  won: number;          // tiebreaks ganados
  winRate: number | null;
}

export interface DecidingSetStats {
  played: number;       // partidos que llegaron al set decisivo
  won: number;          // partidos ganados en el set decisivo
  winRate: number | null;
}

export interface OpponentRankSplits {
  top10: SplitStat;
  top20: SplitStat;
  top50: SplitStat;
  top100: SplitStat;
  rest: SplitStat;
}

export interface Streaks {
  current: number;        // positivo = racha ganadora, negativo = racha perdedora
  longestWin: number;
  longestLoss: number;
}

export interface PlayerPatterns {
  slug: string;
  surface: string;
  windowN: number;
  matchesUsed: number;
  // Win rate
  winRate: number | null;
  wins: number;
  losses: number;
  // Servicio
  avgAces: number | null;
  avgDoubleFaults: number | null;
  firstServePct: number | null;
  firstServeWonPct: number | null;
  secondServeWonPct: number | null;
  bpSavePct: number | null;
  // Break points como restador
  bpConversionPct: number | null;   // bp_converted / bp_opportunities
  // Golpes
  avgWinners: number | null;
  avgUnforced: number | null;
  // Duración media
  avgDuration: number | null;
  // Splits contextuales
  surfaceSplits?: Record<string, SplitStat>;
  durationSplits?: DurationSplits;
  timeOfDaySplits?: TimeOfDaySplits;
  opponentStyleSplits?: OpponentStyleSplits;
  // Nuevos splits
  roundSplits?: Record<string, SplitStat>;          // R128/R64/.../F
  levelSplits?: Record<string, SplitStat>;          // grand-slam/masters-1000/...
  indoorSplits?: { indoor: SplitStat; outdoor: SplitStat };
  tbStats?: TbStats;
  thirdSetStats?: DecidingSetStats;                 // best_of=3 que llegaron al 3er set
  fifthSetStats?: DecidingSetStats;                 // best_of=5 que llegaron al 5o set
  opponentRankSplits?: OpponentRankSplits;
  streaks?: Streaks;
  // Forma reciente (últimos 10)
  recentForm?: string[];
}

// ── Cálculo principal ─────────────────────────────────────

function computeFromRows(rows: MatchStatRow[], teSlug: string, surface: string, windowN: number): PlayerPatterns {
  const limited = rows.slice(0, windowN);
  const wins    = limited.filter((r) => r.result === "W").length;
  const losses  = limited.filter((r) => r.result === "L").length;
  const total   = wins + losses;

  const recentForm = limited.slice(0, 10).map((r) => r.result ?? "?");

  // ── Surface splits (solo en consulta "all") ───────────────
  let surfaceSplits: Record<string, SplitStat> | undefined;
  if (surface === "") {
    const byS: Record<string, MatchStatRow[]> = {};
    for (const r of limited) {
      const s = r.surface ?? "unknown";
      if (!byS[s]) byS[s] = [];
      byS[s].push(r);
    }
    surfaceSplits = {};
    for (const [s, rs] of Object.entries(byS)) {
      surfaceSplits[s] = winRateSplit(rs);
    }
  }

  // ── Duration splits ───────────────────────────────────────
  const byDur: Record<string, MatchStatRow[]> = { short: [], medium: [], long: [] };
  for (const r of limited) {
    const cat = classifyMatchLength(r.duration_min);
    if (cat !== "unknown") byDur[cat].push(r);
  }
  const durationSplits: DurationSplits = {
    short:  winRateSplit(byDur.short),
    medium: winRateSplit(byDur.medium),
    long:   winRateSplit(byDur.long),
  };

  // ── Time-of-day splits ────────────────────────────────────
  const byTod: Record<string, MatchStatRow[]> = { day: [], evening: [], night: [] };
  for (const r of limited) {
    const tod = r.time_of_day;
    if (tod && tod in byTod) byTod[tod].push(r);
  }
  const timeOfDaySplits: TimeOfDaySplits = {
    day:     winRateSplit(byTod.day),
    evening: winRateSplit(byTod.evening),
    night:   winRateSplit(byTod.night),
  };

  // ── Opponent style splits ─────────────────────────────────
  const styleKeys: PlayerStyle[] = ["big-server", "aggressive-baseliner", "all-court", "counter-puncher", "baseliner"];
  const byStyle: Record<string, MatchStatRow[]> = Object.fromEntries(styleKeys.map((k) => [k, []]));
  for (const r of limited) {
    const style = r.opponent_style;
    if (style && style in byStyle) byStyle[style].push(r);
  }
  const opponentStyleSplits: OpponentStyleSplits = {
    "big-server":           winRateSplit(byStyle["big-server"]),
    "aggressive-baseliner": winRateSplit(byStyle["aggressive-baseliner"]),
    "all-court":            winRateSplit(byStyle["all-court"]),
    "counter-puncher":      winRateSplit(byStyle["counter-puncher"]),
    "baseliner":            winRateSplit(byStyle["baseliner"]),
  };

  // ── Round splits ──────────────────────────────────────────
  const roundOrder = ["R128", "R64", "R32", "R16", "QF", "SF", "F", "RR", "BR"];
  const byRound: Record<string, MatchStatRow[]> = {};
  for (const r of limited) {
    const rnd = r.round ?? "unknown";
    if (!byRound[rnd]) byRound[rnd] = [];
    byRound[rnd].push(r);
  }
  const roundSplits: Record<string, SplitStat> = {};
  for (const rnd of [...roundOrder, ...Object.keys(byRound).filter((k) => !roundOrder.includes(k))]) {
    if (byRound[rnd]?.length) roundSplits[rnd] = winRateSplit(byRound[rnd]);
  }

  // ── Level splits ──────────────────────────────────────────
  const levelOrder = ["grand-slam", "masters-1000", "atp-500", "atp-250", "atp-finals", "other"];
  const byLevel: Record<string, MatchStatRow[]> = {};
  for (const r of limited) {
    const lvl = r.tourney_level ?? "other";
    if (!byLevel[lvl]) byLevel[lvl] = [];
    byLevel[lvl].push(r);
  }
  const levelSplits: Record<string, SplitStat> = {};
  for (const lvl of [...levelOrder, ...Object.keys(byLevel).filter((k) => !levelOrder.includes(k))]) {
    if (byLevel[lvl]?.length) levelSplits[lvl] = winRateSplit(byLevel[lvl]);
  }

  // ── Indoor splits ─────────────────────────────────────────
  const indoorRows   = limited.filter((r) => r.indoor === 1);
  const outdoorRows  = limited.filter((r) => r.indoor === 0);
  const indoorSplits = { indoor: winRateSplit(indoorRows), outdoor: winRateSplit(outdoorRows) };

  // ── Tiebreak stats ────────────────────────────────────────
  let tbPlayed = 0, tbWon = 0;
  for (const r of limited) {
    if (r.tb_played != null) tbPlayed += r.tb_played;
    if (r.tb_won   != null) tbWon   += r.tb_won;
  }
  const tbStats: TbStats = {
    played: tbPlayed,
    won: tbWon,
    winRate: tbPlayed > 0 ? tbWon / tbPlayed : null,
  };

  // ── 3rd / 5th set stats ───────────────────────────────────
  const bestOf3Rows = limited.filter((r) => r.best_of === 3);
  const bestOf5Rows = limited.filter((r) => r.best_of === 5);

  const thirdSetRows = bestOf3Rows.filter((r) => r.sets_played === 3);
  const fifthSetRows = bestOf5Rows.filter((r) => r.sets_played != null && r.sets_played >= 4);

  const thirdSetStats: DecidingSetStats = {
    played: thirdSetRows.length,
    won: thirdSetRows.filter((r) => r.result === "W").length,
    winRate: thirdSetRows.length > 0
      ? thirdSetRows.filter((r) => r.result === "W").length / thirdSetRows.length
      : null,
  };

  const fifthSetStats: DecidingSetStats = {
    played: fifthSetRows.length,
    won: fifthSetRows.filter((r) => r.result === "W").length,
    winRate: fifthSetRows.length > 0
      ? fifthSetRows.filter((r) => r.result === "W").length / fifthSetRows.length
      : null,
  };

  // ── Opponent rank splits ──────────────────────────────────
  function rankBucket(rows: MatchStatRow[], maxRank: number): MatchStatRow[] {
    return rows.filter((r) => r.opponent_rank != null && r.opponent_rank <= maxRank);
  }
  const top10  = rankBucket(limited, 10);
  const top20  = rankBucket(limited, 20);
  const top50  = rankBucket(limited, 50);
  const top100 = rankBucket(limited, 100);
  const rest   = limited.filter((r) => r.opponent_rank == null || r.opponent_rank > 100);
  const opponentRankSplits: OpponentRankSplits = {
    top10:  winRateSplit(top10),
    top20:  winRateSplit(top20),
    top50:  winRateSplit(top50),
    top100: winRateSplit(top100),
    rest:   winRateSplit(rest),
  };

  // ── Streaks ───────────────────────────────────────────────
  // limited is sorted DESC by date — compute from newest to oldest
  let currentStreak = 0;
  let longestWin = 0, longestLoss = 0;
  let curWin = 0, curLoss = 0;
  for (const r of [...limited].reverse()) {
    // oldest-first for streak tracking
    if (r.result === "W") {
      curWin++; curLoss = 0;
      if (curWin > longestWin) longestWin = curWin;
    } else if (r.result === "L") {
      curLoss++; curWin = 0;
      if (curLoss > longestLoss) longestLoss = curLoss;
    }
  }
  // current streak from the most recent matches
  let i = 0;
  const first = limited[0]?.result;
  if (first === "W") {
    while (i < limited.length && limited[i].result === "W") { currentStreak++; i++; }
  } else if (first === "L") {
    while (i < limited.length && limited[i].result === "L") { currentStreak--; i++; }
  }
  const streaks: Streaks = { current: currentStreak, longestWin, longestLoss };

  // ── BP conversion as returner ─────────────────────────────
  const bpConversionPct = pct(
    limited.map((r) => r.bp_converted),
    limited.map((r) => r.bp_opportunities)
  );

  // ── Avg duration ─────────────────────────────────────────
  const avgDuration = avg(limited.map((r) => r.duration_min));

  return {
    slug: teSlug,
    surface,
    windowN,
    matchesUsed: limited.length,
    winRate: total > 0 ? wins / total : null,
    wins,
    losses,
    avgAces:          avg(limited.map((r) => r.aces)),
    avgDoubleFaults:  avg(limited.map((r) => r.double_faults)),
    firstServePct:    pct(limited.map((r) => r.first_in), limited.map((r) => r.serve_pts)),
    firstServeWonPct: pct(limited.map((r) => r.first_won), limited.map((r) => r.first_in)),
    secondServeWonPct: pct(
      limited.map((r) => r.second_won),
      limited.map((r) => (r.serve_pts !== null && r.first_in !== null ? r.serve_pts - r.first_in : null))
    ),
    bpSavePct:      pct(limited.map((r) => r.bp_saved), limited.map((r) => r.bp_faced)),
    bpConversionPct,
    avgWinners:     avg(limited.map((r) => r.winners)),
    avgUnforced:    avg(limited.map((r) => r.unforced_errors)),
    avgDuration,
    surfaceSplits,
    durationSplits,
    timeOfDaySplits,
    opponentStyleSplits,
    roundSplits,
    levelSplits,
    indoorSplits,
    tbStats,
    thirdSetStats,
    fifthSetStats,
    opponentRankSplits,
    streaks,
    recentForm,
  };
}

// ── API pública ───────────────────────────────────────────

/** Fecha ISO de hace N meses */
function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Devuelve los patrones para un jugador (con caché de 30 min en DB).
 *
 * Estrategia de recencia:
 *   1. Intenta usar solo los últimos 24 meses (temporadas recientes = más relevantes).
 *   2. Si hay menos de MIN_RECENT_MATCHES con ese filtro, amplía a todo el histórico.
 *   Esto garantiza que Sinner 2024 no se "diluya" con su juego de 2021.
 */
const MIN_RECENT_MATCHES = 15; // mínimo para no caer al histórico completo

export async function getPlayerPatterns(
  teSlug: string,
  surface = "",
  windowN = 30
): Promise<PlayerPatterns | null> {
  const cached = getPattern(teSlug, surface, windowN);
  if (cached && cached.computed_at && Date.now() / 1000 - cached.computed_at < PATTERN_TTL_MS / 1000) {
    return deserializePattern(cached);
  }

  // Primero intenta solo últimos 24 meses
  const since24m = monthsAgo(24);
  let rows = getPlayerMatches(teSlug, { surface: surface || undefined, since: since24m, limit: windowN + 50 });

  // Si hay muy pocos datos recientes, usa todo el histórico
  if (rows.length < MIN_RECENT_MATCHES) {
    rows = getPlayerMatches(teSlug, { surface: surface || undefined, limit: windowN + 100 });
  }

  if (rows.length === 0) return null;

  const result = computeFromRows(rows, teSlug, surface, windowN);

  savePattern({
    te_slug: teSlug,
    surface,
    window_n: windowN,
    computed_at: Math.floor(Date.now() / 1000),
    matches_used: result.matchesUsed,
    win_rate: result.winRate,
    avg_aces: result.avgAces,
    avg_df: result.avgDoubleFaults,
    first_serve_pct: result.firstServePct,
    first_serve_won_pct: result.firstServeWonPct,
    second_serve_won_pct: result.secondServeWonPct,
    bp_save_pct: result.bpSavePct,
    avg_winners: result.avgWinners,
    avg_unforced: result.avgUnforced,
    patterns_json: JSON.stringify({
      surfaceSplits: result.surfaceSplits,
      durationSplits: result.durationSplits,
      timeOfDaySplits: result.timeOfDaySplits,
      opponentStyleSplits: result.opponentStyleSplits,
      roundSplits: result.roundSplits,
      levelSplits: result.levelSplits,
      indoorSplits: result.indoorSplits,
      tbStats: result.tbStats,
      thirdSetStats: result.thirdSetStats,
      fifthSetStats: result.fifthSetStats,
      opponentRankSplits: result.opponentRankSplits,
      streaks: result.streaks,
      bpConversionPct: result.bpConversionPct,
      avgDuration: result.avgDuration,
      wins: result.wins,
      losses: result.losses,
      recentForm: result.recentForm,
    }),
  });

  return result;
}

function deserializePattern(row: PatternRow): PlayerPatterns {
  let extra: Partial<PlayerPatterns> = {};
  try { extra = JSON.parse(row.patterns_json ?? "{}"); } catch { /* ignore */ }

  return {
    slug: row.te_slug,
    surface: row.surface,
    windowN: row.window_n,
    matchesUsed: row.matches_used ?? 0,
    winRate: row.win_rate,
    wins: (extra.wins as number) ?? 0,
    losses: (extra.losses as number) ?? 0,
    avgAces: row.avg_aces,
    avgDoubleFaults: row.avg_df,
    firstServePct: row.first_serve_pct,
    firstServeWonPct: row.first_serve_won_pct,
    secondServeWonPct: row.second_serve_won_pct,
    bpSavePct: row.bp_save_pct,
    avgWinners: row.avg_winners,
    avgUnforced: row.avg_unforced,
    bpConversionPct: extra.bpConversionPct ?? null,
    avgDuration: extra.avgDuration ?? null,
    surfaceSplits: extra.surfaceSplits,
    durationSplits: extra.durationSplits,
    timeOfDaySplits: extra.timeOfDaySplits,
    opponentStyleSplits: extra.opponentStyleSplits,
    roundSplits: extra.roundSplits,
    levelSplits: extra.levelSplits,
    indoorSplits: extra.indoorSplits,
    tbStats: extra.tbStats,
    thirdSetStats: extra.thirdSetStats,
    fifthSetStats: extra.fifthSetStats,
    opponentRankSplits: extra.opponentRankSplits,
    streaks: extra.streaks,
    recentForm: extra.recentForm,
  };
}

export function resetPatterns(teSlug: string) {
  invalidatePatterns(teSlug);
}
