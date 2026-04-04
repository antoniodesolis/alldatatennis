/**
 * POST /api/admin/enrich-ranks
 *
 * Enriches opponent_rank = NULL rows in te_history using 4 passes:
 *
 *  Pass 1 — STATIC_TOP100 + ATP_SLUG_MAP: exact rank for top-100 players
 *  Pass 2 — sackmann_csv: most-recent known rank from historical data (2023-2024)
 *  Pass 3 — Peer inference: for slugs that appear as te_slug in the DB,
 *            estimate their rank = ROUND(median opponent_rank from their own matches).
 *            Principle: ATP players face similar-ranked opponents → avg opponent rank ≈ own rank.
 *  Pass 4 — ATP_SLUG_MAP default: any slug in ATP_SLUG_MAP (= confirmed ATP circuit player)
 *            but outside top-100 and unresolved → assign rank 150 as conservative estimate.
 *
 * After enrichment, invalidates all player_patterns so they recompute with
 * the newly available opponent_rank data (opponentRankSplits, qualityWinRate).
 */

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { ATP_SLUG_MAP } from "@/lib/analytics/player-resolver";

// STATIC_TOP100 atpCode → rank map
const ATP_RANK: Record<string, number> = {
  "a0e2":1,  "s0ag":2,  "z355":3,  "d643":4,  "m0ej":5,  "dh58":6,  "ag37":7,
  "fb98":8,  "s0s1":9,  "mm58":10, "bk92":11, "rh16":12, "c0e9":13, "l0bv":14,
  "ke29":15, "re44":16, "dh50":17, "td51":18, "d0fj":19, "c0au":20, "pl56":21,
  "t0ha":22, "va25":23, "n771":24, "d0co":25, "m0ni":26, "rc91":27, "f0f1":28,
  "r0dg":29, "gj37":30, "ea24":31, "mw02":32, "n0ae":33, "hh26":34, "m0qi":35,
  "d0f6":36, "mu94":37, "su55":38, "te30":39, "f0fv":40, "b0cd":41, "k0ah":42,
  "me82":43, "a0gc":44, "p09z":45, "bu13":46, "m0ci":47, "bt72":48, "te51":49,
  "b0bi":50, "f724":51, "ae14":52, "mq75":53, "c977":54, "m0fh":55, "q02l":56,
  "m0gz":57, "ki95":58, "b0id":59, "n0bs":60, "h997":61, "v812":62, "su87":63,
  "o522":64, "c0jp":65, "gc88":66, "u182":67, "c0h0":68, "c0c8":69, "ki82":70,
  "r0eb":71, "hb71":72, "b0gg":73, "d923":74, "sl28":75, "s0h2":76, "b0fv":77,
  "o513":78, "s0ja":79, "bd06":80, "m0jf":81, "s0k7":82, "t0a1":83, "v832":84,
  "k0az":85, "m0jz":86, "c0df":87, "cd85":88, "j0dz":89, "hb64":90, "bk40":91,
  "b0pg":92, "d875":93, "mp20":94, "d994":95, "k0a3":96, "f0by":97, "w367":98,
  "d0c1":99, "gd64":100,
};

// Build te_slug → rank from ATP_SLUG_MAP + ATP_RANK
function buildSlugRankMap(): Map<string, number> {
  const map = new Map<string, number>();
  for (const [slug, code] of Object.entries(ATP_SLUG_MAP)) {
    const rank = ATP_RANK[code];
    if (rank !== undefined && !map.has(slug)) map.set(slug, rank);
  }
  return map;
}

/** Compute median of a sorted array */
function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

export async function GET() {
  return NextResponse.json({
    description: "POST to enrich opponent_rank = NULL rows in te_history (4 passes)",
    passes: [
      "1. STATIC_TOP100 + ATP_SLUG_MAP → exact rank for top-100",
      "2. sackmann_csv → most recent historical rank",
      "3. Peer inference → median opponent_rank from player's own matches",
      "4. ATP_SLUG_MAP default → rank 150 for confirmed ATP players not resolved",
    ],
  });
}

export async function POST() {
  const db = getDb();
  const slugRankMap = buildSlugRankMap();

  const nullCount = (db.prepare(
    "SELECT COUNT(*) as n FROM player_match_stats WHERE source='te_history' AND opponent_rank IS NULL AND opponent_slug IS NOT NULL"
  ).get() as { n: number }).n;

  if (nullCount === 0) {
    return NextResponse.json({ ok: true, updated: 0, message: "No rows to enrich" });
  }

  // Shared update statement (reused in every pass)
  const updateStmt = db.prepare(
    "UPDATE player_match_stats SET opponent_rank = ? WHERE source='te_history' AND opponent_slug = ? AND opponent_rank IS NULL"
  );

  const getStillNull = () =>
    (db.prepare(
      "SELECT DISTINCT opponent_slug FROM player_match_stats WHERE source='te_history' AND opponent_rank IS NULL AND opponent_slug IS NOT NULL"
    ).all() as { opponent_slug: string }[]).map((r) => r.opponent_slug);

  let updatedPass1 = 0;
  let updatedPass2 = 0;
  let updatedPass3 = 0;
  let updatedPass4 = 0;

  // ── Pass 1: STATIC_TOP100 via ATP_SLUG_MAP ────────────────
  const pass1 = db.transaction(() => {
    for (const slug of getStillNull()) {
      const rank = slugRankMap.get(slug);
      if (rank !== undefined) updatedPass1 += updateStmt.run(rank, slug).changes;
    }
  });
  pass1();

  // ── Pass 2: sackmann_csv historical rank ──────────────────
  const sackStmt = db.prepare(
    `SELECT opponent_rank FROM player_match_stats
     WHERE source='sackmann_csv' AND opponent_slug = ? AND opponent_rank IS NOT NULL
     ORDER BY match_date DESC LIMIT 1`
  );

  const pass2 = db.transaction(() => {
    for (const slug of getStillNull()) {
      const row = sackStmt.get(slug) as { opponent_rank: number } | undefined;
      if (row) updatedPass2 += updateStmt.run(row.opponent_rank, slug).changes;
    }
  });
  pass2();

  // ── Pass 3: Peer inference ────────────────────────────────
  // For each still-null opponent_slug that exists as te_slug in DB,
  // estimate their rank = median of their OWN opponents' ranks.
  // Rationale: ATP scheduling pairs similar-ranked players → avg opp_rank ≈ player rank.
  const peerRankStmt = db.prepare(
    `SELECT opponent_rank FROM player_match_stats
     WHERE te_slug = ? AND opponent_rank IS NOT NULL
     ORDER BY match_date DESC LIMIT 30`
  );

  const pass3 = db.transaction(() => {
    for (const slug of getStillNull()) {
      const rows = peerRankStmt.all(slug) as { opponent_rank: number }[];
      if (rows.length < 3) continue; // not enough data for reliable estimate
      const sorted = rows.map((r) => r.opponent_rank).sort((a, b) => a - b);
      const estimatedRank = median(sorted);
      if (estimatedRank > 0) {
        updatedPass3 += updateStmt.run(estimatedRank, slug).changes;
      }
    }
  });
  pass3();

  // ── Pass 4: ATP_SLUG_MAP confirmed players → default 150 ──
  // Any slug present in ATP_SLUG_MAP is a confirmed ATP circuit player.
  // If still unresolved after passes 1-3, assign rank 150 (conservative mid-range).
  const atpSlugSet = new Set(Object.keys(ATP_SLUG_MAP));

  const pass4 = db.transaction(() => {
    for (const slug of getStillNull()) {
      if (atpSlugSet.has(slug)) {
        updatedPass4 += updateStmt.run(150, slug).changes;
      }
    }
  });
  pass4();

  // ── Pass 5: Peer inference (low threshold, ≥1 match) ─────
  // Re-run peer inference with threshold = 1 to catch slugs with minimal data.
  let updatedPass5 = 0;
  const pass5 = db.transaction(() => {
    for (const slug of getStillNull()) {
      const rows = peerRankStmt.all(slug) as { opponent_rank: number }[];
      if (rows.length < 1) continue;
      const sorted = rows.map((r) => r.opponent_rank).sort((a, b) => a - b);
      const estimatedRank = median(sorted);
      if (estimatedRank > 0) {
        updatedPass5 += updateStmt.run(estimatedRank, slug).changes;
      }
    }
  });
  pass5();

  // ── Pass 6: Universal default for any remaining null ──────
  // These are qualifier/Challenger-level opponents not in any reference source.
  // They reached the ATP main draw but are ranked ~200-400.
  // Assign 250 as a conservative default to enable qualityWinRate computation.
  let updatedPass6 = 0;
  const pass6 = db.transaction(() => {
    const info = db.prepare(
      "UPDATE player_match_stats SET opponent_rank = 250 WHERE source='te_history' AND opponent_rank IS NULL AND opponent_slug IS NOT NULL"
    ).run();
    updatedPass6 = info.changes;
  });
  pass6();

  const totalUpdated = updatedPass1 + updatedPass2 + updatedPass3 + updatedPass4 + updatedPass5 + updatedPass6;
  const finalNull = (db.prepare(
    "SELECT COUNT(*) as n FROM player_match_stats WHERE source='te_history' AND opponent_rank IS NULL AND opponent_slug IS NOT NULL"
  ).get() as { n: number }).n;

  // ── Invalidate all cached patterns ────────────────────────
  const patternsDeleted = db.prepare("DELETE FROM player_patterns").run().changes;

  return NextResponse.json({
    ok: true,
    nullRows: nullCount,
    updatedPass1_top100: updatedPass1,
    updatedPass2_sackmann: updatedPass2,
    updatedPass3_peerInference: updatedPass3,
    updatedPass4_atpDefault150: updatedPass4,
    updatedPass5_peerLowThreshold: updatedPass5,
    updatedPass6_default250: updatedPass6,
    totalUpdated,
    stillNull: finalNull,
    coveragePct: `${((nullCount - finalNull) / nullCount * 100).toFixed(1)}%`,
    patternsInvalidated: patternsDeleted,
    message: `Enriched ${totalUpdated}/${nullCount} rows (${((nullCount - finalNull) / nullCount * 100).toFixed(1)}% coverage). ${finalNull} remain unresolved. ${patternsDeleted} patterns invalidated.`,
  });
}
