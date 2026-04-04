import { getDb } from "./client";

export function runMigrations() {
  const db = getDb();

  db.exec(`
    -- Registro canónico de jugadores
    CREATE TABLE IF NOT EXISTS players (
      te_slug     TEXT PRIMARY KEY,
      atp_code    TEXT,
      full_name   TEXT,
      sackmann_id INTEGER,
      created_at  INTEGER DEFAULT (unixepoch())
    );

    -- Estadísticas por partido por jugador
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
      -- Servicio
      aces            INTEGER,
      double_faults   INTEGER,
      serve_pts       INTEGER,
      first_in        INTEGER,
      first_won       INTEGER,
      second_won      INTEGER,
      serve_games     INTEGER,
      bp_saved        INTEGER,
      bp_faced        INTEGER,
      -- Resto
      return_pts_won  INTEGER,
      -- Golpes
      winners         INTEGER,
      unforced_errors INTEGER,
      -- Origen del dato
      source          TEXT,
      fetched_at      INTEGER DEFAULT (unixepoch()),
      UNIQUE(te_slug, te_match_id)
    );

    CREATE INDEX IF NOT EXISTS idx_pms_slug_date
      ON player_match_stats(te_slug, match_date DESC);

    CREATE INDEX IF NOT EXISTS idx_pms_slug_surface
      ON player_match_stats(te_slug, surface, match_date DESC);
  `);

  // Migraciones aditivas — ADD COLUMN falla si ya existe, lo ignoramos
  const addCols = [
    "ALTER TABLE player_match_stats ADD COLUMN match_time      TEXT",
    "ALTER TABLE player_match_stats ADD COLUMN time_of_day     TEXT",
    "ALTER TABLE player_match_stats ADD COLUMN opponent_style  TEXT",
  ];
  for (const sql of addCols) {
    try { db.exec(sql); } catch { /* columna ya existe */ }
  }

  db.exec(`
    -- Control de partidos ya procesados
    CREATE TABLE IF NOT EXISTS processed_matches (
      te_match_id  TEXT PRIMARY KEY,
      processed_at INTEGER DEFAULT (unixepoch()),
      status       TEXT
    );

    -- Caché de patrones computados
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
    );
  `);
}
