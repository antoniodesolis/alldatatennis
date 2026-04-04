/**
 * POST /api/admin/normalize-slugs
 *
 * Merges split-slug data into canonical slugs.
 *
 * Problem: the same player has data under 2+ different slugs because
 * TennisExplorer uses compound names (de-minaur, davidovich-fokina) while
 * Sackmann/charting CSVs use short names (minaur, fokina).
 *
 * This UPDATE normalizes both te_slug (player rows) and opponent_slug
 * (cross-references) so that getPlayerPatterns sees all historical data
 * for each player in a single query.
 *
 * Canonical slug decisions (more total rows → canonical):
 *   minaur          (269) ← de-minaur   (101)
 *   fokina          (156) ← davidovich-fokina (87)
 *   ugo-carabelli   (68)  ← carabelli   (19)
 */

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";

// alias → canonical
export const SLUG_MERGES: Record<string, string> = {
  "de-minaur":          "minaur",
  "davidovich-fokina":  "fokina",
  "carabelli":          "ugo-carabelli",
};

export async function GET() {
  return NextResponse.json({
    description: "POST to normalize split slugs in player_match_stats",
    merges: SLUG_MERGES,
  });
}

export async function POST() {
  const db = getDb();
  const results: Array<{ alias: string; canonical: string; teSlugRows: number; oppSlugRows: number }> = [];

  // Each merge is independent; run in a single transaction for speed
  const normalize = db.transaction(() => {
    for (const [alias, canonical] of Object.entries(SLUG_MERGES)) {
      // 1. Rename te_slug rows (player's own match history)
      const r1 = db.prepare(
        "UPDATE player_match_stats SET te_slug = ? WHERE te_slug = ?"
      ).run(canonical, alias);

      // 2. Rename opponent_slug cross-references
      const r2 = db.prepare(
        "UPDATE player_match_stats SET opponent_slug = ? WHERE opponent_slug = ?"
      ).run(canonical, alias);

      // 3. Merge players table entry if alias exists
      // Keep canonical row; delete alias row (data is now under canonical slug)
      const hasCanonical = db.prepare(
        "SELECT 1 FROM players WHERE te_slug = ?"
      ).get(canonical);

      if (!hasCanonical) {
        // No canonical row yet → rename the alias row
        db.prepare("UPDATE players SET te_slug = ? WHERE te_slug = ?")
          .run(canonical, alias);
      } else {
        // Canonical row exists → just delete the now-empty alias row
        db.prepare("DELETE FROM players WHERE te_slug = ?").run(alias);
      }

      results.push({ alias, canonical, teSlugRows: r1.changes, oppSlugRows: r2.changes });
    }
  });

  normalize();

  // Invalidate all patterns so they recompute with merged data
  const patternsDeleted = db.prepare("DELETE FROM player_patterns").run().changes;

  const totalRows = results.reduce((s, r) => s + r.teSlugRows + r.oppSlugRows, 0);

  return NextResponse.json({
    ok: true,
    merges: results,
    totalRowsUpdated: totalRows,
    patternsInvalidated: patternsDeleted,
    message: `Merged ${results.length} slug aliases. ${totalRows} rows updated. ${patternsDeleted} patterns invalidated.`,
  });
}
