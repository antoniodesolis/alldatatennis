/**
 * lib/analytics/match-patterns.ts
 *
 * Analiza el score final + estadísticas de un partido terminado y produce
 * un resumen estructurado (MatchInsight) que captura lo que realmente ocurrió:
 * remontadas, desperdicios de oportunidades, dominancia, tiebreaks, etc.
 *
 * Este insight se guarda en match_insights y se usa en la retroalimentación
 * para calibrar los factores de predicción con más contexto que el simple W/L.
 */

export interface SetScore {
  winner: number;
  loser: number;
  tiebreak: number | null; // puntos del perdedor en el TB, si hubo
}

export type MatchPattern =
  | "straight_sets_dominant"   // 2 sets, margen amplio (al menos un 6-0/6-1)
  | "straight_sets"            // 2 sets, sin dominancia especial
  | "comeback_from_set_down"   // perdió el primer set, ganó el partido
  | "three_sets_close"         // 3 sets, todos apretados (6-4 o menos de margen)
  | "three_sets"               // 3 sets genérico
  | "tiebreak_decider"         // el set decisivo fue un tiebreak
  | "bagel"                    // 6-0 en algún set
  | "unknown";

export interface PlayerMatchStats {
  aces: number | null;
  doubleFaults: number | null;
  firstServePct: number | null;    // 0-1
  firstServeWonPct: number | null; // 0-1
  secondServeWonPct: number | null;// 0-1
  bpSaved: number | null;
  bpFaced: number | null;
  bpConverted: number | null;
  bpOpportunities: number | null;
  winners: number | null;
  unforcedErrors: number | null;
}

export interface MatchInsightData {
  pattern: MatchPattern;
  sets: SetScore[];
  setsCount: number;
  hadTiebreak: boolean;
  deciderWasTiebreak: boolean;
  winnerCameFromSetDown: boolean;  // ganador perdió primer set
  bagel: boolean;                  // algún set 6-0
  winnerSquanderedBP: boolean;     // el ganador desaprovechó ≥3 BP sin convertir
  loserSquanderedBP: boolean;      // el perdedor tuvo ≥3 BP y no las convirtió
  winnerStats: PlayerMatchStats;
  loserStats: PlayerMatchStats;
  narrativeHints: string[];        // frases para el análisis post-partido
}

// ── Parser de score ───────────────────────────────────────

/**
 * Parsea "7-6(3) 3-6 6-2" en sets desde la perspectiva del ganador.
 * El score en DB siempre está ordenado [winner_games]-[loser_games] por set.
 */
export function parseScore(score: string): SetScore[] {
  const sets: SetScore[] = [];
  const setTokens = score.trim().split(/\s+/);

  for (const token of setTokens) {
    // Formato: "6-3" o "7-6(3)"
    const m = token.match(/^(\d+)-(\d+)(?:\((\d+)\))?$/);
    if (!m) continue;
    sets.push({
      winner: parseInt(m[1]),
      loser: parseInt(m[2]),
      tiebreak: m[3] != null ? parseInt(m[3]) : null,
    });
  }
  return sets;
}

// ── Análisis de patrón ────────────────────────────────────

export function analyzeMatch(
  score: string | null,
  winnerStats: PlayerMatchStats,
  loserStats: PlayerMatchStats,
): MatchInsightData {
  const sets = score ? parseScore(score) : [];
  const setsCount = sets.length;
  const hadTiebreak = sets.some((s) => s.tiebreak !== null);
  const deciderWasTiebreak = setsCount > 0 && sets[setsCount - 1].tiebreak !== null;

  // El ganador perdió el primer set (remontada)
  const winnerCameFromSetDown =
    setsCount >= 2 && sets[0].winner < sets[0].loser;

  // Algún set fue 6-0
  const bagel = sets.some((s) => s.winner === 6 && s.loser === 0);

  // Dominancia: ≥1 set con margen 5+ (6-0, 6-1)
  const hasDominantSet = sets.some((s) => s.winner - s.loser >= 5);
  // Apretado: todos los sets con margen ≤2
  const allSetsClose = sets.every((s) => Math.abs(s.winner - s.loser) <= 2 || s.tiebreak !== null);

  // Oportunidades desperdiciadas
  const winnerSquanderedBP =
    (winnerStats.bpOpportunities ?? 0) >= 3 &&
    (winnerStats.bpConverted ?? 0) === 0;
  const loserSquanderedBP =
    (loserStats.bpOpportunities ?? 0) >= 3 &&
    (loserStats.bpConverted ?? 0) / Math.max(1, loserStats.bpOpportunities ?? 1) < 0.25;

  // Patrón principal
  let pattern: MatchPattern = "unknown";
  if (setsCount === 2) {
    pattern = hasDominantSet || bagel ? "straight_sets_dominant" : "straight_sets";
  } else if (setsCount === 3) {
    if (deciderWasTiebreak) pattern = "tiebreak_decider";
    else if (winnerCameFromSetDown) pattern = "comeback_from_set_down";
    else if (allSetsClose) pattern = "three_sets_close";
    else pattern = "three_sets";
  }
  if (bagel && pattern === "unknown") pattern = "bagel";

  // ── Narrativa post-partido ───────────────────────────────
  const hints: string[] = [];

  if (winnerCameFromSetDown) {
    hints.push("comeback: ganador perdió el primer set y remontó");
  }
  if (deciderWasTiebreak) {
    hints.push("set decisivo se resolvió en tiebreak");
  }
  if (bagel) {
    hints.push("hubo un 6-0 en el partido");
  }
  if (hasDominantSet && !winnerCameFromSetDown) {
    hints.push("parcial dominante en al menos un set");
  }

  // BP squander del perdedor: dejó oportunidades de break sin aprovechar
  if (loserSquanderedBP && (loserStats.bpOpportunities ?? 0) >= 3) {
    const opp = loserStats.bpOpportunities!;
    const conv = loserStats.bpConverted ?? 0;
    hints.push(`perdedor desaprovechó ${opp - conv} de ${opp} oportunidades de break (${conv} convertidas)`);
  }

  // BP del ganador: salvó muchas
  if ((winnerStats.bpFaced ?? 0) >= 5 && (winnerStats.bpSaved ?? 0) / Math.max(1, winnerStats.bpFaced ?? 1) >= 0.7) {
    hints.push(`ganador salvó ${winnerStats.bpSaved}/${winnerStats.bpFaced} break points bajo presión`);
  }

  // Error del perdedor: muchos no forzados
  if ((loserStats.unforcedErrors ?? 0) >= 25 && (loserStats.winners ?? 0) !== null) {
    hints.push(`perdedor cometió ${loserStats.unforcedErrors} errores no forzados`);
  }

  // Superioridad en winners
  const wDiff = (winnerStats.winners ?? 0) - (loserStats.winners ?? 0);
  if (wDiff >= 10) {
    hints.push(`ganador superó al rival en winners (${winnerStats.winners} vs ${loserStats.winners})`);
  }

  // Tiebreak en set 1: set muy igualado
  if (sets[0]?.tiebreak !== null) {
    hints.push(`primer set se fue al tiebreak (${sets[0].winner}-${sets[0].loser} TB:${sets[0].tiebreak})`);
  }

  return {
    pattern,
    sets,
    setsCount,
    hadTiebreak,
    deciderWasTiebreak,
    winnerCameFromSetDown,
    bagel,
    winnerSquanderedBP,
    loserSquanderedBP,
    winnerStats,
    loserStats,
    narrativeHints: hints,
  };
}
