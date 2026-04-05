/**
 * lib/learning/style-classifier.ts
 *
 * Auto-clasificación del estilo de juego de un jugador a partir de sus patrones estadísticos.
 * Complementa el mapa estático PLAYER_STYLES con clasificación dinámica basada en datos reales.
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
  if (s.matches_used < 10) return null;

  const aces      = s.avg_aces ?? 0;
  const fs_won    = s.first_serve_won_pct ?? 0;
  const bp_save   = s.bp_save_pct ?? 0;
  const winners   = s.avg_winners ?? 0;
  const duration  = s.avg_duration ?? 100;
  const win_rate  = s.win_rate ?? 0.5;

  if (fs_won >= 0.73 || aces >= 7) return "big-server";
  if (bp_save >= 0.70 && duration >= 115 && winners <= 24) return "counter-puncher";
  if (winners >= 28 && duration <= 100) return "aggressive-baseliner";
  if (win_rate >= 0.63 && winners >= 18 && bp_save >= 0.60) return "all-court";
  return "baseliner";
}

// ── Backfill de opponent_style en player_match_stats ─────

export async function backfillOpponentStyles(): Promise<number> {
  const db = getDb();

  const slugsResult = await db.execute(`
    SELECT DISTINCT opponent_slug
    FROM player_match_stats
    WHERE opponent_style IS NULL AND opponent_slug IS NOT NULL
  `);
  const slugsWithNull = slugsResult.rows as unknown as { opponent_slug: string }[];

  let updated = 0;

  const tx = await db.transaction("write");
  try {
    for (const { opponent_slug } of slugsWithNull) {
      let style: PlayerStyle | null = PLAYER_STYLES[opponent_slug] ?? null;

      if (!style) {
        const patResult = await tx.execute({
          sql: `
            SELECT matches_used, win_rate, avg_aces, first_serve_won_pct, second_serve_won_pct,
                   bp_save_pct, avg_winners, avg_unforced, patterns_json
            FROM player_patterns WHERE te_slug = ? AND surface = '' AND window_n = 30
            LIMIT 1
          `,
          args: [opponent_slug],
        });
        const row = patResult.rows[0] as unknown as {
          matches_used: number; win_rate: number | null;
          avg_aces: number | null; first_serve_won_pct: number | null;
          second_serve_won_pct: number | null; bp_save_pct: number | null;
          avg_winners: number | null; avg_unforced: number | null;
          patterns_json: string | null;
        } | undefined;

        if (row) {
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
        const updateResult = await tx.execute({
          sql: "UPDATE player_match_stats SET opponent_style = ? WHERE opponent_slug = ? AND opponent_style IS NULL",
          args: [style, opponent_slug],
        });
        updated += updateResult.rowsAffected;
      }
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  } finally {
    tx.close();
  }

  return updated;
}

// ── Reclasificación de todos los jugadores con patrones ──

export async function reclassifyAllStyles(): Promise<Array<{ slug: string; style: PlayerStyle; source: "static" | "inferred" }>> {
  const db = getDb();

  const patternsResult = await db.execute(`
    SELECT te_slug, matches_used, win_rate, avg_aces, first_serve_won_pct,
           second_serve_won_pct, bp_save_pct, avg_winners, avg_unforced, patterns_json
    FROM player_patterns WHERE surface = '' AND window_n = 30
  `);
  const patterns = patternsResult.rows as unknown as Array<{
    te_slug: string; matches_used: number; win_rate: number | null;
    avg_aces: number | null; first_serve_won_pct: number | null;
    second_serve_won_pct: number | null; bp_save_pct: number | null;
    avg_winners: number | null; avg_unforced: number | null;
    patterns_json: string | null;
  }>;

  const results: Array<{ slug: string; style: PlayerStyle; source: "static" | "inferred" }> = [];

  const tx = await db.transaction("write");
  try {
    for (const row of patterns) {
      const staticStyle = PLAYER_STYLES[row.te_slug];
      if (staticStyle) {
        await tx.execute({
          sql: "UPDATE player_match_stats SET opponent_style = ? WHERE opponent_slug = ? AND opponent_style IS NULL",
          args: [staticStyle, row.te_slug],
        });
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
        await tx.execute({
          sql: "UPDATE player_match_stats SET opponent_style = ? WHERE opponent_slug = ? AND opponent_style IS NULL",
          args: [inferred, row.te_slug],
        });
        results.push({ slug: row.te_slug, style: inferred, source: "inferred" });
      }
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  } finally {
    tx.close();
  }

  return results;
}
