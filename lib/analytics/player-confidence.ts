/**
 * lib/analytics/player-confidence.ts
 *
 * Sistema de confianza estadística por jugador.
 *
 * Problema: un jugador debutante que llega a la final de un 250 tiene stats
 * impresionantes con solo 5-8 partidos — esos datos desvirtuarían predicciones.
 *
 * Solución: cada jugador tiene un nivel de confianza 0-100 que pondera cuánto
 * confiar en sus estadísticas reales vs un valor base derivado de su ranking ATP.
 *
 * Reglas de confianza:
 *   < 10 partidos ATP en DB  → 20% (datos casi irrelevantes)
 *   10-30 partidos           → 50%
 *   30-50 partidos           → 75%
 *   > 50 partidos            → 100%
 *
 * Detección de jugador "emergente" (challenger de fondo):
 *   > 70% de sus partidos son atp-250 o "other" Y total < 20 partidos
 *   → marca como emergente y reduce aún más la confianza
 *
 * Blending de win rate:
 *   effectiveWinRate = confidence * realWinRate + (1 - confidence) * baselineWinRate(rank)
 */

import { getDb } from "../db/client";

// ── Tipos públicos ────────────────────────────────────────

export type ConfidenceTier = "very_low" | "low" | "medium" | "high";

export interface PlayerConfidence {
  slug: string;
  atpMatches: number;          // partidos ATP main tour en DB
  confidenceScore: number;     // 0-100
  tier: ConfidenceTier;
  isEmerging: boolean;         // viene del Challenger, datos con cautela
  estimatedRank: number | null;
  baselineWinRate: number;     // win rate base según ranking (vs field en general)
  label: string;               // mensaje legible para el UI
  blendFactor: number;         // 0-1 = peso de stats reales (1 - peso del baseline)
}

// ── Baseline por ranking ──────────────────────────────────

/**
 * Win rate base estimada contra el campo ATP general, por rango de ranking.
 * Basado en distribución histórica ATP: top-10 gana ~75% de sus partidos,
 * jugadores rank 200+ ganan ~35%.
 */
export function baselineWinRateByRank(rank: number | null): number {
  if (rank == null || rank <= 0) return 0.45; // desconocido → ligeramente por debajo del 50%
  if (rank <= 10)  return 0.76;
  if (rank <= 20)  return 0.70;
  if (rank <= 50)  return 0.62;
  if (rank <= 100) return 0.54;
  if (rank <= 150) return 0.46;
  if (rank <= 200) return 0.40;
  if (rank <= 300) return 0.35;
  return 0.30;
}

/**
 * Win rate base contra rivales de un bracket específico de ranking.
 * Permite completar opponentRankSplits cuando no hay datos reales.
 */
export function baselineVsRankBracket(
  playerRank: number | null,
  opponentBracket: "top10" | "top20" | "top50" | "top100" | "rest",
): number {
  const r = playerRank ?? 200;

  // Tabla de win rate esperada por (ranking del jugador, nivel del oponente)
  const table: Record<string, Record<string, number>> = {
    top10:  { top10: 0.50, top20: 0.65, top50: 0.78, top100: 0.85, rest: 0.90 },
    top20:  { top10: 0.35, top20: 0.50, top50: 0.65, top100: 0.76, rest: 0.83 },
    top50:  { top10: 0.22, top20: 0.35, top50: 0.50, top100: 0.62, rest: 0.72 },
    top100: { top10: 0.15, top20: 0.24, top50: 0.38, top100: 0.50, rest: 0.62 },
    rest:   { top10: 0.10, top20: 0.17, top50: 0.28, top100: 0.38, rest: 0.50 },
  };

  const playerBracket = r <= 10 ? "top10" : r <= 20 ? "top20" : r <= 50 ? "top50"
    : r <= 100 ? "top100" : "rest";

  return table[playerBracket]?.[opponentBracket] ?? 0.40;
}

// ── Cálculo de confianza ──────────────────────────────────

/**
 * Calcula el nivel de confianza de un jugador basado en sus partidos ATP en DB.
 * Consulta player_match_stats directamente (no usa caché de patrones).
 */
export async function computePlayerConfidence(slug: string): Promise<PlayerConfidence> {
  const db = getDb();

  // Contar partidos ATP main tour (excluir "other" = Challenger/ITF que se cuele)
  const statsResult = await db.execute({
    sql: `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN tourney_level IN ('grand-slam','masters-1000','atp-500','atp-250','atp-finals') THEN 1 ELSE 0 END) as atp_main,
        SUM(CASE WHEN tourney_level IN ('atp-250','other') THEN 1 ELSE 0 END) as lower_tier,
        AVG(CASE WHEN opponent_rank IS NOT NULL THEN opponent_rank END) as avg_opp_rank,
        (SELECT AVG(opponent_rank) FROM player_match_stats
         WHERE opponent_slug = ? AND opponent_rank IS NOT NULL
         ORDER BY match_date DESC LIMIT 10) as estimated_rank
      FROM player_match_stats
      WHERE te_slug = ? AND result IS NOT NULL
    `,
    args: [slug, slug],
  });
  const stats = statsResult.rows[0] as unknown as {
    total: number; atp_main: number; lower_tier: number;
    avg_opp_rank: number | null; estimated_rank: number | null;
  };

  const atpMatches = stats.atp_main ?? 0;
  const totalMatches = stats.total ?? 0;
  const estimatedRank = stats.estimated_rank ? Math.round(stats.estimated_rank) : null;

  // ── Nivel de confianza base ───────────────────────────────
  let confidenceScore: number;
  let tier: ConfidenceTier;

  if (atpMatches < 10) {
    confidenceScore = 20;
    tier = "very_low";
  } else if (atpMatches < 30) {
    // Interpolación lineal 20→50 dentro del rango 10-30
    confidenceScore = 20 + Math.round((atpMatches - 10) / 20 * 30);
    tier = "low";
  } else if (atpMatches < 50) {
    // Interpolación lineal 50→75 dentro del rango 30-50
    confidenceScore = 50 + Math.round((atpMatches - 30) / 20 * 25);
    tier = "medium";
  } else {
    confidenceScore = 100;
    tier = "high";
  }

  // ── Detección de jugador emergente ────────────────────────
  // Si >70% de sus partidos son de torneos 250 o menores y tiene <20 partidos totales
  const lowerTierPct = totalMatches > 0 ? (stats.lower_tier ?? 0) / totalMatches : 0;
  const isEmerging = totalMatches < 20 && lowerTierPct > 0.70;

  // Emergente: reduce confianza otros 10pp adicionales (mínimo 10)
  if (isEmerging) {
    confidenceScore = Math.max(10, confidenceScore - 10);
    if (tier === "medium") tier = "low";
    if (tier === "low") tier = "very_low";
  }

  const baselineWinRate = baselineWinRateByRank(estimatedRank);
  const blendFactor = confidenceScore / 100; // 0 = todo baseline, 1 = todo stats reales

  // ── Mensaje para el UI ────────────────────────────────────
  let label: string;
  if (tier === "very_low") {
    label = `Datos limitados — ${atpMatches} partido${atpMatches !== 1 ? "s" : ""} ATP. Predicciones con baja confianza.`;
  } else if (tier === "low") {
    label = `Muestra pequeña — ${atpMatches} partidos ATP. Confianza moderada-baja.`;
  } else if (tier === "medium") {
    label = `${atpMatches} partidos ATP. Confianza moderada — estadísticas en consolidación.`;
  } else {
    label = `${atpMatches} partidos ATP. Confianza alta — estadísticas consolidadas.`;
  }

  if (isEmerging) {
    label = `⚡ Jugador emergente — ${label.toLowerCase()} Historial principalmente en torneos 250/Challenger.`;
  }

  return {
    slug,
    atpMatches,
    confidenceScore,
    tier,
    isEmerging,
    estimatedRank,
    baselineWinRate,
    label,
    blendFactor,
  };
}

// ── Blending de win rates ─────────────────────────────────

/**
 * Combina el win rate real del jugador con el baseline por ranking.
 * Con confianza baja, el resultado se acerca al baseline (más conservador).
 * Con confianza alta, predominan las estadísticas reales.
 *
 * @param realRate    — win rate calculado de los datos reales (puede ser null)
 * @param confidence  — PlayerConfidence del jugador
 * @param opponentBracket — bracket de ranking del rival (para ajustar el baseline)
 */
export function blendWinRate(
  realRate: number | null,
  confidence: PlayerConfidence,
  opponentBracket?: "top10" | "top20" | "top50" | "top100" | "rest",
): number {
  const baseline = opponentBracket
    ? baselineVsRankBracket(confidence.estimatedRank, opponentBracket)
    : confidence.baselineWinRate;

  if (realRate == null) {
    // Sin datos reales: usar el baseline directamente
    return baseline;
  }

  // Blend: confidence * real + (1-confidence) * baseline
  return confidence.blendFactor * realRate + (1 - confidence.blendFactor) * baseline;
}

/**
 * Ajusta la probabilidad final de predicción cuando uno o ambos jugadores
 * tienen baja confianza. Con confianza muy baja, el resultado converge al 50%
 * ajustado por ranking (no al 50% puro).
 *
 * @param rawP1Prob  — probabilidad calculada por el motor (0-1)
 * @param conf1      — confianza del jugador 1
 * @param conf2      — confianza del jugador 2
 * @param rank1      — ranking estimado del jugador 1
 * @param rank2      — ranking estimado del jugador 2
 */
export function adjustProbabilityForConfidence(
  rawP1Prob: number,
  conf1: PlayerConfidence,
  conf2: PlayerConfidence,
  rank1: number | null,
  rank2: number | null,
): { adjustedProb: number; wasAdjusted: boolean; adjustmentNote: string } {
  const minConf = Math.min(conf1.confidenceScore, conf2.confidenceScore);

  // Si ambos tienen alta confianza, no ajustar
  if (minConf >= 75) {
    return { adjustedProb: rawP1Prob, wasAdjusted: false, adjustmentNote: "" };
  }

  // Probabilidad base por ranking puro (Elo-like: logística del diferencial de ranking)
  let rankBasedProb = 0.5;
  if (rank1 != null && rank2 != null && rank1 > 0 && rank2 > 0) {
    // Log-ratio: jugador con mejor ranking (menor número) tiene ventaja
    const logRatio = Math.log(rank2 / rank1); // positivo si p1 tiene mejor rank
    rankBasedProb = 1 / (1 + Math.exp(-logRatio * 0.8));
    rankBasedProb = Math.max(0.15, Math.min(0.85, rankBasedProb));
  }

  // Factor de confianza combinada: peso que dan las stats vs el ranking base
  // Si minConf=20 → blend=20%, el 80% del ajuste viene del ranking
  const combinedBlend = (conf1.blendFactor + conf2.blendFactor) / 2;

  // Probabilidad ajustada: blend entre predicción real y baseline por ranking
  const adjustedProb = combinedBlend * rawP1Prob + (1 - combinedBlend) * rankBasedProb;

  const lowPlayer = conf1.confidenceScore <= conf2.confidenceScore
    ? conf1.slug : conf2.slug;

  const note = minConf < 30
    ? `Predicción aproximada — ${lowPlayer} tiene muy pocos datos ATP (${Math.min(conf1.atpMatches, conf2.atpMatches)} partidos). Ajustada por ranking.`
    : `Predicción con cautela — muestra pequeña de ${lowPlayer}. Parcialmente ajustada por ranking.`;

  return { adjustedProb, wasAdjusted: true, adjustmentNote: note };
}
