/**
 * GET /api/history
 *
 * Devuelve el historial de predicciones agrupado por mes.
 * Para cada predicción intenta resolver el ganador real:
 *   1. actual_winner en prediction_log (si ya fue resuelto por daily-sync)
 *   2. JOIN con player_match_stats source='te_history' result='W' por fecha+slug
 *
 * Lógica de outcome:
 *   - maxPct ≤ 54% → "close" (gris, demasiado igualado para contar)
 *   - predicted winner == actual winner → "correct" (verde)
 *   - predicted winner != actual winner → "wrong" (rojo)
 *   - sin resultado disponible → "pending" (gris)
 */

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";

function formatName(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function getOutcome(
  predictedP1Pct: number,
  actualWinner: string | null
): "correct" | "wrong" | "close" | "pending" {
  const maxPct = Math.max(predictedP1Pct, 100 - predictedP1Pct);
  if (maxPct <= 54) return "close";
  if (!actualWinner) return "pending";
  const predictedWinner = predictedP1Pct >= 50 ? "p1" : "p2";
  return predictedWinner === actualWinner ? "correct" : "wrong";
}

export interface HistoryMatch {
  matchId: string;
  date: string;
  player1: string;
  player2: string;
  p1Slug: string;
  p2Slug: string;
  tournament: string;
  surface: string;
  predictedPct: number;      // predicted p1 win %
  predictedWinner: string;   // display name of predicted winner
  outcome: "correct" | "wrong" | "close" | "pending";
}

export interface MonthHistory {
  month: string;             // "2026-04"
  label: string;             // "Abril 2026"
  total: number;
  correct: number;
  wrong: number;
  close: number;
  pending: number;
  matches: HistoryMatch[];
}

const MONTH_LABELS: Record<string, string> = {
  "01": "Enero", "02": "Febrero", "03": "Marzo", "04": "Abril",
  "05": "Mayo",  "06": "Junio",   "07": "Julio", "08": "Agosto",
  "09": "Septiembre", "10": "Octubre", "11": "Noviembre", "12": "Diciembre",
};

// Solo torneos ATP principales (sin challengers, futures, UTR, ITF)
function isMainATP(tournament: string): boolean {
  const lower = (tournament ?? "").toLowerCase();
  return !lower.includes("challenger") && !lower.includes("chall.")
    && !lower.includes("chall ") && !lower.includes("utr")
    && !lower.includes("itf") && !lower.includes("futures")
    && !lower.includes("miyazaki") && !lower.includes("barletta")
    && !lower.includes("menorca") && !lower.includes("sao leopoldo")
    && !lower.includes("san luis") && !lower.includes("pro tennis series");
}

export async function GET() {
  const db = getDb();

  // Solo desde abril 2026 en adelante
  const FROM_DATE = "2026-04-01";

  // Unique predictions: keep most recent per match+player1 combo
  // Join with player_match_stats to resolve winner if not already stored
  const rows = db.prepare(`
    SELECT
      pl.match_id,
      pl.match_date,
      pl.player1_slug,
      pl.player2_slug,
      pl.tournament,
      pl.surface,
      pl.predicted_p1_pct,
      pl.actual_winner,
      p1.full_name  AS p1_name,
      p2.full_name  AS p2_name,
      pms.te_slug   AS resolved_winner_slug
    FROM prediction_log pl
    LEFT JOIN players p1 ON p1.te_slug = pl.player1_slug
    LEFT JOIN players p2 ON p2.te_slug = pl.player2_slug
    LEFT JOIN player_match_stats pms ON
      pms.match_date    = pl.match_date
      AND pms.source    = 'te_history'
      AND pms.result    = 'W'
      AND (pms.te_slug = pl.player1_slug OR pms.te_slug = pl.player2_slug)
      AND (pms.opponent_slug = pl.player1_slug OR pms.opponent_slug = pl.player2_slug)
    WHERE pl.match_date >= ?
    ORDER BY pl.match_date DESC, pl.id DESC
  `).all(FROM_DATE) as Array<{
    match_id: string;
    match_date: string;
    player1_slug: string;
    player2_slug: string;
    tournament: string;
    surface: string;
    predicted_p1_pct: number;
    actual_winner: string | null;
    p1_name: string | null;
    p2_name: string | null;
    resolved_winner_slug: string | null;
  }>;

  // Deduplicate: prediction_log can have multiple rows per match if re-analyzed
  // Keep one per (match_id, player1_slug) — already sorted DESC so first = most recent
  const seen = new Set<string>();
  const monthMap = new Map<string, MonthHistory>();

  for (const row of rows) {
    const key = `${row.match_id}|${row.player1_slug}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Filtrar torneos no ATP (challengers, futures, UTR, ITF…)
    if (!isMainATP(row.tournament)) continue;

    // Resolve actual winner: prefer stored, then join result
    let actualWinner = row.actual_winner;
    if (!actualWinner && row.resolved_winner_slug) {
      actualWinner = row.resolved_winner_slug === row.player1_slug ? "p1" : "p2";
    }

    const outcome = getOutcome(row.predicted_p1_pct, actualWinner);
    const month = row.match_date.slice(0, 7);
    const [year, mon] = month.split("-");
    const label = `${MONTH_LABELS[mon] ?? mon} ${year}`;

    const p1Display = row.p1_name ?? formatName(row.player1_slug);
    const p2Display = row.p2_name ?? formatName(row.player2_slug);

    const predictedWinner =
      row.predicted_p1_pct >= 50 ? p1Display : p2Display;

    if (!monthMap.has(month)) {
      monthMap.set(month, {
        month,
        label,
        total: 0,
        correct: 0,
        wrong: 0,
        close: 0,
        pending: 0,
        matches: [],
      });
    }

    const entry = monthMap.get(month)!;
    entry.total++;
    if (outcome === "correct") entry.correct++;
    else if (outcome === "wrong") entry.wrong++;
    else if (outcome === "close") entry.close++;
    else entry.pending++;

    entry.matches.push({
      matchId: row.match_id,
      date: row.match_date,
      player1: p1Display,
      player2: p2Display,
      p1Slug: row.player1_slug,
      p2Slug: row.player2_slug,
      tournament: row.tournament,
      surface: row.surface,
      predictedPct: row.predicted_p1_pct,
      predictedWinner,
      outcome,
    });
  }

  // Sort months newest first
  const months = Array.from(monthMap.values()).sort((a, b) =>
    b.month.localeCompare(a.month)
  );

  return NextResponse.json({ ok: true, months });
}
