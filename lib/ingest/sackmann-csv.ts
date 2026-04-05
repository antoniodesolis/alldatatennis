/**
 * Ingesta CSV históricos de Jeff Sackmann (tennis_atp en GitHub).
 * Extrae TODOS los campos disponibles por partido.
 */

import { upsertPlayer, markMatchProcessed, upsertMatchStat } from "../db/queries";
import { nameToSlug, normalizeSurface, normalizeRound } from "../analytics/player-resolver";
import { getPlayerStyle } from "../analytics/player-styles";
import { playerScoreStats } from "./score-parser";
import { getTourneyLevel, isIndoor } from "./tourney-meta";

const UA = "Mozilla/5.0 (compatible; AllDataTennis/1.0)";

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

function n(v: string | undefined): number | null {
  if (!v || v.trim() === "") return null;
  const x = parseFloat(v);
  return isNaN(x) ? null : x;
}

function sackmannDateToISO(d: string): string {
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  return d;
}

async function fetchCSV(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} para ${url}`);
  return res.text();
}

export async function ingestSackmannYear(year: number): Promise<{ inserted: number; skipped: number }> {
  const url = `https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master/atp_matches_${year}.csv`;
  console.log(`[sackmann] Descargando ${url}…`);
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

    const score      = row[idx("score")] ?? "";
    const bestOf     = parseInt(row[idx("best_of")] ?? "3") || 3;
    const rawSurface = row[idx("surface")] ?? "";
    const surface    = normalizeSurface(rawSurface);
    const round      = normalizeRound(row[idx("round")] ?? "");
    const rawDate    = row[idx("tourney_date")] ?? "";
    const matchDate  = sackmannDateToISO(rawDate);
    const tournament = row[idx("tourney_name")] ?? "";
    const minutes    = n(row[idx("minutes")]);
    const teMatchId  = `sack_${year}_${row[idx("tourney_id")]}_${row[idx("match_num")]}`;

    const level  = getTourneyLevel(row[idx("tourney_level")] ?? "", tournament);
    const indoor = isIndoor(tournament, rawSurface) ? 1 : 0;

    const winnerId   = n(row[idx("winner_id")]);
    const loserId    = n(row[idx("loser_id")]);
    const winnerRank = n(row[idx("winner_rank")]);
    const loserRank  = n(row[idx("loser_rank")]);

    const winnerSlug = nameToSlug(winnerName);
    const loserSlug  = nameToSlug(loserName);

    if (!winnerSlug && !loserSlug) { skipped++; continue; }

    // Registrar jugadores
    if (winnerSlug) await upsertPlayer({ te_slug: winnerSlug, atp_code: null, full_name: winnerName, sackmann_id: winnerId ? Math.round(winnerId) : null });
    if (loserSlug)  await upsertPlayer({ te_slug: loserSlug,  atp_code: null, full_name: loserName,  sackmann_id: loserId  ? Math.round(loserId)  : null });

    // Parsear score
    const wStats = playerScoreStats(score, "W", bestOf);
    const lStats = playerScoreStats(score, "L", bestOf);

    // BP como restador
    // Ganador como restador: loser's serve stats
    const wBpConverted    = n(row[idx("l_bpFaced")]) !== null && n(row[idx("l_bpSaved")]) !== null
      ? (n(row[idx("l_bpFaced")])! - n(row[idx("l_bpSaved")])!) : null;
    const wBpOpportunities = n(row[idx("l_bpFaced")]);

    // Perdedor como restador: winner's serve stats
    const lBpConverted    = n(row[idx("w_bpFaced")]) !== null && n(row[idx("w_bpSaved")]) !== null
      ? (n(row[idx("w_bpFaced")])! - n(row[idx("w_bpSaved")])!) : null;
    const lBpOpportunities = n(row[idx("w_bpFaced")]);

    const base = {
      te_match_id: teMatchId,
      match_date: matchDate,
      tournament,
      surface,
      round,
      score,
      duration_min: minutes ? Math.round(minutes) : null,
      match_time: null,
      time_of_day: null,
      best_of: bestOf,
      tourney_level: level,
      indoor,
      return_pts_won: null,
      winners: null,
      unforced_errors: null,
      source: "sackmann_csv",
    };

    if (winnerSlug) {
      await upsertMatchStat({
        ...base,
        te_slug: winnerSlug,
        opponent_slug: loserSlug,
        opponent_style: loserSlug ? getPlayerStyle(loserSlug) : null,
        result: "W",
        opponent_rank: loserRank,
        aces:          n(row[idx("w_ace")]),
        double_faults: n(row[idx("w_df")]),
        serve_pts:     n(row[idx("w_svpt")]),
        first_in:      n(row[idx("w_1stIn")]),
        first_won:     n(row[idx("w_1stWon")]),
        second_won:    n(row[idx("w_2ndWon")]),
        serve_games:   n(row[idx("w_SvGms")]),
        bp_saved:      n(row[idx("w_bpSaved")]),
        bp_faced:      n(row[idx("w_bpFaced")]),
        sets_played:   wStats?.setsPlayed ?? null,
        won_deciding:  wStats?.wonDeciding ? 1 : 0,
        tb_played:     wStats?.tbPlayed ?? null,
        tb_won:        wStats?.tbWon ?? null,
        bp_converted:  wBpConverted,
        bp_opportunities: wBpOpportunities,
        court_speed: null,
      });
      inserted++;
    }

    if (loserSlug) {
      await upsertMatchStat({
        ...base,
        te_slug: loserSlug,
        opponent_slug: winnerSlug,
        opponent_style: winnerSlug ? getPlayerStyle(winnerSlug) : null,
        result: "L",
        opponent_rank: winnerRank,
        aces:          n(row[idx("l_ace")]),
        double_faults: n(row[idx("l_df")]),
        serve_pts:     n(row[idx("l_svpt")]),
        first_in:      n(row[idx("l_1stIn")]),
        first_won:     n(row[idx("l_1stWon")]),
        second_won:    n(row[idx("l_2ndWon")]),
        serve_games:   n(row[idx("l_SvGms")]),
        bp_saved:      n(row[idx("l_bpSaved")]),
        bp_faced:      n(row[idx("l_bpFaced")]),
        sets_played:   lStats?.setsPlayed ?? null,
        won_deciding:  lStats?.wonDeciding ? 1 : 0,
        tb_played:     lStats?.tbPlayed ?? null,
        tb_won:        lStats?.tbWon ?? null,
        bp_converted:  lBpConverted,
        bp_opportunities: lBpOpportunities,
        court_speed: null,
      });
      inserted++;
    }

    await markMatchProcessed(teMatchId, "stats_found");
  }

  console.log(`[sackmann] ${year}: ${inserted} filas insertadas, ${skipped} omitidas`);
  return { inserted, skipped };
}

export async function ingestChartingCSV(): Promise<{ enriched: number }> {
  const url = "https://raw.githubusercontent.com/JeffSackmann/tennis_MatchChartingProject/master/charting-m-stats-Overview.csv";
  console.log(`[charting] Descargando ${url}…`);
  const text = await fetchCSV(url);
  const lines = text.split("\n").filter(Boolean);
  if (lines.length < 2) throw new Error("CSV vacío");

  const header = parseCSVLine(lines[0]);
  const idx = (col: string) => header.indexOf(col);

  let enriched = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length < 10) continue;
    const setCol = row[idx("set")] ?? row[1] ?? "";
    if (setCol !== "Total") continue;

    const matchId   = row[idx("match_id")] ?? row[0] ?? "";
    const parts     = matchId.split("-");
    if (parts.length < 6) continue;

    const matchDate  = (() => {
      const d = parts[0];
      return d.length === 8 ? `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}` : d;
    })();
    const playerRaw  = (row[idx("player")] ?? "").replace(/_/g, " ");
    const teSlug     = nameToSlug(playerRaw);
    if (!teSlug) continue;

    const winners  = (() => { const v = row[idx("winners")] ?? row[idx("w")] ?? ""; const x = parseFloat(v); return isNaN(x) ? null : x; })();
    const unforced = (() => { const v = row[idx("unforced")] ?? row[idx("ue")] ?? ""; const x = parseFloat(v); return isNaN(x) ? null : x; })();
    if (winners === null && unforced === null) continue;

    const teMatchId = `chart_${matchId.replace(/[^a-z0-9_]/gi, "_")}`;
    await upsertPlayer({ te_slug: teSlug, atp_code: null, full_name: playerRaw, sackmann_id: null });

    const nv = (col: string) => { const v = row[idx(col)] ?? ""; const x = parseFloat(v); return isNaN(x) ? null : x; };

    await upsertMatchStat({
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
      match_time: null,
      time_of_day: null,
      opponent_style: null,
      best_of: null,
      tourney_level: null,
      indoor: null,
      opponent_rank: null,
      sets_played: null,
      won_deciding: null,
      tb_played: null,
      tb_won: null,
      bp_converted: null,
      bp_opportunities: null,
      aces:           nv("ace"),
      double_faults:  nv("df"),
      serve_pts:      nv("svPts") ?? nv("serve_pts"),
      first_in:       nv("1stIn") ?? nv("first_in"),
      first_won:      nv("1stWon") ?? nv("first_won"),
      second_won:     nv("2ndWon") ?? nv("second_won"),
      serve_games:    null,
      bp_saved:       nv("bpSaved"),
      bp_faced:       nv("bpFaced"),
      return_pts_won: nv("retPtsWon") ?? nv("return_pts_won"),
      winners,
      unforced_errors: unforced,
      court_speed: null,
      source: "charting_csv",
    });
    enriched++;
  }

  console.log(`[charting] ${enriched} filas enriquecidas`);
  return { enriched };
}
