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
    "ALTER TABLE player_match_stats ADD COLUMN court_speed       REAL",   // 0-100 índice de velocidad de pista
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

    -- Modelos de velocidad de pista por torneo
    CREATE TABLE IF NOT EXISTS tournament_models (
      tourney_name        TEXT PRIMARY KEY,
      surface             TEXT,
      years               TEXT,          -- JSON array e.g. [2022,2023,2024]
      matches             INTEGER,       -- nº de filas usadas para el cálculo
      -- Métricas brutas (promedios de todos los jugadores en ese torneo)
      ace_rate            REAL,          -- aces / serve_pts
      first_in_pct        REAL,          -- first_in / serve_pts
      first_won_pct       REAL,          -- first_won / first_in
      second_won_pct      REAL,          -- second_won / (serve_pts - first_in)
      hold_pct            REAL,          -- 1 - bp_conversion (bp_conv/bp_opp)
      tiebreak_rate       REAL,          -- tb_played / sets_played
      avg_duration        REAL,
      -- Índice derivado
      court_speed         REAL,          -- 0-100 global (calculado relativo a todos los torneos)
      court_profile       TEXT,          -- "fast"|"medium-fast"|"medium"|"medium-slow"|"slow"
      -- Qué estilos favorece (JSON: {style: differential_pp})
      style_affinity      TEXT,
      computed_at         INTEGER
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
