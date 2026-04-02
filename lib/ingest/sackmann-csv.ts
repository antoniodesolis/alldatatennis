/**
 * Ingesta los CSV históricos de Jeff Sackmann (tennis_atp en GitHub).
 * Descarga atp_matches_{year}.csv para los años pedidos y carga las
 * estadísticas de servicio en la tabla player_match_stats.
 *
 * También descarga charting-m-stats-Overview.csv (Match Charting Project)
 * que añade winners y unforced_errors a matches que no los tienen.
 */

import { upsertMatchStat, upsertPlayer, markMatchProcessed } from "../db/queries";
import { nameToSlug, normalizeSurface, normalizeRound } from "../analytics/player-resolver";

const UA = "Mozilla/5.0 (compatible; AllDataTennis/1.0)";

// Columnas del CSV atp_matches_{year}.csv de Sackmann
const EXPECTED_COLS = [
  "tourney_id", "tourney_name", "surface", "draw_size", "tourney_level",
  "tourney_date", "match_num", "winner_id", "winner_seed", "winner_entry",
  "winner_name", "winner_hand", "winner_ht", "winner_ioc", "winner_age",
  "loser_id", "loser_seed", "loser_entry", "loser_name", "loser_hand",
  "loser_ht", "loser_ioc", "loser_age", "score", "best_of", "round",
  "minutes", "w_ace", "w_df", "w_svpt", "w_1stIn", "w_1stWon", "w_2ndWon",
  "w_SvGms", "w_bpSaved", "w_bpFaced", "l_ace", "l_df", "l_svpt",
  "l_1stIn", "l_1stWon", "l_2ndWon", "l_SvGms", "l_bpSaved", "l_bpFaced",
];

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === "," && !inQ) { result.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  result.push(cur.trim());
  return result;
}

function n(v: string): number | null {
  const x = parseFloat(v);
  return isNaN(x) ? null : x;
}

function sackmannDateToISO(d: string): string {
  // "20240101" → "2024-01-01"
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  return d;
}

async function fetchCSV(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

/**
 * Ingesta un año del CSV principal de Sackmann.
 * Devuelve el número de filas insertadas.
 */
export async function ingestSackmannYear(year: number): Promise<{ inserted: number; skipped: number }> {
  const url = `https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master/atp_matches_${year}.csv`;
  console.log(`[sackmann] Descargando ${url}`);
  const text = await fetchCSV(url);

  const lines = text.split("\n").filter(Boolean);
  if (lines.length < 2) throw new Error("CSV vacío");

  const header = parseCSVLine(lines[0]);
  const idx = (col: string) => header.indexOf(col);

  let inserted = 0;
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length < 20) continue;

    const winnerName = row[idx("winner_name")];
    const loserName  = row[idx("loser_name")];
    if (!winnerName || !loserName) continue;

    const winnerId   = n(row[idx("winner_id")]);
    const loserId    = n(row[idx("loser_id")]);
    const winnerSlug = nameToSlug(winnerName);
    const loserSlug  = nameToSlug(loserName);

    const rawDate    = row[idx("tourney_date")] ?? "";
    const matchDate  = sackmannDateToISO(rawDate);
    const tournament = row[idx("tourney_name")] ?? "";
    const surface    = normalizeSurface(row[idx("surface")] ?? "");
    const round      = normalizeRound(row[idx("round")] ?? "");
    const score      = row[idx("score")] ?? "";
    const minutes    = n(row[idx("minutes")]);
    const teMatchId  = `sack_${year}_${row[idx("tourney_id")]}_${row[idx("match_num")]}`;

    // Registrar jugadores
    if (winnerSlug) upsertPlayer({ te_slug: winnerSlug, atp_code: null, full_name: winnerName, sackmann_id: winnerId ? Math.round(winnerId) : null });
    if (loserSlug) upsertPlayer({ te_slug: loserSlug, atp_code: null, full_name: loserName, sackmann_id: loserId ? Math.round(loserId) : null });

    if (!winnerSlug && !loserSlug) { skipped++; continue; }

    const baseMatch = { te_match_id: teMatchId, match_date: matchDate, tournament, surface, round, score, duration_min: minutes ? Math.round(minutes) : null, source: "sackmann_csv" };

    // Fila del ganador
    if (winnerSlug) {
      upsertMatchStat({
        ...baseMatch,
        te_slug: winnerSlug,
        opponent_slug: loserSlug,
        result: "W",
        aces: n(row[idx("w_ace")]),
        double_faults: n(row[idx("w_df")]),
        serve_pts: n(row[idx("w_svpt")]),
        first_in: n(row[idx("w_1stIn")]),
        first_won: n(row[idx("w_1stWon")]),
        second_won: n(row[idx("w_2ndWon")]),
        serve_games: n(row[idx("w_SvGms")]),
        bp_saved: n(row[idx("w_bpSaved")]),
        bp_faced: n(row[idx("w_bpFaced")]),
        return_pts_won: null,
        winners: null,
        unforced_errors: null,
      });
      inserted++;
    }

    // Fila del perdedor
    if (loserSlug) {
      upsertMatchStat({
        ...baseMatch,
        te_slug: loserSlug,
        opponent_slug: winnerSlug,
        result: "L",
        aces: n(row[idx("l_ace")]),
        double_faults: n(row[idx("l_df")]),
        serve_pts: n(row[idx("l_svpt")]),
        first_in: n(row[idx("l_1stIn")]),
        first_won: n(row[idx("l_1stWon")]),
        second_won: n(row[idx("l_2ndWon")]),
        serve_games: n(row[idx("l_SvGms")]),
        bp_saved: n(row[idx("l_bpSaved")]),
        bp_faced: n(row[idx("l_bpFaced")]),
        return_pts_won: null,
        winners: null,
        unforced_errors: null,
      });
      inserted++;
    }

    markMatchProcessed(teMatchId, "stats_found");
  }

  console.log(`[sackmann] ${year}: ${inserted} filas insertadas, ${skipped} omitidas`);
  return { inserted, skipped };
}

/**
 * Ingesta el CSV de Match Charting Project para enriquecer winners/unforced.
 * URL: https://raw.githubusercontent.com/JeffSackmann/tennis_MatchChartingProject/master/charting-m-stats-Overview.csv
 */
export async function ingestChartingCSV(): Promise<{ enriched: number }> {
  const url = "https://raw.githubusercontent.com/JeffSackmann/tennis_MatchChartingProject/master/charting-m-stats-Overview.csv";
  console.log(`[charting] Descargando ${url}`);
  const text = await fetchCSV(url);

  const lines = text.split("\n").filter(Boolean);
  if (lines.length < 2) throw new Error("CSV vacío");

  const header = parseCSVLine(lines[0]);
  const idx = (col: string) => header.indexOf(col);

  let enriched = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length < 10) continue;

    // Solo filas de totales
    const setCol = row[idx("set")] ?? row[1] ?? "";
    if (setCol !== "Total") continue;

    // match_id: "20251221-M-NextGen_Finals-F-Alexander_Blockx-Learner_Tien"
    const matchId = row[idx("match_id")] ?? row[0] ?? "";
    const parts = matchId.split("-");
    if (parts.length < 6) continue;

    const dateStr = parts[0]; // "20251221"
    const matchDate = sackmannDateToISO(dateStr);
    const playerRaw = (row[idx("player")] ?? "").replace(/_/g, " ");
    const teSlug = nameToSlug(playerRaw);
    if (!teSlug) continue;

    const winners = n(row[idx("winners")] ?? row[idx("w")] ?? "");
    const unforced = n(row[idx("unforced")] ?? row[idx("ue")] ?? "");
    if (winners === null && unforced === null) continue;

    // Construir te_match_id único para charting (no coincide con sackmann, pero podemos buscar por fecha+jugador)
    // Usamos el matchId literal como referencia
    const teMatchId = `chart_${matchId.replace(/[^a-z0-9_]/gi, "_")}`;

    const playerName = playerRaw;
    upsertPlayer({ te_slug: teSlug, atp_code: null, full_name: playerName, sackmann_id: null });

    upsertMatchStat({
      te_slug: teSlug,
      te_match_id: teMatchId,
      match_date: matchDate,
      tournament: null,
      surface: null,
      round: null,
      opponent_slug: null,
      result: null,
      score: null,
      duration_min: null,
      aces: n(row[idx("ace")] ?? ""),
      double_faults: n(row[idx("df")] ?? ""),
      serve_pts: n(row[idx("svPts")] ?? row[idx("serve_pts")] ?? ""),
      first_in: n(row[idx("1stIn")] ?? row[idx("first_in")] ?? ""),
      first_won: n(row[idx("1stWon")] ?? row[idx("first_won")] ?? ""),
      second_won: n(row[idx("2ndWon")] ?? row[idx("second_won")] ?? ""),
      serve_games: null,
      bp_saved: n(row[idx("bpSaved")] ?? ""),
      bp_faced: n(row[idx("bpFaced")] ?? ""),
      return_pts_won: n(row[idx("retPtsWon")] ?? row[idx("return_pts_won")] ?? ""),
      winners,
      unforced_errors: unforced,
      source: "charting_csv",
    });
    enriched++;
  }

  console.log(`[charting] ${enriched} filas enriquecidas`);
  return { enriched };
}
