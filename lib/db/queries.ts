import { getDb } from "./client";

export interface PlayerRow {
  te_slug: string;
  atp_code: string | null;
  full_name: string | null;
  sackmann_id: number | null;
}

export interface MatchStatRow {
  id: number;
  te_slug: string;
  te_match_id: string;
  match_date: string;
  tournament: string | null;
  surface: string | null;
  round: string | null;
  opponent_slug: string | null;
  result: string | null;       // "W" | "L"
  score: string | null;
  duration_min: number | null;
  aces: number | null;
  double_faults: number | null;
  serve_pts: number | null;
  first_in: number | null;
  first_won: number | null;
  second_won: number | null;
  serve_games: number | null;
  bp_saved: number | null;
  bp_faced: number | null;
  return_pts_won: number | null;
  winners: number | null;
  unforced_errors: number | null;
  match_time: string | null;      // "21:00" hora local del torneo
  time_of_day: string | null;     // "day" | "evening" | "night"
  opponent_style: string | null;  // "big-server" | "aggressive-baseliner" | …
  source: string | null;
}

export interface PatternRow {
  te_slug: string;
  surface: string;
  window_n: number;
  computed_at: number | null;
  matches_used: number | null;
  win_rate: number | null;
  avg_aces: number | null;
  avg_df: number | null;
  first_serve_pct: number | null;
  first_serve_won_pct: number | null;
  second_serve_won_pct: number | null;
  bp_save_pct: number | null;
  avg_winners: number | null;
  avg_unforced: number | null;
  patterns_json: string | null;
}

// ── Players ──────────────────────────────────────────────

export function upsertPlayer(p: Omit<PlayerRow, never>) {
  const db = getDb();
  db.prepare(`
    INSERT INTO players (te_slug, atp_code, full_name, sackmann_id)
    VALUES (@te_slug, @atp_code, @full_name, @sackmann_id)
    ON CONFLICT(te_slug) DO UPDATE SET
      atp_code    = COALESCE(excluded.atp_code, atp_code),
      full_name   = COALESCE(excluded.full_name, full_name),
      sackmann_id = COALESCE(excluded.sackmann_id, sackmann_id)
  `).run(p);
}

export function getPlayer(teSlug: string): PlayerRow | undefined {
  return getDb().prepare("SELECT * FROM players WHERE te_slug = ?").get(teSlug) as PlayerRow | undefined;
}

// ── Match stats ───────────────────────────────────────────

export function upsertMatchStat(row: Omit<MatchStatRow, "id">) {
  const db = getDb();
  db.prepare(`
    INSERT INTO player_match_stats
      (te_slug, te_match_id, match_date, tournament, surface, round,
       opponent_slug, result, score, duration_min,
       aces, double_faults, serve_pts, first_in, first_won, second_won,
       serve_games, bp_saved, bp_faced, return_pts_won,
       winners, unforced_errors, match_time, time_of_day, opponent_style, source)
    VALUES
      (@te_slug, @te_match_id, @match_date, @tournament, @surface, @round,
       @opponent_slug, @result, @score, @duration_min,
       @aces, @double_faults, @serve_pts, @first_in, @first_won, @second_won,
       @serve_games, @bp_saved, @bp_faced, @return_pts_won,
       @winners, @unforced_errors, @match_time, @time_of_day, @opponent_style, @source)
    ON CONFLICT(te_slug, te_match_id) DO UPDATE SET
      surface         = COALESCE(excluded.surface, surface),
      round           = COALESCE(excluded.round, round),
      score           = COALESCE(excluded.score, score),
      duration_min    = COALESCE(excluded.duration_min, duration_min),
      aces            = COALESCE(excluded.aces, aces),
      double_faults   = COALESCE(excluded.double_faults, double_faults),
      serve_pts       = COALESCE(excluded.serve_pts, serve_pts),
      first_in        = COALESCE(excluded.first_in, first_in),
      first_won       = COALESCE(excluded.first_won, first_won),
      second_won      = COALESCE(excluded.second_won, second_won),
      serve_games     = COALESCE(excluded.serve_games, serve_games),
      bp_saved        = COALESCE(excluded.bp_saved, bp_saved),
      bp_faced        = COALESCE(excluded.bp_faced, bp_faced),
      return_pts_won  = COALESCE(excluded.return_pts_won, return_pts_won),
      winners         = COALESCE(excluded.winners, winners),
      unforced_errors = COALESCE(excluded.unforced_errors, unforced_errors),
      match_time      = COALESCE(excluded.match_time, match_time),
      time_of_day     = COALESCE(excluded.time_of_day, time_of_day),
      opponent_style  = COALESCE(excluded.opponent_style, opponent_style),
      source          = COALESCE(excluded.source, source)
  `).run(row);
}

export function getPlayerMatches(teSlug: string, opts: {
  surface?: string;
  limit?: number;
  season?: number;
} = {}): MatchStatRow[] {
  const db = getDb();
  let sql = "SELECT * FROM player_match_stats WHERE te_slug = ?";
  const args: (string | number)[] = [teSlug];
  if (opts.surface) { sql += " AND surface = ?"; args.push(opts.surface); }
  if (opts.season) { sql += " AND match_date LIKE ?"; args.push(`${opts.season}%`); }
  sql += " ORDER BY match_date DESC";
  if (opts.limit) { sql += " LIMIT ?"; args.push(opts.limit); }
  return db.prepare(sql).all(...args) as MatchStatRow[];
}

export function countPlayerMatches(teSlug: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) as n FROM player_match_stats WHERE te_slug = ?")
    .get(teSlug) as { n: number };
  return row.n;
}

// ── Processed matches ──────────────────────────────────────

export function isMatchProcessed(teMatchId: string): boolean {
  const row = getDb()
    .prepare("SELECT 1 FROM processed_matches WHERE te_match_id = ?")
    .get(teMatchId);
  return !!row;
}

export function markMatchProcessed(teMatchId: string, status: string) {
  getDb().prepare(`
    INSERT INTO processed_matches (te_match_id, status)
    VALUES (?, ?)
    ON CONFLICT(te_match_id) DO UPDATE SET status = excluded.status, processed_at = unixepoch()
  `).run(teMatchId, status);
}

// ── Patterns cache ─────────────────────────────────────────

export function savePattern(row: Omit<PatternRow, never>) {
  getDb().prepare(`
    INSERT INTO player_patterns
      (te_slug, surface, window_n, computed_at, matches_used,
       win_rate, avg_aces, avg_df, first_serve_pct, first_serve_won_pct,
       second_serve_won_pct, bp_save_pct, avg_winners, avg_unforced, patterns_json)
    VALUES
      (@te_slug, @surface, @window_n, @computed_at, @matches_used,
       @win_rate, @avg_aces, @avg_df, @first_serve_pct, @first_serve_won_pct,
       @second_serve_won_pct, @bp_save_pct, @avg_winners, @avg_unforced, @patterns_json)
    ON CONFLICT(te_slug, surface, window_n) DO UPDATE SET
      computed_at          = excluded.computed_at,
      matches_used         = excluded.matches_used,
      win_rate             = excluded.win_rate,
      avg_aces             = excluded.avg_aces,
      avg_df               = excluded.avg_df,
      first_serve_pct      = excluded.first_serve_pct,
      first_serve_won_pct  = excluded.first_serve_won_pct,
      second_serve_won_pct = excluded.second_serve_won_pct,
      bp_save_pct          = excluded.bp_save_pct,
      avg_winners          = excluded.avg_winners,
      avg_unforced         = excluded.avg_unforced,
      patterns_json        = excluded.patterns_json
  `).run(row);
}

export function getPattern(teSlug: string, surface: string, windowN: number): PatternRow | undefined {
  return getDb().prepare(
    "SELECT * FROM player_patterns WHERE te_slug = ? AND surface = ? AND window_n = ?"
  ).get(teSlug, surface, windowN) as PatternRow | undefined;
}

export function invalidatePatterns(teSlug: string) {
  getDb().prepare("DELETE FROM player_patterns WHERE te_slug = ?").run(teSlug);
}

// ── Stats summary ──────────────────────────────────────────

export function getDbStats(): { players: number; matches: number; processed: number } {
  const db = getDb();
  const players = (db.prepare("SELECT COUNT(*) as n FROM players").get() as { n: number }).n;
  const matches = (db.prepare("SELECT COUNT(*) as n FROM player_match_stats").get() as { n: number }).n;
  const processed = (db.prepare("SELECT COUNT(*) as n FROM processed_matches").get() as { n: number }).n;
  return { players, matches, processed };
}
