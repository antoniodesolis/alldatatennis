/**
 * Court Speed Index (CSI) — modelo de velocidad de pista por torneo ATP.
 *
 * Usa los últimos 3 años de datos de Sackmann CSV para caracterizar cada pista
 * con métricas derivadas de los puntos de saque reales:
 *
 *   ace_rate         → porcentaje de puntos de saque que son aces
 *   first_won_pct    → % de puntos ganados con primer servicio
 *   second_won_pct   → % de puntos ganados con segundo servicio
 *   hold_pct         → probabilidad de mantener el servicio (1 – BP_conversion)
 *   tiebreak_rate    → tiebreaks por set
 *   avg_duration     → duración media del partido
 *
 * El CSI (0-100) se calcula globalmente para todos los torneos, luego se le
 * asigna un perfil de texto y una afinidad por estilo de juego.
 *
 * Ejemplos esperados (aproximados, verificados con los datos reales):
 *   Basel indoor    ~90/100 — pista muy rápida
 *   Wimbledon grass ~80/100 — rápida
 *   Paris indoor    ~72/100 — media-rápida
 *   US Open hard    ~55/100 — media
 *   Australian Open ~58/100 — media
 *   Madrid clay     ~45/100 — media-lenta (la altitud la acelera vs otras arcillas)
 *   Monte Carlo clay~20/100 — lenta
 *   Roland Garros   ~18/100 — lenta
 *   Barcelona clay  ~10/100 — muy lenta
 */

import { getDb } from "../db/client";
import { upsertTournamentModel, updateMatchCourtSpeed } from "../db/queries";
import type { TournamentModelRow } from "../db/queries";
import { getPlayerStyle } from "./player-styles";

const YEARS = [2022, 2023, 2024];
const MIN_MATCHES = 8; // mínimo de filas con datos de saque para incluir un torneo

// ── Interfaces ────────────────────────────────────────────

export interface CourtModel {
  tourney_name: string;
  surface: string;
  matches: number;
  years: number[];
  // Métricas brutas
  ace_rate: number;
  first_in_pct: number;
  first_won_pct: number;
  second_won_pct: number;
  hold_pct: number;
  tiebreak_rate: number;
  avg_duration: number | null;
  // Índice derivado
  court_speed: number;       // 0-100
  court_profile: CourtProfile;
  // Afinidad por estilo
  style_affinity: StyleAffinity;
}

export type CourtProfile =
  | "fast"         // >70
  | "medium-fast"  // 55-70
  | "medium"       // 40-55
  | "medium-slow"  // 25-40
  | "slow";        // <25

export interface StyleAffinity {
  "big-server": number;
  "aggressive-baseliner": number;
  "all-court": number;
  "counter-puncher": number;
  "baseliner": number;
}

// ── SQL de métricas brutas ────────────────────────────────

interface RawRow {
  tourney_name: string;
  surface: string;
  rows: number;
  ace_rate: number;
  first_in_pct: number;
  first_won_pct: number;
  second_won_pct: number;
  bp_conv: number | null;
  tiebreak_rate: number | null;
  avg_duration: number | null;
}

function fetchRawMetrics(): RawRow[] {
  const db = getDb();
  const yearStart = `${Math.min(...YEARS)}-01-01`;
  const yearEnd   = `${Math.max(...YEARS)}-12-31`;

  return db.prepare(`
    SELECT
      tournament                          AS tourney_name,
      surface,
      COUNT(*)                            AS rows,
      SUM(aces) * 1.0 / NULLIF(SUM(serve_pts), 0)                            AS ace_rate,
      SUM(first_in) * 1.0 / NULLIF(SUM(serve_pts), 0)                        AS first_in_pct,
      SUM(first_won) * 1.0 / NULLIF(SUM(first_in), 0)                        AS first_won_pct,
      SUM(second_won) * 1.0 / NULLIF(SUM(serve_pts) - SUM(first_in), 0)      AS second_won_pct,
      SUM(bp_converted) * 1.0 / NULLIF(SUM(bp_opportunities), 0)             AS bp_conv,
      SUM(tb_played) * 1.0 / NULLIF(SUM(sets_played), 0)                     AS tiebreak_rate,
      AVG(CASE WHEN duration_min > 0 THEN duration_min END)                   AS avg_duration
    FROM player_match_stats
    WHERE
      match_date BETWEEN ? AND ?
      AND tournament IS NOT NULL
      AND first_in IS NOT NULL
      AND serve_pts IS NOT NULL
    GROUP BY tournament, surface
    HAVING rows >= ?
    ORDER BY rows DESC
  `).all(yearStart, yearEnd, MIN_MATCHES) as RawRow[];
}

// ── Normalización ─────────────────────────────────────────

function normalize(val: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (val - min) / (max - min)));
}

function courtSpeedRaw(r: RawRow): number {
  // Ponderación calibrada para separar bien las pistas:
  //   primer servicio ganado: mayor peso (señal más clara)
  //   segundo servicio ganado: aporta diferenciación
  //   ace_rate: amplifica la diferencia en superficies extremas
  //   1 - bp_conv: courts donde es difícil romper = más rápidas
  const bpHold = r.bp_conv !== null ? 1 - r.bp_conv : 0.5;
  return 0.40 * r.first_won_pct
       + 0.28 * r.second_won_pct
       + 0.22 * (r.ace_rate * 5)   // ace_rate es ~0.05-0.12, ×5 → ~0.25-0.60
       + 0.10 * bpHold;
}

function speedToProfile(speed: number): CourtProfile {
  if (speed >= 70) return "fast";
  if (speed >= 55) return "medium-fast";
  if (speed >= 40) return "medium";
  if (speed >= 25) return "medium-slow";
  return "slow";
}

// ── Afinidad por estilo ───────────────────────────────────

function computeStyleAffinity(tourneyName: string): StyleAffinity {
  const db = getDb();
  const yearStart = `${Math.min(...YEARS)}-01-01`;
  const yearEnd   = `${Math.max(...YEARS)}-12-31`;

  const rows = db.prepare(`
    SELECT te_slug, result
    FROM player_match_stats
    WHERE tournament = ?
      AND match_date BETWEEN ? AND ?
      AND result IS NOT NULL
  `).all(tourneyName, yearStart, yearEnd) as { te_slug: string; result: string }[];

  // Compute global win rate per style (all tournaments)
  const globalRows = db.prepare(`
    SELECT te_slug, result
    FROM player_match_stats
    WHERE match_date BETWEEN ? AND ?
      AND result IS NOT NULL
  `).all(yearStart, yearEnd) as { te_slug: string; result: string }[];

  const styles = ["big-server", "aggressive-baseliner", "all-court", "counter-puncher", "baseliner"] as const;

  const courtStats  = computeStyleStats(rows);
  const globalStats = computeStyleStats(globalRows);

  const affinity: StyleAffinity = {
    "big-server": 0, "aggressive-baseliner": 0, "all-court": 0,
    "counter-puncher": 0, "baseliner": 0,
  };
  for (const style of styles) {
    const cWR = courtStats[style];
    const gWR = globalStats[style];
    if (cWR !== null && gWR !== null) {
      affinity[style] = Math.round((cWR - gWR) * 1000) / 10; // en puntos porcentuales ×10
    }
  }
  return affinity;
}

function computeStyleStats(
  rows: { te_slug: string; result: string }[]
): Record<string, number | null> {
  const byStyle: Record<string, { w: number; l: number }> = {};
  for (const r of rows) {
    const style = getPlayerStyle(r.te_slug);
    if (!byStyle[style]) byStyle[style] = { w: 0, l: 0 };
    if (r.result === "W") byStyle[style].w++;
    else if (r.result === "L") byStyle[style].l++;
  }
  const result: Record<string, number | null> = {};
  for (const [style, { w, l }] of Object.entries(byStyle)) {
    result[style] = (w + l) >= 5 ? w / (w + l) : null;
  }
  return result;
}

// ── Punto de entrada público ──────────────────────────────

/**
 * Computa y guarda los modelos de pista para todos los torneos
 * con suficientes datos en los últimos 3 años.
 * Además actualiza court_speed en player_match_stats para cada torneo.
 *
 * Devuelve el número de torneos procesados.
 */
export function computeAndSaveTournamentModels(): { computed: number; models: CourtModel[] } {
  const rawRows = fetchRawMetrics();
  if (rawRows.length === 0) return { computed: 0, models: [] };

  // Calcular raw speed para todos los torneos
  const rawSpeeds = rawRows.map((r) => courtSpeedRaw(r));
  const minSpeed = Math.min(...rawSpeeds);
  const maxSpeed = Math.max(...rawSpeeds);

  const models: CourtModel[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const r = rawRows[i];
    const raw = rawSpeeds[i];
    const courtSpeed = Math.round(normalize(raw, minSpeed, maxSpeed) * 100);
    const profile = speedToProfile(courtSpeed);
    const affinity = computeStyleAffinity(r.tourney_name);

    const model: CourtModel = {
      tourney_name: r.tourney_name,
      surface: r.surface,
      matches: r.rows,
      years: YEARS,
      ace_rate: r.ace_rate,
      first_in_pct: r.first_in_pct,
      first_won_pct: r.first_won_pct,
      second_won_pct: r.second_won_pct,
      hold_pct: r.bp_conv !== null ? 1 - r.bp_conv : 0.5,
      tiebreak_rate: r.tiebreak_rate ?? 0,
      avg_duration: r.avg_duration,
      court_speed: courtSpeed,
      court_profile: profile,
      style_affinity: affinity,
    };

    models.push(model);

    // Guardar en DB
    const dbRow: TournamentModelRow = {
      tourney_name:  model.tourney_name,
      surface:       model.surface,
      years:         JSON.stringify(model.years),
      matches:       model.matches,
      ace_rate:      model.ace_rate,
      first_in_pct:  model.first_in_pct,
      first_won_pct: model.first_won_pct,
      second_won_pct:model.second_won_pct,
      hold_pct:      model.hold_pct,
      tiebreak_rate: model.tiebreak_rate,
      avg_duration:  model.avg_duration,
      court_speed:   model.court_speed,
      court_profile: model.court_profile,
      style_affinity:JSON.stringify(model.style_affinity),
      computed_at:   Math.floor(Date.now() / 1000),
    };
    upsertTournamentModel(dbRow);

    // Propagar court_speed a player_match_stats
    updateMatchCourtSpeed(model.tourney_name, model.court_speed);
  }

  return { computed: models.length, models };
}

/**
 * Devuelve el modelo de pista para un torneo (desde DB).
 */
export function getTournamentCourtModel(tourneyName: string): CourtModel | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT * FROM tournament_models WHERE tourney_name = ?"
  ).get(tourneyName) as TournamentModelRow | undefined;
  if (!row || row.court_speed == null) return null;
  return deserializeModel(row);
}

/**
 * Devuelve todos los modelos ordenados por velocidad de pista descendente.
 */
export function getAllCourtModels(): CourtModel[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM tournament_models ORDER BY court_speed DESC"
  ).all() as TournamentModelRow[];
  return rows.map(deserializeModel);
}

function deserializeModel(row: TournamentModelRow): CourtModel {
  let affinity: StyleAffinity = {
    "big-server": 0, "aggressive-baseliner": 0, "all-court": 0,
    "counter-puncher": 0, "baseliner": 0,
  };
  try { affinity = JSON.parse(row.style_affinity ?? "{}"); } catch { /* ignore */ }
  let years: number[] = YEARS;
  try { years = JSON.parse(row.years ?? "[]"); } catch { /* ignore */ }
  return {
    tourney_name:  row.tourney_name,
    surface:       row.surface ?? "unknown",
    matches:       row.matches ?? 0,
    years,
    ace_rate:      row.ace_rate ?? 0,
    first_in_pct:  row.first_in_pct ?? 0,
    first_won_pct: row.first_won_pct ?? 0,
    second_won_pct:row.second_won_pct ?? 0,
    hold_pct:      row.hold_pct ?? 0,
    tiebreak_rate: row.tiebreak_rate ?? 0,
    avg_duration:  row.avg_duration,
    court_speed:   row.court_speed ?? 0,
    court_profile: (row.court_profile ?? "medium") as CourtProfile,
    style_affinity: affinity,
  };
}
