/**
 * Calcula los patrones de un jugador a partir de sus estadísticas acumuladas.
 * Los guarda en player_patterns para evitar recalcular en cada request.
 */

import { getPlayerMatches, savePattern, getPattern, invalidatePatterns } from "../db/queries";
import type { MatchStatRow, PatternRow } from "../db/queries";

const PATTERN_TTL_MS = 30 * 60 * 1000; // 30 min antes de recalcular

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
  firstServePct: number | null;      // 1st serve in %
  firstServeWonPct: number | null;   // pts ganados con 1st serve %
  secondServeWonPct: number | null;  // pts ganados con 2nd serve %
  bpSavePct: number | null;          // break points salvados %
  // Golpes
  avgWinners: number | null;
  avgUnforced: number | null;
  // Por superficie (solo si surface="")
  surfaceSplits?: Record<string, { matches: number; winRate: number | null }>;
  // Trend últimos 5 vs anteriores
  recentForm?: string[]; // ["W","L","W","W","L"]
}

function computeFromRows(rows: MatchStatRow[], teSlug: string, surface: string, windowN: number): PlayerPatterns {
  const limited = rows.slice(0, windowN);
  const wins   = limited.filter((r) => r.result === "W").length;
  const losses = limited.filter((r) => r.result === "L").length;
  const total  = wins + losses;

  const recentForm = limited.slice(0, 10).map((r) => r.result ?? "?");

  // Surface splits (solo cuando consultamos "all")
  let surfaceSplits: Record<string, { matches: number; winRate: number | null }> | undefined;
  if (surface === "") {
    const byS: Record<string, { w: number; l: number }> = {};
    for (const r of limited) {
      const s = r.surface ?? "unknown";
      if (!byS[s]) byS[s] = { w: 0, l: 0 };
      if (r.result === "W") byS[s].w++;
      if (r.result === "L") byS[s].l++;
    }
    surfaceSplits = {};
    for (const [s, { w, l }] of Object.entries(byS)) {
      const tot = w + l;
      surfaceSplits[s] = { matches: tot, winRate: tot > 0 ? w / tot : null };
    }
  }

  return {
    slug: teSlug,
    surface,
    windowN,
    matchesUsed: limited.length,
    winRate: total > 0 ? wins / total : null,
    wins,
    losses,
    avgAces:        avg(limited.map((r) => r.aces)),
    avgDoubleFaults: avg(limited.map((r) => r.double_faults)),
    firstServePct:   pct(limited.map((r) => r.first_in), limited.map((r) => r.serve_pts)),
    firstServeWonPct: pct(limited.map((r) => r.first_won), limited.map((r) => r.first_in)),
    secondServeWonPct: pct(
      limited.map((r) => r.second_won),
      limited.map((r) => (r.serve_pts !== null && r.first_in !== null ? r.serve_pts - r.first_in : null))
    ),
    bpSavePct: pct(limited.map((r) => r.bp_saved), limited.map((r) => r.bp_faced)),
    avgWinners: avg(limited.map((r) => r.winners)),
    avgUnforced: avg(limited.map((r) => r.unforced_errors)),
    surfaceSplits,
    recentForm,
  };
}

/**
 * Devuelve los patrones para un jugador (con caché de 30 min en DB).
 */
export async function getPlayerPatterns(
  teSlug: string,
  surface = "",
  windowN = 20
): Promise<PlayerPatterns | null> {
  // 1. Intentar leer de caché
  const cached = getPattern(teSlug, surface, windowN);
  if (cached && cached.computed_at && Date.now() / 1000 - cached.computed_at < PATTERN_TTL_MS / 1000) {
    return deserializePattern(cached);
  }

  // 2. Calcular desde DB
  const rows = getPlayerMatches(teSlug, { surface: surface || undefined, limit: windowN + 50 });
  if (rows.length === 0) return null;

  const result = computeFromRows(rows, teSlug, surface, windowN);

  // 3. Guardar en caché
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
    patterns_json: JSON.stringify({ surfaceSplits: result.surfaceSplits, recentForm: result.recentForm }),
  });

  return result;
}

function deserializePattern(row: PatternRow): PlayerPatterns {
  let surfaceSplits, recentForm;
  try {
    const extra = JSON.parse(row.patterns_json ?? "{}");
    surfaceSplits = extra.surfaceSplits;
    recentForm = extra.recentForm;
  } catch { /* ignore */ }

  return {
    slug: row.te_slug,
    surface: row.surface,
    windowN: row.window_n,
    matchesUsed: row.matches_used ?? 0,
    winRate: row.win_rate,
    wins: 0, losses: 0, // no guardados individualmente, calculable desde matchesUsed + winRate
    avgAces: row.avg_aces,
    avgDoubleFaults: row.avg_df,
    firstServePct: row.first_serve_pct,
    firstServeWonPct: row.first_serve_won_pct,
    secondServeWonPct: row.second_serve_won_pct,
    bpSavePct: row.bp_save_pct,
    avgWinners: row.avg_winners,
    avgUnforced: row.avg_unforced,
    surfaceSplits,
    recentForm,
  };
}

/**
 * Invalida el caché de patrones de un jugador (llamar tras insertar nuevos partidos).
 */
export function resetPatterns(teSlug: string) {
  invalidatePatterns(teSlug);
}
