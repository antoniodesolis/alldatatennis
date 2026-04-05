import { getDb } from "./client";

export async function runMigrations(): Promise<void> {
  const db = getDb();

  // ── Tabla de jugadores ────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS players (
      te_slug     TEXT PRIMARY KEY,
      atp_code    TEXT,
      full_name   TEXT,
      sackmann_id INTEGER,
      created_at  INTEGER DEFAULT (unixepoch())
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS player_match_stats (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      te_slug         TEXT NOT NULL,
      te_match_id     TEXT NOT NULL,
      match_date      TEXT NOT NULL,
      tournament      TEXT,
      surface         TEXT,
      round           TEXT,
      opponent_slug   TEXT,
      result          TEXT,
      score           TEXT,
      duration_min    INTEGER,
      aces            INTEGER,
      double_faults   INTEGER,
      serve_pts       INTEGER,
      first_in        INTEGER,
      first_won       INTEGER,
      second_won      INTEGER,
      serve_games     INTEGER,
      bp_saved        INTEGER,
      bp_faced        INTEGER,
      return_pts_won  INTEGER,
      winners         INTEGER,
      unforced_errors INTEGER,
      source          TEXT,
      fetched_at      INTEGER DEFAULT (unixepoch()),
      UNIQUE(te_slug, te_match_id)
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_pms_slug_date
      ON player_match_stats(te_slug, match_date DESC)
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_pms_slug_surface
      ON player_match_stats(te_slug, surface, match_date DESC)
  `);

  // ── Tablas de aprendizaje automático ─────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS prediction_log (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id        TEXT NOT NULL,
      match_date      TEXT NOT NULL,
      player1_slug    TEXT NOT NULL,
      player2_slug    TEXT NOT NULL,
      tournament      TEXT,
      surface         TEXT,
      tourney_level   TEXT,
      predicted_p1_pct REAL NOT NULL,
      actual_winner   TEXT,
      prediction_error REAL,
      factors_json    TEXT NOT NULL,
      created_at      INTEGER DEFAULT (unixepoch()),
      resolved_at     INTEGER,
      UNIQUE(match_id, player1_slug)
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_pred_log_date ON prediction_log(match_date DESC)
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_pred_log_resolved ON prediction_log(resolved_at) WHERE resolved_at IS NULL
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS factor_calibration (
      factor_id       TEXT PRIMARY KEY,
      sample_count    INTEGER DEFAULT 0,
      avg_accuracy    REAL DEFAULT 0.5,
      avg_error       REAL DEFAULT 0.0,
      weight_mult     REAL DEFAULT 1.0,
      last_updated    INTEGER DEFAULT (unixepoch())
    )
  `);

  // ── Enriquecimiento post-partido ─────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS match_insights (
      te_match_id     TEXT PRIMARY KEY,
      match_date      TEXT NOT NULL,
      winner_slug     TEXT NOT NULL,
      loser_slug      TEXT NOT NULL,
      tournament      TEXT,
      surface         TEXT,
      score           TEXT,
      match_pattern   TEXT,
      chronicle_url   TEXT,
      chronicle_src   TEXT,
      insights_json   TEXT,
      enriched_at     INTEGER DEFAULT (unixepoch())
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS player_insights (
      te_slug         TEXT PRIMARY KEY,
      insights_json   TEXT NOT NULL DEFAULT '{}',
      match_count     INTEGER DEFAULT 0,
      updated_at      INTEGER DEFAULT (unixepoch())
    )
  `);

  // ── Rankings ATP persistidos ─────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS atp_rankings (
      rank        INTEGER NOT NULL,
      atp_code    TEXT NOT NULL,
      name        TEXT NOT NULL,
      country     TEXT,
      points      TEXT DEFAULT '',
      updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (rank, updated_at)
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_rankings_updated ON atp_rankings(updated_at DESC)
  `);

  // ── Migraciones aditivas ──────────────────────────────────
  const addCols = [
    "ALTER TABLE player_match_stats ADD COLUMN match_time        TEXT",
    "ALTER TABLE player_match_stats ADD COLUMN time_of_day       TEXT",
    "ALTER TABLE player_match_stats ADD COLUMN opponent_style    TEXT",
    "ALTER TABLE player_match_stats ADD COLUMN best_of           INTEGER",
    "ALTER TABLE player_match_stats ADD COLUMN tourney_level     TEXT",
    "ALTER TABLE player_match_stats ADD COLUMN indoor            INTEGER",
    "ALTER TABLE player_match_stats ADD COLUMN opponent_rank     INTEGER",
    "ALTER TABLE player_match_stats ADD COLUMN sets_played       INTEGER",
    "ALTER TABLE player_match_stats ADD COLUMN won_deciding      INTEGER",
    "ALTER TABLE player_match_stats ADD COLUMN tb_played         INTEGER",
    "ALTER TABLE player_match_stats ADD COLUMN tb_won            INTEGER",
    "ALTER TABLE player_match_stats ADD COLUMN bp_converted      INTEGER",
    "ALTER TABLE player_match_stats ADD COLUMN bp_opportunities  INTEGER",
    "ALTER TABLE player_match_stats ADD COLUMN court_speed       REAL",
  ];
  for (const sql of addCols) {
    try { await db.execute(sql); } catch { /* column already exists */ }
  }

  // ── Tablas adicionales ────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS processed_matches (
      te_match_id  TEXT PRIMARY KEY,
      processed_at INTEGER DEFAULT (unixepoch()),
      status       TEXT
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS tournament_models (
      tourney_name        TEXT PRIMARY KEY,
      surface             TEXT,
      years               TEXT,
      matches             INTEGER,
      ace_rate            REAL,
      first_in_pct        REAL,
      first_won_pct       REAL,
      second_won_pct      REAL,
      hold_pct            REAL,
      tiebreak_rate       REAL,
      avg_duration        REAL,
      court_speed         REAL,
      court_profile       TEXT,
      style_affinity      TEXT,
      computed_at         INTEGER
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS player_patterns (
      te_slug             TEXT NOT NULL,
      surface             TEXT NOT NULL DEFAULT '',
      window_n            INTEGER NOT NULL DEFAULT 10,
      computed_at         INTEGER,
      matches_used        INTEGER,
      win_rate            REAL,
      avg_aces            REAL,
      avg_df              REAL,
      first_serve_pct     REAL,
      first_serve_won_pct REAL,
      second_serve_won_pct REAL,
      bp_save_pct         REAL,
      avg_winners         REAL,
      avg_unforced        REAL,
      patterns_json       TEXT,
      PRIMARY KEY (te_slug, surface, window_n)
    )
  `);
}
