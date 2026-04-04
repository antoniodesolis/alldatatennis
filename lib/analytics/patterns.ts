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

function winRateSplit(rows: MatchStatRow[]): { matches: number; winRate: number | null; wins: number; losses: number } {
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
  // Golpes
  avgWinners: number | null;
  avgUnforced: number | null;
  // Splits contextuales
  surfaceSplits?: Record<string, SplitStat>;
  durationSplits?: DurationSplits;
  timeOfDaySplits?: TimeOfDaySplits;
  opponentStyleSplits?: OpponentStyleSplits;
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
    bpSavePct:   pct(limited.map((r) => r.bp_saved), limited.map((r) => r.bp_faced)),
    avgWinners:  avg(limited.map((r) => r.winners)),
    avgUnforced: avg(limited.map((r) => r.unforced_errors)),
    surfaceSplits,
    durationSplits,
    timeOfDaySplits,
    opponentStyleSplits,
    recentForm,
  };
}

// ── API pública ───────────────────────────────────────────

/**
 * Devuelve los patrones para un jugador (con caché de 30 min en DB).
 */
export async function getPlayerPatterns(
  teSlug: string,
  surface = "",
  windowN = 20
): Promise<PlayerPatterns | null> {
  const cached = getPattern(teSlug, surface, windowN);
  if (cached && cached.computed_at && Date.now() / 1000 - cached.computed_at < PATTERN_TTL_MS / 1000) {
    return deserializePattern(cached);
  }

  const rows = getPlayerMatches(teSlug, { surface: surface || undefined, limit: windowN + 50 });
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
      recentForm: result.recentForm,
    }),
  });

  return result;
}

function deserializePattern(row: PatternRow): PlayerPatterns {
  let extra: {
    surfaceSplits?: Record<string, SplitStat>;
    durationSplits?: DurationSplits;
    timeOfDaySplits?: TimeOfDaySplits;
    opponentStyleSplits?: OpponentStyleSplits;
    recentForm?: string[];
  } = {};
  try { extra = JSON.parse(row.patterns_json ?? "{}"); } catch { /* ignore */ }

  return {
    slug: row.te_slug,
    surface: row.surface,
    windowN: row.window_n,
    matchesUsed: row.matches_used ?? 0,
    winRate: row.win_rate,
    wins: 0,
    losses: 0,
    avgAces: row.avg_aces,
    avgDoubleFaults: row.avg_df,
    firstServePct: row.first_serve_pct,
    firstServeWonPct: row.first_serve_won_pct,
    secondServeWonPct: row.second_serve_won_pct,
    bpSavePct: row.bp_save_pct,
    avgWinners: row.avg_winners,
    avgUnforced: row.avg_unforced,
    ...extra,
  };
}

export function resetPatterns(teSlug: string) {
  invalidatePatterns(teSlug);
}
