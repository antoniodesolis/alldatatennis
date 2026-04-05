/**
 * lib/analytics/post-match-learning.ts
 *
 * Después de cada partido terminado:
 *  1. Lee la predicción que se hizo para ese partido (prediction_log)
 *  2. Lee el análisis post-partido (match_insights: patrón real)
 *  3. Genera una nota de aprendizaje: "predijimos X, ocurrió Y, por qué"
 *  4. Actualiza player_insights de ambos jugadores con lo aprendido
 *  5. Actualiza la calibración de factores (vía feedback existente)
 */

import { getDb } from "../db/client";
import { getPlayerInsights, savePlayerInsights, type AccumulatedInsights } from "../db/queries";
import type { MatchPattern } from "./match-pattern";

// ── Tipos ─────────────────────────────────────────────────

export interface PostMatchNote {
  matchId:      string;
  matchDate:    string;
  winnerSlug:   string;
  loserSlug:    string;
  actualPattern: MatchPattern;
  // Si había predicción registrada
  predictedWinner?: "p1" | "p2" | null;
  actualWinner?: "p1" | "p2" | null;
  predictionCorrect?: boolean;
  predictedPct?: number;
  // Factores que apoyaban al ganador real (de factors_json)
  factorsForWinner: string[];
  factorsAgainstWinner: string[];
  // Discrepancias tácticamente interesantes
  learningNote: string;
}

interface PredictionLogRow {
  match_id:         string;
  match_date:       string;
  player1_slug:     string;
  player2_slug:     string;
  predicted_p1_pct: number;
  actual_winner:    string | null;
  factors_json:     string | null;
}

interface FactorEntry {
  id:          string;
  winner:      "p1" | "p2" | "neutral";
  hasData:     boolean;
  explanation: string;
  effectiveWeight: number;
  magnitude:   number;
}

// ── Helpers ───────────────────────────────────────────────

function parseFactors(json: string | null): FactorEntry[] {
  if (!json) return [];
  try { return JSON.parse(json) as FactorEntry[]; } catch { return []; }
}

function buildLearningNote(
  winnerSlug: string,
  loserSlug: string,
  predictionCorrect: boolean | undefined,
  predictedPct: number | undefined,
  actualPattern: MatchPattern,
  factorsForWinner: string[],
  factorsAgainst: string[],
): string {
  const parts: string[] = [];

  if (predictionCorrect !== undefined) {
    if (predictionCorrect) {
      const conf = predictedPct != null
        ? predictedPct >= 70 ? "con alta confianza" : predictedPct >= 60 ? "correctamente" : "acertamos aunque era igualado"
        : "acertamos";
      parts.push(`Predicción correcta (${conf}, ${predictedPct}%).`);
    } else {
      const surprise = predictedPct != null
        ? predictedPct >= 75 ? "sorpresa notable" : predictedPct >= 65 ? "sorpresa moderada" : "resultado inesperado pero partido igualado"
        : "resultado incorrecto";
      parts.push(`Predicción incorrecta — ${surprise} (habíamos dado ${predictedPct}% al perdedor real).`);
    }
  }

  if (factorsForWinner.length > 0) {
    parts.push(`Factores a favor del ganador: ${factorsForWinner.slice(0, 2).join("; ")}.`);
  }

  if (!predictionCorrect && factorsAgainst.length > 0) {
    parts.push(`Factores que apuntaban al perdedor: ${factorsAgainst.slice(0, 2).join("; ")}.`);
  }

  const patternNotes: Record<MatchPattern, string> = {
    dominio:   "el ganador dominó sin discusión",
    batalla:   "partido igualado hasta el final",
    irregular: "partido errático con muchos breaks",
    remontada: "el ganador remontó un set",
    walkover:  "walkover",
  };
  parts.push(`Tipo de partido: ${patternNotes[actualPattern] ?? actualPattern}.`);

  return parts.join(" ");
}

// ── API pública ───────────────────────────────────────────

/**
 * Procesa el aprendizaje post-partido para una entrada de match_insights.
 * Se llama desde enrich-matches después de guardar el insight.
 */
export function processPostMatchLearning(
  matchId: string,
  matchDate: string,
  winnerSlug: string,
  loserSlug: string,
  actualPattern: MatchPattern,
): PostMatchNote {
  const db = getDb();

  // Buscar la predicción registrada para este partido
  // La predicción se guarda con player1_slug = el que figure primero en nuestra lista
  const predRows = db.prepare(`
    SELECT * FROM prediction_log
    WHERE match_id = ?
       OR (player1_slug = ? AND player2_slug = ?)
       OR (player1_slug = ? AND player2_slug = ?)
    LIMIT 1
  `).all(matchId, winnerSlug, loserSlug, loserSlug, winnerSlug) as PredictionLogRow[];

  const pred = predRows[0] ?? null;

  let predictionCorrect: boolean | undefined;
  let predictedWinner: "p1" | "p2" | null = null;
  let predictedPct: number | undefined;
  const factorsForWinner: string[] = [];
  const factorsAgainstWinner: string[] = [];

  if (pred) {
    const predictedP1Pct = pred.predicted_p1_pct;
    predictedPct = predictedP1Pct;

    // Determinar quién es p1 y p2 en la predicción
    const winnerIsP1 = pred.player1_slug === winnerSlug;
    const winnerPredictedPct = winnerIsP1 ? predictedP1Pct : 100 - predictedP1Pct;

    // ¿Predijimos al ganador correcto?
    predictedWinner = winnerIsP1 ? "p1" : "p2";
    const predictedFavorite: "p1" | "p2" = predictedP1Pct >= 50 ? "p1" : "p2";
    predictionCorrect = predictedFavorite === predictedWinner;

    // Si la predicción estaba resuelta, actualizar
    if (pred.actual_winner) {
      predictionCorrect = pred.actual_winner === predictedWinner.toString();
    }

    // Analizar factores
    const factors = parseFactors(pred.factors_json);
    for (const f of factors) {
      if (!f.hasData || f.effectiveWeight < 0.03) continue;
      if (f.winner === (winnerIsP1 ? "p1" : "p2")) {
        factorsForWinner.push(f.explanation);
      } else if (f.winner !== "neutral") {
        factorsAgainstWinner.push(f.explanation);
      }
    }
  }

  const learningNote = buildLearningNote(
    winnerSlug, loserSlug,
    predictionCorrect, predictedPct,
    actualPattern, factorsForWinner, factorsAgainstWinner,
  );

  // ── Actualizar player_insights con la nota de aprendizaje ─
  updatePlayerInsightsWithLearning(winnerSlug, learningNote, actualPattern, true);
  updatePlayerInsightsWithLearning(loserSlug, learningNote, actualPattern, false);

  // ── Actualizar prediction_log con el actual_winner si no estaba ─
  if (pred && !pred.actual_winner) {
    const actualWinnerField: "p1" | "p2" = pred.player1_slug === winnerSlug ? "p1" : "p2";
    const predBinary = actualWinnerField === "p1" ? 1 : 0;
    const predPct = pred.predicted_p1_pct / 100;
    const error = Math.abs(predPct - predBinary);
    db.prepare(`
      UPDATE prediction_log
      SET actual_winner = ?, prediction_error = ?, resolved_at = unixepoch()
      WHERE match_id = ?
    `).run(actualWinnerField, error, pred.match_id);
  }

  return {
    matchId, matchDate, winnerSlug, loserSlug, actualPattern,
    predictedWinner, predictedPct,
    predictionCorrect,
    factorsForWinner, factorsAgainstWinner,
    learningNote,
  };
}

function updatePlayerInsightsWithLearning(
  slug: string,
  note: string,
  pattern: MatchPattern,
  isWinner: boolean,
): void {
  const acc: AccumulatedInsights = getPlayerInsights(slug);

  // Añadir nota de aprendizaje como observación táctica reciente
  const tag = isWinner ? "[ganó]" : "[perdió]";
  const taggedNote = `${tag} ${note}`;

  // Guardar en un campo separado dentro del JSON acumulado
  const extended = acc as AccumulatedInsights & { postMatchNotes?: string[] };
  if (!extended.postMatchNotes) extended.postMatchNotes = [];
  extended.postMatchNotes = [taggedNote, ...extended.postMatchNotes].slice(0, 10);

  savePlayerInsights(slug, extended);
}

/**
 * Genera un resumen de aprendizaje para un jugador: qué hemos acertado y fallado.
 */
export function getPlayerLearningReport(slug: string): {
  matchCount: number;
  correctPredictions: number;
  incorrectPredictions: number;
  patternDistribution: Record<string, number>;
  recentNotes: string[];
} {
  const acc = getPlayerInsights(slug) as AccumulatedInsights & { postMatchNotes?: string[] };
  const notes = acc.postMatchNotes ?? [];

  const correct   = notes.filter((n) => n.includes("correcta")).length;
  const incorrect = notes.filter((n) => n.includes("incorrecta")).length;

  return {
    matchCount: acc.matchCount,
    correctPredictions: correct,
    incorrectPredictions: incorrect,
    patternDistribution: acc.matchPatterns as unknown as Record<string, number>,
    recentNotes: notes.slice(0, 5),
  };
}
