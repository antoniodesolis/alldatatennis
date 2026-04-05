/**
 * Calcula los patrones de un jugador a partir de sus estadísticas acumuladas.
 * Los guarda en player_patterns para evitar recalcular en cada request.
 */

import { getPlayerMatches, savePattern, getPattern, invalidatePatterns } from "../db/queries";
import type { MatchStatRow, PatternRow } from "../db/queries";
import { classifyMatchLength } from "./player-styles";
import type { PlayerStyle } from "./player-styles";
import { canonicalSlug } from "./player-resolver";

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
  /**
   * Calidad ponderada de victorias: cada resultado se pondera según el ranking del rival.
   * rank 1-10 → 2.0, 11-25 → 1.5, 26-50 → 1.2, 51-100 → 1.0, >100 → 0.6, null → 0.8
   * Valor en [0, 1] — mayor que winRate indica victorias contra rivales top.
   */
  qualityWinRate: number | null;
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
  courtSpeedSplits?: {             // rendimiento por velocidad de pista
    fast: SplitStat;               // court_speed >= 65
    mediumFast: SplitStat;         // 45-64
    medium: SplitStat;             // 25-44
    slow: SplitStat;               // < 25
  };
  courtStats?: Record<string, {    // por torneo individual (tournaments con ≥5 partidos)
    speed: number;
    profile: string;
    split: SplitStat;
  }>;
  streaks?: Streaks;
  // Forma reciente (últimos 10)
  recentForm?: string[];
}

// ── Cálculo principal ─────────────────────────────────────

function computeFromRows(rows: MatchStatRow[], teSlug: string, surface: string, windowN: number): PlayerPatterns {
  /**
   * Los datos vienen de dos fuentes con columnas distintas:
   *   sackmann_csv  → result, surface, aces, serve stats, opponent_rank, tourney_level, score, etc.
   *   charting_csv  → winners, unforced_errors  (result y surface son NULL)
   *   te_history    → result, surface, score, sets_played, tb_played (sin round ni BP)
   *
   * Tres ventanas con políticas distintas:
   *   resultRows  → filas con result != null, limitado a windowN (forma reciente)
   *   serveRows   → filas con datos de saque/BP (sackmann), SIN límite de ventana
   *                 ya que te_history no tiene estos datos — limitar ocultaría stats válidas
   *   shotRows    → filas con winners != null (charting), SIN límite
   *
   * roundSplits y tbStats también usan TODO el dataset (no solo resultRows recientes)
   * porque te_history no tiene round ni BP, y los datos sackmann son anteriores.
   */
  const resultRows    = rows.filter((r) => r.result !== null).slice(0, windowN);
  const serveRows     = rows.filter((r) => r.first_in !== null || r.aces !== null);
  const shotRows      = rows.filter((r) => r.winners !== null);
  // Para ronda y tiebreaks: todos los rows con resultado real (sin recortar a windowN)
  const allResultRows = rows.filter((r) => r.result !== null);

  const wins   = resultRows.filter((r) => r.result === "W").length;
  const losses = resultRows.filter((r) => r.result === "L").length;
  const total  = wins + losses;

  // Forma reciente desde resultRows
  const recentForm = resultRows.slice(0, 10).map((r) => r.result ?? "?");

  // ── Surface splits (solo en consulta "all") ───────────────
  let surfaceSplits: Record<string, SplitStat> | undefined;
  if (surface === "") {
    const byS: Record<string, MatchStatRow[]> = {};
    for (const r of resultRows) {
      const s = r.surface ?? "unknown";
      if (s === "unknown") continue;  // ignorar filas sin superficie
      if (!byS[s]) byS[s] = [];
      byS[s].push(r);
    }
    if (Object.keys(byS).length > 0) {
      surfaceSplits = {};
      for (const [s, rs] of Object.entries(byS)) {
        surfaceSplits[s] = winRateSplit(rs);
      }
    }
  }

  // ── Duration splits ───────────────────────────────────────
  const byDur: Record<string, MatchStatRow[]> = { short: [], medium: [], long: [] };
  for (const r of resultRows) {
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
  for (const r of resultRows) {
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
  for (const r of resultRows) {
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
  // Usa allResultRows (histórico completo) porque te_history no tiene round.
  // Excluye qualifying (Q, Q1, Q2) del split — se registran pero no distorsionan el análisis.
  const QUALIFYING_ROUNDS = new Set(["Q", "Q1", "Q2", "QUAL", "QUALIFYING"]);
  const roundOrder = ["R128", "R64", "R32", "R16", "QF", "SF", "F", "RR", "BR"];
  const byRound: Record<string, MatchStatRow[]> = {};
  for (const r of allResultRows) {
    const rnd = r.round ?? "unknown";
    if (rnd === "unknown") continue;
    if (QUALIFYING_ROUNDS.has(rnd.toUpperCase())) continue;   // skip qualifying
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
  for (const r of resultRows) {
    const lvl = r.tourney_level ?? "other";
    if (!byLevel[lvl]) byLevel[lvl] = [];
    byLevel[lvl].push(r);
  }
  const levelSplits: Record<string, SplitStat> = {};
  for (const lvl of [...levelOrder, ...Object.keys(byLevel).filter((k) => !levelOrder.includes(k))]) {
    if (byLevel[lvl]?.length) levelSplits[lvl] = winRateSplit(byLevel[lvl]);
  }

  // ── Indoor splits ─────────────────────────────────────────
  const indoorRows  = resultRows.filter((r) => r.indoor === 1);
  const outdoorRows = resultRows.filter((r) => r.indoor === 0);
  const indoorSplits = { indoor: winRateSplit(indoorRows), outdoor: winRateSplit(outdoorRows) };

  // ── Tiebreak stats ────────────────────────────────────────
  // Usa allResultRows: sackmann tiene datos ricos; te_history solo tiene 0s (straight sets)
  // en su mayoría, pero aun así es más completo que los windowN recientes sin datos.
  let tbPlayed = 0, tbWon = 0;
  for (const r of allResultRows) {
    if (r.tb_played != null) tbPlayed += r.tb_played;
    if (r.tb_won   != null) tbWon   += r.tb_won;
  }
  const tbStats: TbStats = {
    played: tbPlayed,
    won: tbWon,
    winRate: tbPlayed > 0 ? tbWon / tbPlayed : null,
  };

  // ── 3rd / 5th set stats ───────────────────────────────────
  // Usa allResultRows para capturar más sets decisivos del histórico
  const bestOf3Rows = allResultRows.filter((r) => r.best_of === 3);
  const bestOf5Rows = allResultRows.filter((r) => r.best_of === 5);

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
  function rankBucket(src: MatchStatRow[], maxRank: number): MatchStatRow[] {
    return src.filter((r) => r.opponent_rank != null && r.opponent_rank <= maxRank);
  }
  const top10  = rankBucket(resultRows, 10);
  const top20  = rankBucket(resultRows, 20);
  const top50  = rankBucket(resultRows, 50);
  const top100 = rankBucket(resultRows, 100);
  const rankRest = resultRows.filter((r) => r.opponent_rank == null || r.opponent_rank > 100);
  const opponentRankSplits: OpponentRankSplits = {
    top10:  winRateSplit(top10),
    top20:  winRateSplit(top20),
    top50:  winRateSplit(top50),
    top100: winRateSplit(top100),
    rest:   winRateSplit(rankRest),
  };

  // ── Streaks ───────────────────────────────────────────────
  // resultRows sorted DESC — iterate oldest-first for streak tracking
  let currentStreak = 0;
  let longestWin = 0, longestLoss = 0;
  let curWin = 0, curLoss = 0;
  for (const r of [...resultRows].reverse()) {
    if (r.result === "W") {
      curWin++; curLoss = 0;
      if (curWin > longestWin) longestWin = curWin;
    } else if (r.result === "L") {
      curLoss++; curWin = 0;
      if (curLoss > longestLoss) longestLoss = curLoss;
    }
  }
  let si = 0;
  const firstResult = resultRows[0]?.result;
  if (firstResult === "W") {
    while (si < resultRows.length && resultRows[si].result === "W") { currentStreak++; si++; }
  } else if (firstResult === "L") {
    while (si < resultRows.length && resultRows[si].result === "L") { currentStreak--; si++; }
  }
  const streaks: Streaks = { current: currentStreak, longestWin, longestLoss };

  // ── Quality-weighted win rate ─────────────────────────────
  // Weights wins/losses by opponent ranking quality so beating a top-5 counts
  // more than beating a rank-80 player (as opposed to a raw win %).
  function opponentQualityWeight(rank: number | null): number {
    if (rank === null) return 0.8;
    if (rank <= 10) return 2.0;
    if (rank <= 25) return 1.5;
    if (rank <= 50) return 1.2;
    if (rank <= 100) return 1.0;
    return 0.6;
  }
  let qwNumerator = 0, qwDenominator = 0;
  for (const r of resultRows) {
    const w = opponentQualityWeight(r.opponent_rank);
    qwDenominator += w;
    if (r.result === "W") qwNumerator += w;
  }
  const qualityWinRate = qwDenominator > 0 ? qwNumerator / qwDenominator : null;

  // ── BP conversion as returner ─────────────────────────────
  const bpConversionPct = pct(
    allResultRows.map((r) => r.bp_converted),
    allResultRows.map((r) => r.bp_opportunities)
  );

  // ── Avg duration ─────────────────────────────────────────
  const avgDuration = avg(resultRows.map((r) => r.duration_min));

  // ── Court speed splits ────────────────────────────────────
  // Usa court_speed propagado desde tournament_models
  const csRows = resultRows.filter((r) => r.court_speed != null);
  const courtSpeedSplits = csRows.length >= 3 ? {
    fast:       winRateSplit(csRows.filter((r) => r.court_speed! >= 65)),
    mediumFast: winRateSplit(csRows.filter((r) => r.court_speed! >= 45 && r.court_speed! < 65)),
    medium:     winRateSplit(csRows.filter((r) => r.court_speed! >= 25 && r.court_speed! < 45)),
    slow:       winRateSplit(csRows.filter((r) => r.court_speed! < 25)),
  } : undefined;

  // ── Per-tournament stats (torneos con ≥5 resultados) ──────
  const byTourney: Record<string, MatchStatRow[]> = {};
  for (const r of resultRows) {
    if (!r.tournament) continue;
    if (!byTourney[r.tournament]) byTourney[r.tournament] = [];
    byTourney[r.tournament].push(r);
  }
  const courtStats: Record<string, { speed: number; profile: string; split: SplitStat }> = {};
  for (const [t, rs] of Object.entries(byTourney)) {
    if (rs.length < 5) continue;
    const speed = rs[0].court_speed ?? -1;
    const profile = speed >= 65 ? "fast" : speed >= 45 ? "medium-fast" : speed >= 25 ? "medium" : speed >= 0 ? "slow" : "unknown";
    courtStats[t] = { speed, profile, split: winRateSplit(rs) };
  }

  return {
    slug: teSlug,
    surface,
    windowN,
    matchesUsed: resultRows.length,  // número de partidos con resultado real
    winRate: total > 0 ? wins / total : null,
    wins,
    losses,
    qualityWinRate,
    avgAces:          avg(serveRows.map((r) => r.aces)),
    avgDoubleFaults:  avg(serveRows.map((r) => r.double_faults)),
    firstServePct:    pct(serveRows.map((r) => r.first_in), serveRows.map((r) => r.serve_pts)),
    firstServeWonPct: pct(serveRows.map((r) => r.first_won), serveRows.map((r) => r.first_in)),
    secondServeWonPct: pct(
      serveRows.map((r) => r.second_won),
      serveRows.map((r) => (r.serve_pts !== null && r.first_in !== null ? r.serve_pts - r.first_in : null))
    ),
    bpSavePct:      pct(serveRows.map((r) => r.bp_saved), serveRows.map((r) => r.bp_faced)),
    bpConversionPct,
    avgWinners:     avg(shotRows.map((r) => r.winners)),
    avgUnforced:    avg(shotRows.map((r) => r.unforced_errors)),
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
    courtSpeedSplits,
    courtStats: Object.keys(courtStats).length > 0 ? courtStats : undefined,
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
  // Normalize to canonical slug before any DB access
  teSlug = canonicalSlug(teSlug);

  const cached = await getPattern(teSlug, surface, windowN);
  if (cached && cached.computed_at && Date.now() / 1000 - cached.computed_at < PATTERN_TTL_MS / 1000) {
    return deserializePattern(cached);
  }

  // Primero intenta solo últimos 24 meses — sin límite para asegurar que
  // resultRows (sackmann) y shotRows (charting) tengan suficientes filas cada uno.
  const since24m = monthsAgo(24);
  let rows = await getPlayerMatches(teSlug, { surface: surface || undefined, since: since24m });

  // Si hay pocos partidos con resultado real, amplía a todo el histórico
  const recentWithResult = rows.filter((r) => r.result !== null).length;
  if (recentWithResult < MIN_RECENT_MATCHES) {
    rows = await getPlayerMatches(teSlug, { surface: surface || undefined });
  }

  if (rows.length === 0) return null;

  const result = computeFromRows(rows, teSlug, surface, windowN);

  await savePattern({
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
      qualityWinRate: result.qualityWinRate,
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
      courtSpeedSplits: result.courtSpeedSplits,
      courtStats: result.courtStats,
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
    qualityWinRate: (extra.qualityWinRate as number | null) ?? null,
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
    courtSpeedSplits: extra.courtSpeedSplits,
    courtStats: extra.courtStats,
    streaks: extra.streaks,
    recentForm: extra.recentForm,
  };
}

export async function resetPatterns(teSlug: string): Promise<void> {
  await invalidatePatterns(canonicalSlug(teSlug));
}
