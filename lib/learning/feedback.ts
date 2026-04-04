/**
 * lib/learning/feedback.ts
 *
 * Sistema de retroalimentación: cada predicción se loguea y cuando el partido
 * termina se compara con el resultado real. Los factores que fallaron de forma
 * sistemática bajan su peso efectivo; los que acertaron lo suben.
 *
 * Flujo:
 *   1. predict() → logPrediction(matchId, input, result)
 *   2. daily-sync → resolveFinishedMatches() → marca actual_winner + prediction_error
 *   3. recomputeCalibration() → actualiza factor_calibration
 *   4. predict() lee factor_calibration → aplica weight_mult antes de redistribuir pesos
 */

import { getDb } from "../db/client";
import type { PredictionResult, FactorResult } from "../prediction/engine";

// ── Tipos ─────────────────────────────────────────────────

export interface PredictionLogEntry {
  match_id: string;
  match_date: string;
  player1_slug: string;
  player2_slug: string;
  tournament: string;
  surface: string;
  tourney_level: string;
  predicted_p1_pct: number;
  factors_json: string;
}

export interface FactorCalibration {
  factor_id: string;
  sample_count: number;
  avg_accuracy: number;   // 0-1: fracción de veces que este factor favoreció al ganador real
  avg_error: number;      // RMSE de la predicción en partidos donde este factor tenía datos
  weight_mult: number;    // multiplicador a aplicar en el engine (1.0 = sin cambio)
}

// ── Log de predicciones ───────────────────────────────────

/**
 * Registra una predicción en el log. Llamado desde /api/prediction cuando se genera un pronóstico.
 * Idempotente: si ya existe ese match_id+player1, hace UPDATE de los datos (predicción actualizada).
 */
export function logPrediction(
  matchId: string,
  input: { player1: string; player2: string; tournament: string; surface: string; tourneyLevel: string; date?: string },
  result: PredictionResult,
): void {
  const db = getDb();
  const date = input.date ?? new Date().toISOString().slice(0, 10);

  // Serializar factores con lo necesario para auditoría y calibración
  const factorsData = result.allFactors.map((f: FactorResult) => ({
    id: f.id,
    hasData: f.hasData,
    baseWeight: f.baseWeight,
    effectiveWeight: f.effectiveWeight,
    p1Advantage: f.p1Advantage,
    magnitude: f.magnitude,
    winner: f.winner,
    dataCount: f.dataCount,
  }));

  try {
    db.prepare(`
      INSERT INTO prediction_log
        (match_id, match_date, player1_slug, player2_slug, tournament, surface, tourney_level,
         predicted_p1_pct, factors_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(match_id, player1_slug) DO UPDATE SET
        predicted_p1_pct = excluded.predicted_p1_pct,
        factors_json = excluded.factors_json
    `).run(
      matchId, date,
      result.player1.slug, result.player2.slug,
      input.tournament, input.surface, input.tourneyLevel,
      result.player1.winPct,
      JSON.stringify(factorsData),
    );
  } catch (err) {
    // No bloquear la predicción si el log falla
    console.warn("[feedback] logPrediction error:", (err as Error).message);
  }
}

// ── Resolución de partidos terminados ─────────────────────

/**
 * Dados los partidos del día (con resultado), busca predicciones pendientes y las resuelve.
 * Llamado desde daily-sync después de ingestar los resultados del día.
 *
 * @param finishedMatches — array de {matchId, winnerSlug} de partidos completados hoy
 * @returns número de predicciones resueltas
 */
export function resolveFinishedMatches(
  finishedMatches: Array<{ matchId: string; winnerSlug: string }>,
): number {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  let resolved = 0;

  const findPred = db.prepare(
    "SELECT id, player1_slug, player2_slug, predicted_p1_pct FROM prediction_log WHERE match_id = ? AND resolved_at IS NULL"
  );
  const resolve = db.prepare(`
    UPDATE prediction_log SET
      actual_winner    = ?,
      prediction_error = ?,
      resolved_at      = ?
    WHERE id = ?
  `);

  const resolveAll = db.transaction(() => {
    for (const { matchId, winnerSlug } of finishedMatches) {
      const pred = findPred.get(matchId) as {
        id: number; player1_slug: string; player2_slug: string; predicted_p1_pct: number;
      } | undefined;
      if (!pred) continue;

      const actualWinner = pred.player1_slug === winnerSlug ? "p1"
        : pred.player2_slug === winnerSlug ? "p2" : null;
      if (!actualWinner) continue;

      // Error = |predicción - resultado real| en escala 0-1
      const actualBinary = actualWinner === "p1" ? 1.0 : 0.0;
      const predProb = pred.predicted_p1_pct / 100;
      const error = Math.abs(predProb - actualBinary);

      resolve.run(actualWinner, error, now, pred.id);
      resolved++;
    }
  });

  resolveAll();
  return resolved;
}

// ── Calibración de factores ───────────────────────────────

/**
 * Recalcula factor_calibration a partir del historial de predicciones resueltas.
 *
 * Por cada factor que tenía datos (hasData=true) en predicciones resueltas:
 *   - accuracy = fracción de veces que el factor favoreció al ganador real
 *   - error medio = promedio del prediction_error en esas predicciones
 *   - weight_mult = sigmoid_adjusted basado en accuracy vs baseline 0.5
 *
 * El weight_mult es suave: nunca baja de 0.4 ni sube de 1.8, y requiere ≥20 muestras
 * para desviarse significativamente de 1.0 (evita overfitting con pocas muestras).
 */
export function recomputeCalibration(): Record<string, FactorCalibration> {
  const db = getDb();

  // Traer todas las predicciones resueltas con sus factores
  const resolved = db.prepare(`
    SELECT id, player1_slug, player2_slug, predicted_p1_pct, actual_winner, prediction_error, factors_json
    FROM prediction_log
    WHERE resolved_at IS NOT NULL AND actual_winner IS NOT NULL
    ORDER BY resolved_at DESC
    LIMIT 500
  `).all() as Array<{
    id: number;
    player1_slug: string;
    player2_slug: string;
    predicted_p1_pct: number;
    actual_winner: string;
    prediction_error: number;
    factors_json: string;
  }>;

  if (resolved.length === 0) return getCalibration();

  // Acumular stats por factor
  interface FactorStats {
    total: number;
    correct: number;   // factor favoreció al ganador real
    sumError: number;  // suma de prediction_error cuando este factor tenía datos
  }
  const stats: Record<string, FactorStats> = {};

  for (const pred of resolved) {
    let factors: Array<{ id: string; hasData: boolean; winner: string; p1Advantage: number }> = [];
    try { factors = JSON.parse(pred.factors_json); } catch { continue; }

    for (const f of factors) {
      if (!f.hasData || Math.abs(f.p1Advantage) < 0.05) continue; // neutro = no informativo
      if (!stats[f.id]) stats[f.id] = { total: 0, correct: 0, sumError: 0 };

      const factorFavouredP1 = f.winner === "p1";
      const actuallyP1Won = pred.actual_winner === "p1";
      const correct = factorFavouredP1 === actuallyP1Won;

      stats[f.id].total++;
      if (correct) stats[f.id].correct++;
      stats[f.id].sumError += pred.prediction_error ?? 0;
    }
  }

  // Calcular weight_mult y guardar en DB
  const upsert = db.prepare(`
    INSERT INTO factor_calibration (factor_id, sample_count, avg_accuracy, avg_error, weight_mult, last_updated)
    VALUES (?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(factor_id) DO UPDATE SET
      sample_count = excluded.sample_count,
      avg_accuracy = excluded.avg_accuracy,
      avg_error    = excluded.avg_error,
      weight_mult  = excluded.weight_mult,
      last_updated = excluded.last_updated
  `);

  const calibrations: Record<string, FactorCalibration> = {};

  const update = db.transaction(() => {
    for (const [factorId, s] of Object.entries(stats)) {
      const accuracy = s.total > 0 ? s.correct / s.total : 0.5;
      const avgError = s.total > 0 ? s.sumError / s.total : 0;

      // Multiplicador suave: necesita ≥20 muestras para moverse de 1.0
      // Con 20+ muestras: accuracy 0.65 → mult ~1.3, accuracy 0.35 → mult ~0.7
      const confidence = Math.min(1, s.total / 20);
      const rawMult = 1.0 + (accuracy - 0.5) * 2 * confidence;
      const weightMult = Math.max(0.4, Math.min(1.8, rawMult));

      upsert.run(factorId, s.total, accuracy, avgError, weightMult);
      calibrations[factorId] = {
        factor_id: factorId,
        sample_count: s.total,
        avg_accuracy: accuracy,
        avg_error: avgError,
        weight_mult: weightMult,
      };
    }
  });

  update();
  return calibrations;
}

// ── Lectura de calibración ────────────────────────────────

/**
 * Devuelve la calibración actual de todos los factores.
 * Si no hay datos para un factor, devuelve weight_mult = 1.0.
 */
export function getCalibration(): Record<string, FactorCalibration> {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM factor_calibration").all() as FactorCalibration[];
  const result: Record<string, FactorCalibration> = {};
  for (const row of rows) result[row.factor_id] = row;
  return result;
}

/**
 * Devuelve el weight_mult de un factor específico. 1.0 si no hay datos.
 */
export function getFactorMult(factorId: string): number {
  const db = getDb();
  const row = db.prepare("SELECT weight_mult FROM factor_calibration WHERE factor_id = ?")
    .get(factorId) as { weight_mult: number } | undefined;
  return row?.weight_mult ?? 1.0;
}

// ── Estadísticas de aprendizaje ───────────────────────────

export interface LearningStats {
  totalPredictions: number;
  resolved: number;
  pending: number;
  avgError: number | null;
  accuracy: number | null;  // % predicciones correctas (ganador favorito ganó)
  factorCalibrations: FactorCalibration[];
  recentMistakes: Array<{
    date: string; tournament: string;
    player1: string; player2: string;
    predictedPct: number; actualWinner: string; error: number;
    mainFailedFactor: string;
  }>;
}

export function getLearningStats(): LearningStats {
  const db = getDb();

  const totals = db.prepare(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN resolved_at IS NOT NULL THEN 1 ELSE 0 END) as resolved,
      SUM(CASE WHEN resolved_at IS NULL THEN 1 ELSE 0 END) as pending,
      AVG(CASE WHEN prediction_error IS NOT NULL THEN prediction_error END) as avg_error,
      AVG(CASE WHEN actual_winner IS NOT NULL AND (
        (actual_winner='p1' AND predicted_p1_pct >= 50) OR
        (actual_winner='p2' AND predicted_p1_pct < 50)
      ) THEN 1.0 ELSE 0.0 END) as accuracy
    FROM prediction_log
  `).get() as { total: number; resolved: number; pending: number; avg_error: number | null; accuracy: number | null };

  const calibrations = db.prepare("SELECT * FROM factor_calibration ORDER BY sample_count DESC").all() as FactorCalibration[];

  // Últimas predicciones con error alto (>0.4 = favorito claro perdió)
  const mistakes = db.prepare(`
    SELECT match_date, tournament, player1_slug, player2_slug,
           predicted_p1_pct, actual_winner, prediction_error, factors_json
    FROM prediction_log
    WHERE prediction_error > 0.4 AND resolved_at IS NOT NULL
    ORDER BY resolved_at DESC LIMIT 10
  `).all() as Array<{
    match_date: string; tournament: string;
    player1_slug: string; player2_slug: string;
    predicted_p1_pct: number; actual_winner: string; prediction_error: number;
    factors_json: string;
  }>;

  const recentMistakes = mistakes.map((m) => {
    // Identificar el factor que más contribuyó al lado equivocado
    let factors: Array<{ id: string; hasData: boolean; winner: string; effectiveWeight: number }> = [];
    try { factors = JSON.parse(m.factors_json); } catch { /* */ }

    const predictedP1Won = m.predicted_p1_pct >= 50;
    const actuallyP1Won = m.actual_winner === "p1";
    // Factor principal que empujó en la dirección equivocada
    const wrongDir = predictedP1Won ? "p1" : "p2"; // dirección predicha (incorrecta)
    const mainFailed = factors
      .filter((f) => f.hasData && f.winner === wrongDir)
      .sort((a, b) => b.effectiveWeight - a.effectiveWeight)[0];

    return {
      date: m.match_date,
      tournament: m.tournament,
      player1: m.player1_slug,
      player2: m.player2_slug,
      predictedPct: m.predicted_p1_pct,
      actualWinner: m.actual_winner,
      error: m.prediction_error,
      mainFailedFactor: mainFailed?.id ?? "unknown",
    };
  });

  return {
    totalPredictions: totals.total,
    resolved: totals.resolved,
    pending: totals.pending,
    avgError: totals.avg_error,
    accuracy: totals.accuracy,
    factorCalibrations: calibrations,
    recentMistakes,
  };
}
