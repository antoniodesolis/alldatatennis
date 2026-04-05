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
  avg_accuracy: number;
  avg_error: number;
  weight_mult: number;
}

// ── Log de predicciones ───────────────────────────────────

export async function logPrediction(
  matchId: string,
  input: { player1: string; player2: string; tournament: string; surface: string; tourneyLevel: string; date?: string },
  result: PredictionResult,
): Promise<void> {
  const db = getDb();
  const date = input.date ?? new Date().toISOString().slice(0, 10);

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
    await db.execute({
      sql: `
        INSERT INTO prediction_log
          (match_id, match_date, player1_slug, player2_slug, tournament, surface, tourney_level,
           predicted_p1_pct, factors_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(match_id, player1_slug) DO UPDATE SET
          predicted_p1_pct = excluded.predicted_p1_pct,
          factors_json = excluded.factors_json
      `,
      args: [
        matchId, date,
        result.player1.slug, result.player2.slug,
        input.tournament, input.surface, input.tourneyLevel,
        result.player1.winPct,
        JSON.stringify(factorsData),
      ],
    });
  } catch (err) {
    console.warn("[feedback] logPrediction error:", (err as Error).message);
  }
}

// ── Resolución de partidos terminados ─────────────────────

export async function resolveFinishedMatches(
  finishedMatches: Array<{ matchId: string; winnerSlug: string }>,
): Promise<number> {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  let resolved = 0;

  await db.execute("BEGIN");
  try {
    for (const { matchId, winnerSlug } of finishedMatches) {
      const findResult = await db.execute({
        sql: "SELECT id, player1_slug, player2_slug, predicted_p1_pct FROM prediction_log WHERE match_id = ? AND resolved_at IS NULL",
        args: [matchId],
      });
      const pred = findResult.rows[0] as unknown as {
        id: number; player1_slug: string; player2_slug: string; predicted_p1_pct: number;
      } | undefined;
      if (!pred) continue;

      const actualWinner = pred.player1_slug === winnerSlug ? "p1"
        : pred.player2_slug === winnerSlug ? "p2" : null;
      if (!actualWinner) continue;

      const actualBinary = actualWinner === "p1" ? 1.0 : 0.0;
      const predProb = pred.predicted_p1_pct / 100;
      const error = Math.abs(predProb - actualBinary);

      await db.execute({
        sql: `
          UPDATE prediction_log SET
            actual_winner    = ?,
            prediction_error = ?,
            resolved_at      = ?
          WHERE id = ?
        `,
        args: [actualWinner, error, now, pred.id],
      });
      resolved++;
    }
    await db.execute("COMMIT");
  } catch (e) {
    await db.execute("ROLLBACK");
    throw e;
  }

  return resolved;
}

// ── Calibración de factores ───────────────────────────────

export async function recomputeCalibration(): Promise<Record<string, FactorCalibration>> {
  const db = getDb();

  const resolvedResult = await db.execute(`
    SELECT id, player1_slug, player2_slug, predicted_p1_pct, actual_winner, prediction_error, factors_json
    FROM prediction_log
    WHERE resolved_at IS NOT NULL AND actual_winner IS NOT NULL
    ORDER BY resolved_at DESC
    LIMIT 500
  `);

  const resolved = resolvedResult.rows as unknown as Array<{
    id: number;
    player1_slug: string;
    player2_slug: string;
    predicted_p1_pct: number;
    actual_winner: string;
    prediction_error: number;
    factors_json: string;
  }>;

  if (resolved.length === 0) return getCalibration();

  interface FactorStats {
    total: number;
    correct: number;
    sumError: number;
  }
  const stats: Record<string, FactorStats> = {};

  for (const pred of resolved) {
    let factors: Array<{ id: string; hasData: boolean; winner: string; p1Advantage: number }> = [];
    try { factors = JSON.parse(pred.factors_json); } catch { continue; }

    for (const f of factors) {
      if (!f.hasData || Math.abs(f.p1Advantage) < 0.05) continue;
      if (!stats[f.id]) stats[f.id] = { total: 0, correct: 0, sumError: 0 };

      const factorFavouredP1 = f.winner === "p1";
      const actuallyP1Won = pred.actual_winner === "p1";
      const correct = factorFavouredP1 === actuallyP1Won;

      stats[f.id].total++;
      if (correct) stats[f.id].correct++;
      stats[f.id].sumError += pred.prediction_error ?? 0;
    }
  }

  const calibrations: Record<string, FactorCalibration> = {};

  await db.execute("BEGIN");
  try {
    for (const [factorId, s] of Object.entries(stats)) {
      const accuracy = s.total > 0 ? s.correct / s.total : 0.5;
      const avgError = s.total > 0 ? s.sumError / s.total : 0;

      const confidence = Math.min(1, s.total / 20);
      const rawMult = 1.0 + (accuracy - 0.5) * 2 * confidence;
      const weightMult = Math.max(0.4, Math.min(1.8, rawMult));

      await db.execute({
        sql: `
          INSERT INTO factor_calibration (factor_id, sample_count, avg_accuracy, avg_error, weight_mult, last_updated)
          VALUES (?, ?, ?, ?, ?, unixepoch())
          ON CONFLICT(factor_id) DO UPDATE SET
            sample_count = excluded.sample_count,
            avg_accuracy = excluded.avg_accuracy,
            avg_error    = excluded.avg_error,
            weight_mult  = excluded.weight_mult,
            last_updated = excluded.last_updated
        `,
        args: [factorId, s.total, accuracy, avgError, weightMult],
      });
      calibrations[factorId] = {
        factor_id: factorId,
        sample_count: s.total,
        avg_accuracy: accuracy,
        avg_error: avgError,
        weight_mult: weightMult,
      };
    }
    await db.execute("COMMIT");
  } catch (e) {
    await db.execute("ROLLBACK");
    throw e;
  }

  return calibrations;
}

// ── Lectura de calibración ────────────────────────────────

export async function getCalibration(): Promise<Record<string, FactorCalibration>> {
  const db = getDb();
  const result = await db.execute("SELECT * FROM factor_calibration");
  const rows = result.rows as unknown as FactorCalibration[];
  const out: Record<string, FactorCalibration> = {};
  for (const row of rows) out[row.factor_id] = row;
  return out;
}

export async function getFactorMult(factorId: string): Promise<number> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT weight_mult FROM factor_calibration WHERE factor_id = ?",
    args: [factorId],
  });
  const row = result.rows[0] as unknown as { weight_mult: number } | undefined;
  return row?.weight_mult ?? 1.0;
}

// ── Estadísticas de aprendizaje ───────────────────────────

export interface LearningStats {
  totalPredictions: number;
  resolved: number;
  pending: number;
  avgError: number | null;
  accuracy: number | null;
  factorCalibrations: FactorCalibration[];
  recentMistakes: Array<{
    date: string; tournament: string;
    player1: string; player2: string;
    predictedPct: number; actualWinner: string; error: number;
    mainFailedFactor: string;
  }>;
}

export async function getLearningStats(): Promise<LearningStats> {
  const db = getDb();

  const totalsResult = await db.execute(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN resolved_at IS NOT NULL THEN 1 ELSE 0 END) as resolved,
      SUM(CASE WHEN resolved_at IS NULL THEN 1 ELSE 0 END) as pending,
      AVG(CASE WHEN prediction_error IS NOT NULL THEN prediction_error END) as avg_error,
      AVG(CASE WHEN actual_winner IS NOT NULL AND (
        (actual_winner='p1' AND predicted_p1_pct >= 50) OR
        (actual_winner='p2' AND predicted_p1_pct < 50)
      ) THEN 1.0 ELSE 0.0 END) as accuracy
    FROM prediction_log
  `);
  const totals = totalsResult.rows[0] as unknown as {
    total: number; resolved: number; pending: number; avg_error: number | null; accuracy: number | null;
  };

  const calibResult = await db.execute("SELECT * FROM factor_calibration ORDER BY sample_count DESC");
  const calibrations = calibResult.rows as unknown as FactorCalibration[];

  const mistakesResult = await db.execute(`
    SELECT match_date, tournament, player1_slug, player2_slug,
           predicted_p1_pct, actual_winner, prediction_error, factors_json
    FROM prediction_log
    WHERE prediction_error > 0.4 AND resolved_at IS NOT NULL
    ORDER BY resolved_at DESC LIMIT 10
  `);
  const mistakes = mistakesResult.rows as unknown as Array<{
    match_date: string; tournament: string;
    player1_slug: string; player2_slug: string;
    predicted_p1_pct: number; actual_winner: string; prediction_error: number;
    factors_json: string;
  }>;

  const recentMistakes = mistakes.map((m) => {
    let factors: Array<{ id: string; hasData: boolean; winner: string; effectiveWeight: number }> = [];
    try { factors = JSON.parse(m.factors_json); } catch { /* */ }

    const predictedP1Won = m.predicted_p1_pct >= 50;
    const wrongDir = predictedP1Won ? "p1" : "p2";
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
