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
  match_time: string | null;
  time_of_day: string | null;
  opponent_style: string | null;
  best_of: number | null;
  tourney_level: string | null;
  indoor: number | null;
  opponent_rank: number | null;
  sets_played: number | null;
  won_deciding: number | null;
  tb_played: number | null;
  tb_won: number | null;
  bp_converted: number | null;
  bp_opportunities: number | null;
  court_speed: number | null;
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

export async function upsertPlayer(p: PlayerRow): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `
      INSERT INTO players (te_slug, atp_code, full_name, sackmann_id)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(te_slug) DO UPDATE SET
        atp_code    = COALESCE(excluded.atp_code, atp_code),
        full_name   = COALESCE(excluded.full_name, full_name),
        sackmann_id = COALESCE(excluded.sackmann_id, sackmann_id)
    `,
    args: [p.te_slug, p.atp_code, p.full_name, p.sackmann_id],
  });
}

export async function getPlayer(teSlug: string): Promise<PlayerRow | undefined> {
  const db = getDb();
  const result = await db.execute({ sql: "SELECT * FROM players WHERE te_slug = ?", args: [teSlug] });
  return result.rows[0] as unknown as PlayerRow | undefined;
}

// ── Match stats ───────────────────────────────────────────

export async function upsertMatchStat(row: Omit<MatchStatRow, "id">): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `
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
        (?, ?, ?, ?, ?, ?,
         ?, ?, ?, ?,
         ?, ?, ?, ?, ?, ?,
         ?, ?, ?, ?,
         ?, ?, ?, ?, ?,
         ?, ?, ?, ?,
         ?, ?, ?, ?, ?, ?,
         ?, ?)
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
        winners          = COALESCE(excluded.winners, winners),
        unforced_errors  = COALESCE(excluded.unforced_errors, unforced_errors),
        match_time       = COALESCE(excluded.match_time, match_time),
        time_of_day      = COALESCE(excluded.time_of_day, time_of_day),
        opponent_style   = COALESCE(excluded.opponent_style, opponent_style),
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
        source           = COALESCE(excluded.source, source)
    `,
    args: [
      row.te_slug, row.te_match_id, row.match_date, row.tournament, row.surface, row.round,
      row.opponent_slug, row.result, row.score, row.duration_min,
      row.aces, row.double_faults, row.serve_pts, row.first_in, row.first_won, row.second_won,
      row.serve_games, row.bp_saved, row.bp_faced, row.return_pts_won,
      row.winners, row.unforced_errors, row.match_time, row.time_of_day, row.opponent_style,
      row.best_of, row.tourney_level, row.indoor, row.opponent_rank,
      row.sets_played, row.won_deciding, row.tb_played, row.tb_won, row.bp_converted, row.bp_opportunities,
      row.court_speed, row.source,
    ],
  });
}

export async function getPlayerMatches(teSlug: string, opts: {
  surface?: string;
  limit?: number;
  season?: number;
  since?: string;
} = {}): Promise<MatchStatRow[]> {
  const db = getDb();
  let sql = "SELECT * FROM player_match_stats WHERE te_slug = ?";
  const args: (string | number)[] = [teSlug];
  if (opts.surface) { sql += " AND surface = ?"; args.push(opts.surface); }
  if (opts.season)  { sql += " AND match_date LIKE ?"; args.push(`${opts.season}%`); }
  if (opts.since)   { sql += " AND match_date >= ?"; args.push(opts.since); }
  sql += " ORDER BY match_date DESC";
  if (opts.limit) { sql += " LIMIT ?"; args.push(opts.limit); }
  const result = await db.execute({ sql, args });
  return result.rows as unknown as MatchStatRow[];
}

export async function countPlayerMatches(teSlug: string): Promise<number> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT COUNT(*) as n FROM player_match_stats WHERE te_slug = ?",
    args: [teSlug],
  });
  const row = result.rows[0] as unknown as { n: number };
  return row.n;
}

// ── Processed matches ──────────────────────────────────────

export async function isMatchProcessed(teMatchId: string): Promise<boolean> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT 1 FROM processed_matches WHERE te_match_id = ?",
    args: [teMatchId],
  });
  return result.rows.length > 0;
}

export async function markMatchProcessed(teMatchId: string, status: string): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `
      INSERT INTO processed_matches (te_match_id, status)
      VALUES (?, ?)
      ON CONFLICT(te_match_id) DO UPDATE SET status = excluded.status, processed_at = unixepoch()
    `,
    args: [teMatchId, status],
  });
}

// ── Patterns cache ─────────────────────────────────────────

export async function savePattern(row: PatternRow): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `
      INSERT INTO player_patterns
        (te_slug, surface, window_n, computed_at, matches_used,
         win_rate, avg_aces, avg_df, first_serve_pct, first_serve_won_pct,
         second_serve_won_pct, bp_save_pct, avg_winners, avg_unforced, patterns_json)
      VALUES
        (?, ?, ?, ?, ?,
         ?, ?, ?, ?, ?,
         ?, ?, ?, ?, ?)
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
    `,
    args: [
      row.te_slug, row.surface, row.window_n, row.computed_at, row.matches_used,
      row.win_rate, row.avg_aces, row.avg_df, row.first_serve_pct, row.first_serve_won_pct,
      row.second_serve_won_pct, row.bp_save_pct, row.avg_winners, row.avg_unforced, row.patterns_json,
    ],
  });
}

export async function getPattern(teSlug: string, surface: string, windowN: number): Promise<PatternRow | undefined> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM player_patterns WHERE te_slug = ? AND surface = ? AND window_n = ?",
    args: [teSlug, surface, windowN],
  });
  return result.rows[0] as unknown as PatternRow | undefined;
}

export async function invalidatePatterns(teSlug: string): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: "DELETE FROM player_patterns WHERE te_slug = ?",
    args: [teSlug],
  });
}

// ── Tournament models ──────────────────────────────────────

export interface TournamentModelRow {
  tourney_name: string;
  surface: string | null;
  years: string | null;
  matches: number | null;
  ace_rate: number | null;
  first_in_pct: number | null;
  first_won_pct: number | null;
  second_won_pct: number | null;
  hold_pct: number | null;
  tiebreak_rate: number | null;
  avg_duration: number | null;
  court_speed: number | null;
  court_profile: string | null;
  style_affinity: string | null;
  computed_at: number | null;
}

export async function upsertTournamentModel(row: TournamentModelRow): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `
      INSERT INTO tournament_models
        (tourney_name, surface, years, matches, ace_rate, first_in_pct, first_won_pct,
         second_won_pct, hold_pct, tiebreak_rate, avg_duration,
         court_speed, court_profile, style_affinity, computed_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?,
         ?, ?, ?, ?,
         ?, ?, ?, ?)
      ON CONFLICT(tourney_name) DO UPDATE SET
        surface        = excluded.surface,
        years          = excluded.years,
        matches        = excluded.matches,
        ace_rate       = excluded.ace_rate,
        first_in_pct   = excluded.first_in_pct,
        first_won_pct  = excluded.first_won_pct,
        second_won_pct = excluded.second_won_pct,
        hold_pct       = excluded.hold_pct,
        tiebreak_rate  = excluded.tiebreak_rate,
        avg_duration   = excluded.avg_duration,
        court_speed    = excluded.court_speed,
        court_profile  = excluded.court_profile,
        style_affinity = excluded.style_affinity,
        computed_at    = excluded.computed_at
    `,
    args: [
      row.tourney_name, row.surface, row.years, row.matches, row.ace_rate, row.first_in_pct, row.first_won_pct,
      row.second_won_pct, row.hold_pct, row.tiebreak_rate, row.avg_duration,
      row.court_speed, row.court_profile, row.style_affinity, row.computed_at,
    ],
  });
}

export async function getAllTournamentModels(): Promise<TournamentModelRow[]> {
  const db = getDb();
  const result = await db.execute("SELECT * FROM tournament_models ORDER BY court_speed DESC");
  return result.rows as unknown as TournamentModelRow[];
}

export async function getTournamentModel(name: string): Promise<TournamentModelRow | undefined> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM tournament_models WHERE tourney_name = ?",
    args: [name],
  });
  return result.rows[0] as unknown as TournamentModelRow | undefined;
}

export async function updateMatchCourtSpeed(tourneyName: string, courtSpeed: number): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: "UPDATE player_match_stats SET court_speed = ? WHERE tournament = ?",
    args: [courtSpeed, tourneyName],
  });
}

// ── Match insights ─────────────────────────────────────────

export interface MatchInsightRow {
  te_match_id:   string;
  match_date:    string;
  winner_slug:   string;
  loser_slug:    string;
  tournament:    string | null;
  surface:       string | null;
  score:         string | null;
  match_pattern: string | null;
  chronicle_url: string | null;
  chronicle_src: string | null;
  insights_json: string | null;
  enriched_at:   number | null;
}

export async function upsertMatchInsight(row: MatchInsightRow): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `
      INSERT INTO match_insights
        (te_match_id, match_date, winner_slug, loser_slug, tournament, surface, score,
         match_pattern, chronicle_url, chronicle_src, insights_json, enriched_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?,
         ?, ?, ?, ?, ?)
      ON CONFLICT(te_match_id) DO UPDATE SET
        match_pattern  = COALESCE(excluded.match_pattern, match_pattern),
        chronicle_url  = COALESCE(excluded.chronicle_url, chronicle_url),
        chronicle_src  = COALESCE(excluded.chronicle_src, chronicle_src),
        insights_json  = COALESCE(excluded.insights_json, insights_json),
        enriched_at    = excluded.enriched_at
    `,
    args: [
      row.te_match_id, row.match_date, row.winner_slug, row.loser_slug,
      row.tournament, row.surface, row.score,
      row.match_pattern, row.chronicle_url, row.chronicle_src, row.insights_json, row.enriched_at,
    ],
  });
}

export async function getMatchInsight(teMatchId: string): Promise<MatchInsightRow | undefined> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM match_insights WHERE te_match_id = ?",
    args: [teMatchId],
  });
  return result.rows[0] as unknown as MatchInsightRow | undefined;
}

export async function getMatchesNeedingEnrichment(since: string, limit = 50): Promise<MatchInsightRow[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `
      SELECT DISTINCT
        pms.te_match_id,
        pms.match_date,
        pms.te_slug          AS winner_slug,
        pms.opponent_slug    AS loser_slug,
        pms.tournament,
        pms.surface,
        pms.score,
        mi.match_pattern,
        mi.chronicle_url,
        mi.chronicle_src,
        mi.insights_json,
        mi.enriched_at
      FROM player_match_stats pms
      LEFT JOIN match_insights mi ON mi.te_match_id = pms.te_match_id
      WHERE pms.result = 'W'
        AND pms.match_date >= ?
        AND pms.score IS NOT NULL
        AND (mi.te_match_id IS NULL OR mi.insights_json IS NULL)
      ORDER BY pms.match_date DESC
      LIMIT ?
    `,
    args: [since, limit],
  });
  return result.rows as unknown as MatchInsightRow[];
}

// ── Player insights ────────────────────────────────────────

export interface PlayerInsightRow {
  te_slug:      string;
  insights_json: string;
  match_count:  number;
  updated_at:   number;
}

export interface AccumulatedInsights {
  matchPatterns:        { dominio: number; batalla: number; irregular: number; remontada: number; walkover: number };
  tacticalObservations: string[];
  weaponsConfirmed:     string[];
  weaknessesConfirmed:  string[];
  mentalObservations:   string[];
  surfaceNotes:         Record<string, string[]>;
  lastUpdated:          string;
  matchCount:           number;
}

function emptyAccumulated(): AccumulatedInsights {
  return {
    matchPatterns: { dominio: 0, batalla: 0, irregular: 0, remontada: 0, walkover: 0 },
    tacticalObservations: [],
    weaponsConfirmed: [],
    weaknessesConfirmed: [],
    mentalObservations: [],
    surfaceNotes: {},
    lastUpdated: new Date().toISOString().slice(0, 10),
    matchCount: 0,
  };
}

export async function getPlayerInsights(teSlug: string): Promise<AccumulatedInsights> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT insights_json FROM player_insights WHERE te_slug = ?",
    args: [teSlug],
  });
  const row = result.rows[0] as unknown as { insights_json: string } | undefined;

  if (!row) return emptyAccumulated();
  try {
    return JSON.parse(row.insights_json) as AccumulatedInsights;
  } catch {
    return emptyAccumulated();
  }
}

export async function savePlayerInsights(teSlug: string, insights: AccumulatedInsights): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `
      INSERT INTO player_insights (te_slug, insights_json, match_count, updated_at)
      VALUES (?, ?, ?, unixepoch())
      ON CONFLICT(te_slug) DO UPDATE SET
        insights_json = excluded.insights_json,
        match_count   = excluded.match_count,
        updated_at    = excluded.updated_at
    `,
    args: [teSlug, JSON.stringify(insights), insights.matchCount],
  });
}

// ── Stats summary ──────────────────────────────────────────

export async function getDbStats(): Promise<{ players: number; matches: number; processed: number }> {
  const db = getDb();
  const [p, m, pr] = await Promise.all([
    db.execute("SELECT COUNT(*) as n FROM players"),
    db.execute("SELECT COUNT(*) as n FROM player_match_stats"),
    db.execute("SELECT COUNT(*) as n FROM processed_matches"),
  ]);
  const players   = (p.rows[0] as unknown as { n: number }).n;
  const matches   = (m.rows[0] as unknown as { n: number }).n;
  const processed = (pr.rows[0] as unknown as { n: number }).n;
  return { players, matches, processed };
}
