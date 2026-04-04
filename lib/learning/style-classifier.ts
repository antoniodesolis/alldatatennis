/**
 * lib/learning/style-classifier.ts
 *
 * Auto-clasificación del estilo de juego de un jugador a partir de sus patrones estadísticos.
 * Complementa el mapa estático PLAYER_STYLES con clasificación dinámica basada en datos reales.
 *
 * Reglas heurísticas (umbral-based):
 *   big-server:           first_serve_won_pct ≥ 0.73 OR avg_aces ≥ 7
 *   counter-puncher:      bp_save_pct ≥ 0.70 AND avg_duration ≥ 120 AND avg_winners ≤ 22
 *   aggressive-baseliner: avg_winners ≥ 28 AND avg_duration ≤ 95
 *   all-court:            win_rate ≥ 0.64 AND no rasgo dominante extremo
 *   baseliner:            default (no encaja en ninguna categoría anterior)
 *
 * También actualiza opponent_style en player_match_stats cuando se descubre el estilo
 * de un oponente que antes figuraba como NULL.
 */

import { getDb } from "../db/client";
import { PLAYER_STYLES, type PlayerStyle } from "../analytics/player-styles";

// ── Clasificación estadística ─────────────────────────────

interface StyleInput {
  avg_aces: number | null;
  first_serve_won_pct: number | null;
  second_serve_won_pct: number | null;
  bp_save_pct: number | null;
  avg_winners: number | null;
  avg_unforced: number | null;
  avg_duration: number | null;
  win_rate: number | null;
  matches_used: number;
}

export function classifyStyleFromStats(s: StyleInput): PlayerStyle | null {
  if (s.matches_used < 10) return null; // insuficiente para clasificar

  const aces      = s.avg_aces ?? 0;
  const fs_won    = s.first_serve_won_pct ?? 0;
  const bp_save   = s.bp_save_pct ?? 0;
  const winners   = s.avg_winners ?? 0;
  const duration  = s.avg_duration ?? 100;
  const win_rate  = s.win_rate ?? 0.5;

  // Big server: saque dominante
  if (fs_won >= 0.73 || aces >= 7) return "big-server";

  // Counter-puncher: defensivo, partidos largos, pocos winners
  if (bp_save >= 0.70 && duration >= 115 && winners <= 24) return "counter-puncher";

  // Aggressive baseliner: muchos winners, partidos cortos
  if (winners >= 28 && duration <= 100) return "aggressive-baseliner";

  // All-court: alto win rate y sin rasgo extremo negativo
  if (win_rate >= 0.63 && winners >= 18 && bp_save >= 0.60) return "all-court";

  return "baseliner"; // default
}

// ── Backfill de opponent_style en player_match_stats ─────

/**
 * Para cada fila de player_match_stats donde opponent_style IS NULL,
 * intenta inferir el estilo del oponente usando:
 *   1. Mapa estático PLAYER_STYLES
 *   2. Patrones computados del oponente (player_patterns)
 *
 * Devuelve número de filas actualizadas.
 */
export function backfillOpponentStyles(): number {
  const db = getDb();

  // Obtener slugs únicos de oponentes sin estilo
  const slugsWithNull = db.prepare(`
    SELECT DISTINCT opponent_slug
    FROM player_match_stats
    WHERE opponent_style IS NULL AND opponent_slug IS NOT NULL
  `).all() as { opponent_slug: string }[];

  const updateStmt = db.prepare(
    "UPDATE player_match_stats SET opponent_style = ? WHERE opponent_slug = ? AND opponent_style IS NULL"
  );

  // Buscar patrones del oponente en player_patterns (surface='', window_n=30)
  const getPatternStmt = db.prepare(`
    SELECT matches_used, win_rate, avg_aces, first_serve_won_pct, second_serve_won_pct,
           bp_save_pct, avg_winners, avg_unforced, patterns_json
    FROM player_patterns WHERE te_slug = ? AND surface = '' AND window_n = 30
    LIMIT 1
  `);

  let updated = 0;

  const run = db.transaction(() => {
    for (const { opponent_slug } of slugsWithNull) {
      // 1. Mapa estático (más fiable)
      let style: PlayerStyle | null = PLAYER_STYLES[opponent_slug] ?? null;

      // 2. Si no está en el mapa estático, inferir de patrones
      if (!style) {
        const row = getPatternStmt.get(opponent_slug) as {
          matches_used: number; win_rate: number | null;
          avg_aces: number | null; first_serve_won_pct: number | null;
          second_serve_won_pct: number | null; bp_save_pct: number | null;
          avg_winners: number | null; avg_unforced: number | null;
          patterns_json: string | null;
        } | undefined;

        if (row) {
          // Intentar extraer avg_duration del patterns_json
          let avg_duration: number | null = null;
          try {
            const pj = JSON.parse(row.patterns_json ?? "{}");
            avg_duration = pj.avgDuration ?? null;
          } catch { /* */ }

          style = classifyStyleFromStats({
            avg_aces: row.avg_aces,
            first_serve_won_pct: row.first_serve_won_pct,
            second_serve_won_pct: row.second_serve_won_pct,
            bp_save_pct: row.bp_save_pct,
            avg_winners: row.avg_winners,
            avg_unforced: row.avg_unforced,
            avg_duration,
            win_rate: row.win_rate,
            matches_used: row.matches_used ?? 0,
          });
        }
      }

      if (style) {
        const info = updateStmt.run(style, opponent_slug);
        updated += info.changes;
      }
    }
  });

  run();
  return updated;
}

// ── Reclasificación de todos los jugadores con patrones ──

/**
 * Recorre todos los jugadores con patrones computados y actualiza opponent_style
 * en sus registros opuestos (cuando ellos son el oponente de otra fila).
 * También devuelve el estilo inferido para cada jugador para auditoría.
 */
export function reclassifyAllStyles(): Array<{ slug: string; style: PlayerStyle; source: "static" | "inferred" }> {
  const db = getDb();

  const patterns = db.prepare(`
    SELECT te_slug, matches_used, win_rate, avg_aces, first_serve_won_pct,
           second_serve_won_pct, bp_save_pct, avg_winners, avg_unforced, patterns_json
    FROM player_patterns WHERE surface = '' AND window_n = 30
  `).all() as Array<{
    te_slug: string; matches_used: number; win_rate: number | null;
    avg_aces: number | null; first_serve_won_pct: number | null;
    second_serve_won_pct: number | null; bp_save_pct: number | null;
    avg_winners: number | null; avg_unforced: number | null;
    patterns_json: string | null;
  }>;

  const results: Array<{ slug: string; style: PlayerStyle; source: "static" | "inferred" }> = [];
  const updateStmt = db.prepare(
    "UPDATE player_match_stats SET opponent_style = ? WHERE opponent_slug = ? AND opponent_style IS NULL"
  );

  const run = db.transaction(() => {
    for (const row of patterns) {
      // Static map takes precedence
      const staticStyle = PLAYER_STYLES[row.te_slug];
      if (staticStyle) {
        updateStmt.run(staticStyle, row.te_slug);
        results.push({ slug: row.te_slug, style: staticStyle, source: "static" });
        continue;
      }

      let avg_duration: number | null = null;
      try {
        const pj = JSON.parse(row.patterns_json ?? "{}");
        avg_duration = pj.avgDuration ?? null;
      } catch { /* */ }

      const inferred = classifyStyleFromStats({
        avg_aces: row.avg_aces,
        first_serve_won_pct: row.first_serve_won_pct,
        second_serve_won_pct: row.second_serve_won_pct,
        bp_save_pct: row.bp_save_pct,
        avg_winners: row.avg_winners,
        avg_unforced: row.avg_unforced,
        avg_duration,
        win_rate: row.win_rate,
        matches_used: row.matches_used ?? 0,
      });

      if (inferred) {
        updateStmt.run(inferred, row.te_slug);
        results.push({ slug: row.te_slug, style: inferred, source: "inferred" });
      }
    }
  });

  run();
  return results;
}
