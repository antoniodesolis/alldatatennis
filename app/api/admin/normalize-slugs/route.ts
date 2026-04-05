/**
 * POST /api/admin/normalize-slugs
 *
 * Merges split-slug data into canonical slugs.
 */

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";

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

  const tx = await db.transaction("write");
  try {
    for (const [alias, canonical] of Object.entries(SLUG_MERGES)) {
      const r1 = await tx.execute({
        sql: "UPDATE player_match_stats SET te_slug = ? WHERE te_slug = ?",
        args: [canonical, alias],
      });
      const r2 = await tx.execute({
        sql: "UPDATE player_match_stats SET opponent_slug = ? WHERE opponent_slug = ?",
        args: [canonical, alias],
      });

      const hasCanonicalResult = await tx.execute({
        sql: "SELECT 1 FROM players WHERE te_slug = ?",
        args: [canonical],
      });

      if (hasCanonicalResult.rows.length === 0) {
        await tx.execute({
          sql: "UPDATE players SET te_slug = ? WHERE te_slug = ?",
          args: [canonical, alias],
        });
      } else {
        await tx.execute({
          sql: "DELETE FROM players WHERE te_slug = ?",
          args: [alias],
        });
      }

      results.push({ alias, canonical, teSlugRows: r1.rowsAffected, oppSlugRows: r2.rowsAffected });
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  } finally {
    tx.close();
  }

  const patternsResult = await db.execute("DELETE FROM player_patterns");
  const patternsDeleted = patternsResult.rowsAffected;

  const totalRows = results.reduce((s, r) => s + r.teSlugRows + r.oppSlugRows, 0);

  return NextResponse.json({
    ok: true,
    merges: results,
    totalRowsUpdated: totalRows,
    patternsInvalidated: patternsDeleted,
    message: `Merged ${results.length} slug aliases. ${totalRows} rows updated. ${patternsDeleted} patterns invalidated.`,
  });
}
