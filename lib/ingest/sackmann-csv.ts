/**
 * Ingesta CSV históricos de Jeff Sackmann (tennis_atp en GitHub).
 * Extrae TODOS los campos disponibles por partido.
 */

import { getDb } from "../db/client";
import { upsertPlayer, markMatchProcessed } from "../db/queries";
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

  const db = getDb();
  const insertStmt = db.prepare(`
    INSERT INTO player_match_stats
      (te_slug, te_match_id, match_date, tournament, surface, round,
       opponent_slug, result, score, duration_min,
       aces, double_faults, serve_pts, first_in, first_won, second_won,
       serve_games, bp_saved, bp_faced, return_pts_won,
       winners, unforced_errors, match_time, time_of_day, opponent_style,
       best_of, tourney_level, indoor, opponent_rank,
       sets_played, won_deciding, tb_played, tb_won, bp_converted, bp_opportunities,
       court_speed, source)
    VALUES
      (@te_slug, @te_match_id, @match_date, @tournament, @surface, @round,
       @opponent_slug, @result, @score, @duration_min,
       @aces, @double_faults, @serve_pts, @first_in, @first_won, @second_won,
       @serve_games, @bp_saved, @bp_faced, @return_pts_won,
       @winners, @unforced_errors, @match_time, @time_of_day, @opponent_style,
       @best_of, @tourney_level, @indoor, @opponent_rank,
       @sets_played, @won_deciding, @tb_played, @tb_won, @bp_converted, @bp_opportunities,
       @court_speed, @source)
    ON CONFLICT(te_slug, te_match_id) DO UPDATE SET
      surface          = COALESCE(excluded.surface, surface),
      round            = COALESCE(excluded.round, round),
      score            = COALESCE(excluded.score, score),
      duration_min     = COALESCE(excluded.duration_min, duration_min),
      aces             = COALESCE(excluded.aces, aces),
      double_faults    = COALESCE(excluded.double_faults, double_faults),
      serve_pts        = COALESCE(excluded.serve_pts, serve_pts),
      first_in         = COALESCE(excluded.first_in, first_in),
      first_won        = COALESCE(excluded.first_won, first_won),
      second_won       = COALESCE(excluded.second_won, second_won),
      serve_games      = COALESCE(excluded.serve_games, serve_games),
      bp_saved         = COALESCE(excluded.bp_saved, bp_saved),
      bp_faced         = COALESCE(excluded.bp_faced, bp_faced),
      return_pts_won   = COALESCE(excluded.return_pts_won, return_pts_won),
      best_of          = COALESCE(excluded.best_of, best_of),
      tourney_level    = COALESCE(excluded.tourney_level, tourney_level),
      indoor           = COALESCE(excluded.indoor, indoor),
      opponent_rank    = COALESCE(excluded.opponent_rank, opponent_rank),
      sets_played      = COALESCE(excluded.sets_played, sets_played),
      won_deciding     = COALESCE(excluded.won_deciding, won_deciding),
      tb_played        = COALESCE(excluded.tb_played, tb_played),
      tb_won           = COALESCE(excluded.tb_won, tb_won),
      bp_converted     = COALESCE(excluded.bp_converted, bp_converted),
      bp_opportunities = COALESCE(excluded.bp_opportunities, bp_opportunities),
      court_speed      = COALESCE(excluded.court_speed, court_speed),
      opponent_style   = COALESCE(excluded.opponent_style, opponent_style),
      source           = COALESCE(excluded.source, source)
  `);

  const markStmt = db.prepare(`
    INSERT INTO processed_matches (te_match_id, status)
    VALUES (?, ?)
    ON CONFLICT(te_match_id) DO UPDATE SET status = excluded.status, processed_at = unixepoch()
  `);

  let inserted = 0;
  let skipped = 0;

  // Envolver en transacción para rendimiento
  const ingestAll = db.transaction(() => {
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
      if (winnerSlug) upsertPlayer({ te_slug: winnerSlug, atp_code: null, full_name: winnerName, sackmann_id: winnerId ? Math.round(winnerId) : null });
      if (loserSlug)  upsertPlayer({ te_slug: loserSlug,  atp_code: null, full_name: loserName,  sackmann_id: loserId  ? Math.round(loserId)  : null });

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
        insertStmt.run({
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
        insertStmt.run({
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

      markStmt.run(teMatchId, "stats_found");
    }
  });

  ingestAll();
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
  const db = getDb();

  const insertStmt = db.prepare(`
    INSERT INTO player_match_stats
      (te_slug, te_match_id, match_date, tournament, surface, round,
       opponent_slug, result, score, duration_min, match_time, time_of_day,
       opponent_style, best_of, tourney_level, indoor, opponent_rank,
       sets_played, won_deciding, tb_played, tb_won, bp_converted, bp_opportunities,
       aces, double_faults, serve_pts, first_in, first_won, second_won,
       serve_games, bp_saved, bp_faced, return_pts_won, winners, unforced_errors, source)
    VALUES
      (@te_slug, @te_match_id, @match_date, NULL, NULL, NULL,
       NULL, NULL, NULL, NULL, NULL, NULL,
       NULL, NULL, NULL, NULL, NULL,
       NULL, NULL, NULL, NULL, NULL, NULL,
       @aces, @double_faults, @serve_pts, @first_in, @first_won, @second_won,
       NULL, @bp_saved, @bp_faced, @return_pts_won, @winners, @unforced_errors, 'charting_csv')
    ON CONFLICT(te_slug, te_match_id) DO UPDATE SET
      aces            = COALESCE(excluded.aces, aces),
      double_faults   = COALESCE(excluded.double_faults, double_faults),
      serve_pts       = COALESCE(excluded.serve_pts, serve_pts),
      first_in        = COALESCE(excluded.first_in, first_in),
      first_won       = COALESCE(excluded.first_won, first_won),
      second_won      = COALESCE(excluded.second_won, second_won),
      bp_saved        = COALESCE(excluded.bp_saved, bp_saved),
      bp_faced        = COALESCE(excluded.bp_faced, bp_faced),
      return_pts_won  = COALESCE(excluded.return_pts_won, return_pts_won),
      winners         = COALESCE(excluded.winners, winners),
      unforced_errors = COALESCE(excluded.unforced_errors, unforced_errors)
  `);

  let enriched = 0;

  const ingestAll = db.transaction(() => {
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
      upsertPlayer({ te_slug: teSlug, atp_code: null, full_name: playerRaw, sackmann_id: null });

      const nv = (col: string) => { const v = row[idx(col)] ?? ""; const x = parseFloat(v); return isNaN(x) ? null : x; };

      insertStmt.run({
        te_slug: teSlug,
        te_match_id: teMatchId,
        match_date: matchDate,
        aces:           nv("ace"),
        double_faults:  nv("df"),
        serve_pts:      nv("svPts") ?? nv("serve_pts"),
        first_in:       nv("1stIn") ?? nv("first_in"),
        first_won:      nv("1stWon") ?? nv("first_won"),
        second_won:     nv("2ndWon") ?? nv("second_won"),
        bp_saved:       nv("bpSaved"),
        bp_faced:       nv("bpFaced"),
        return_pts_won: nv("retPtsWon") ?? nv("return_pts_won"),
        winners,
        unforced_errors: unforced,
      });
      enriched++;
    }
  });

  ingestAll();
  console.log(`[charting] ${enriched} filas enriquecidas`);
  return { enriched };
}
