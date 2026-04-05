/**
 * Court Speed Index (CSI) — modelo de velocidad de pista por torneo ATP.
 */

import { getDb } from "../db/client";
import { upsertTournamentModel, updateMatchCourtSpeed } from "../db/queries";
import type { TournamentModelRow } from "../db/queries";
import { getPlayerStyle } from "./player-styles";

const YEARS = [2022, 2023, 2024];
const MIN_MATCHES = 8;

// ── Interfaces ────────────────────────────────────────────

export interface CourtModel {
  tourney_name: string;
  surface: string;
  matches: number;
  years: number[];
  ace_rate: number;
  first_in_pct: number;
  first_won_pct: number;
  second_won_pct: number;
  hold_pct: number;
  tiebreak_rate: number;
  avg_duration: number | null;
  court_speed: number;
  court_profile: CourtProfile;
  style_affinity: StyleAffinity;
}

export type CourtProfile =
  | "fast"
  | "medium-fast"
  | "medium"
  | "medium-slow"
  | "slow";

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

async function fetchRawMetrics(): Promise<RawRow[]> {
  const db = getDb();
  const yearStart = `${Math.min(...YEARS)}-01-01`;
  const yearEnd   = `${Math.max(...YEARS)}-12-31`;

  const result = await db.execute({
    sql: `
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
    `,
    args: [yearStart, yearEnd, MIN_MATCHES],
  });
  return result.rows as unknown as RawRow[];
}

// ── Normalización ─────────────────────────────────────────

function normalize(val: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (val - min) / (max - min)));
}

function courtSpeedRaw(r: RawRow): number {
  const bpHold = r.bp_conv !== null ? 1 - r.bp_conv : 0.5;
  return 0.40 * r.first_won_pct
       + 0.28 * r.second_won_pct
       + 0.22 * (r.ace_rate * 5)
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

async function computeStyleAffinity(tourneyName: string): Promise<StyleAffinity> {
  const db = getDb();
  const yearStart = `${Math.min(...YEARS)}-01-01`;
  const yearEnd   = `${Math.max(...YEARS)}-12-31`;

  const courtResult = await db.execute({
    sql: `
      SELECT te_slug, result
      FROM player_match_stats
      WHERE tournament = ?
        AND match_date BETWEEN ? AND ?
        AND result IS NOT NULL
    `,
    args: [tourneyName, yearStart, yearEnd],
  });
  const rows = courtResult.rows as unknown as { te_slug: string; result: string }[];

  const globalResult = await db.execute({
    sql: `
      SELECT te_slug, result
      FROM player_match_stats
      WHERE match_date BETWEEN ? AND ?
        AND result IS NOT NULL
    `,
    args: [yearStart, yearEnd],
  });
  const globalRows = globalResult.rows as unknown as { te_slug: string; result: string }[];

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
      affinity[style] = Math.round((cWR - gWR) * 1000) / 10;
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

export async function computeAndSaveTournamentModels(): Promise<{ computed: number; models: CourtModel[] }> {
  const rawRows = await fetchRawMetrics();
  if (rawRows.length === 0) return { computed: 0, models: [] };

  const rawSpeeds = rawRows.map((r) => courtSpeedRaw(r));
  const minSpeed = Math.min(...rawSpeeds);
  const maxSpeed = Math.max(...rawSpeeds);

  const models: CourtModel[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const r = rawRows[i];
    const raw = rawSpeeds[i];
    const courtSpeed = Math.round(normalize(raw, minSpeed, maxSpeed) * 100);
    const profile = speedToProfile(courtSpeed);
    const affinity = await computeStyleAffinity(r.tourney_name);

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
    await upsertTournamentModel(dbRow);
    await updateMatchCourtSpeed(model.tourney_name, model.court_speed);
  }

  return { computed: models.length, models };
}

export async function getTournamentCourtModel(tourneyName: string): Promise<CourtModel | null> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM tournament_models WHERE tourney_name = ?",
    args: [tourneyName],
  });
  const row = result.rows[0] as unknown as TournamentModelRow | undefined;
  if (!row || row.court_speed == null) return null;
  return deserializeModel(row);
}

export async function getAllCourtModels(): Promise<CourtModel[]> {
  const db = getDb();
  const result = await db.execute("SELECT * FROM tournament_models ORDER BY court_speed DESC");
  const rows = result.rows as unknown as TournamentModelRow[];
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
