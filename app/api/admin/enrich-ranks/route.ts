/**
 * POST /api/admin/enrich-ranks
 *
 * Enriches opponent_rank = NULL rows in te_history using 6 passes.
 */

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { ATP_SLUG_MAP } from "@/lib/analytics/player-resolver";

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

function buildSlugRankMap(): Map<string, number> {
  const map = new Map<string, number>();
  for (const [slug, code] of Object.entries(ATP_SLUG_MAP)) {
    const rank = ATP_RANK[code];
    if (rank !== undefined && !map.has(slug)) map.set(slug, rank);
  }
  return map;
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

export async function GET() {
  return NextResponse.json({
    description: "POST to enrich opponent_rank = NULL rows in te_history (6 passes)",
    passes: [
      "1. STATIC_TOP100 + ATP_SLUG_MAP → exact rank for top-100",
      "2. sackmann_csv → most recent historical rank",
      "3. Peer inference ≥3 matches",
      "4. ATP_SLUG_MAP default → rank 150",
      "5. Peer inference ≥1 match",
      "6. Universal default 250",
    ],
  });
}

export async function POST() {
  const db = getDb();
  const slugRankMap = buildSlugRankMap();
  const atpSlugSet = new Set(Object.keys(ATP_SLUG_MAP));

  const nullCountResult = await db.execute(
    "SELECT COUNT(*) as n FROM player_match_stats WHERE source='te_history' AND opponent_rank IS NULL AND opponent_slug IS NOT NULL"
  );
  const nullCount = (nullCountResult.rows[0] as unknown as { n: number }).n;

  if (nullCount === 0) {
    return NextResponse.json({ ok: true, updated: 0, message: "No rows to enrich" });
  }

  const getStillNull = async () => {
    const r = await db.execute(
      "SELECT DISTINCT opponent_slug FROM player_match_stats WHERE source='te_history' AND opponent_rank IS NULL AND opponent_slug IS NOT NULL"
    );
    return (r.rows as unknown as { opponent_slug: string }[]).map((row) => row.opponent_slug);
  };

  const updateRank = async (rank: number, slug: string) => {
    const r = await db.execute({
      sql: "UPDATE player_match_stats SET opponent_rank = ? WHERE source='te_history' AND opponent_slug = ? AND opponent_rank IS NULL",
      args: [rank, slug],
    });
    return r.rowsAffected;
  };

  let updatedPass1 = 0, updatedPass2 = 0, updatedPass3 = 0;
  let updatedPass4 = 0, updatedPass5 = 0, updatedPass6 = 0;

  // Pass 1: top-100
  for (const slug of await getStillNull()) {
    const rank = slugRankMap.get(slug);
    if (rank !== undefined) updatedPass1 += await updateRank(rank, slug);
  }

  // Pass 2: sackmann
  for (const slug of await getStillNull()) {
    const r = await db.execute({
      sql: "SELECT opponent_rank FROM player_match_stats WHERE source='sackmann_csv' AND opponent_slug = ? AND opponent_rank IS NOT NULL ORDER BY match_date DESC LIMIT 1",
      args: [slug],
    });
    const row = r.rows[0] as unknown as { opponent_rank: number } | undefined;
    if (row) updatedPass2 += await updateRank(row.opponent_rank, slug);
  }

  // Pass 3: peer inference ≥3
  for (const slug of await getStillNull()) {
    const r = await db.execute({
      sql: "SELECT opponent_rank FROM player_match_stats WHERE te_slug = ? AND opponent_rank IS NOT NULL ORDER BY match_date DESC LIMIT 30",
      args: [slug],
    });
    const rows = r.rows as unknown as { opponent_rank: number }[];
    if (rows.length < 3) continue;
    const sorted = rows.map((row) => row.opponent_rank).sort((a, b) => a - b);
    const estimatedRank = median(sorted);
    if (estimatedRank > 0) updatedPass3 += await updateRank(estimatedRank, slug);
  }

  // Pass 4: ATP default 150
  for (const slug of await getStillNull()) {
    if (atpSlugSet.has(slug)) updatedPass4 += await updateRank(150, slug);
  }

  // Pass 5: peer inference ≥1
  for (const slug of await getStillNull()) {
    const r = await db.execute({
      sql: "SELECT opponent_rank FROM player_match_stats WHERE te_slug = ? AND opponent_rank IS NOT NULL ORDER BY match_date DESC LIMIT 30",
      args: [slug],
    });
    const rows = r.rows as unknown as { opponent_rank: number }[];
    if (rows.length < 1) continue;
    const sorted = rows.map((row) => row.opponent_rank).sort((a, b) => a - b);
    const estimatedRank = median(sorted);
    if (estimatedRank > 0) updatedPass5 += await updateRank(estimatedRank, slug);
  }

  // Pass 6: universal default 250
  const pass6Result = await db.execute(
    "UPDATE player_match_stats SET opponent_rank = 250 WHERE source='te_history' AND opponent_rank IS NULL AND opponent_slug IS NOT NULL"
  );
  updatedPass6 = pass6Result.rowsAffected;

  const totalUpdated = updatedPass1 + updatedPass2 + updatedPass3 + updatedPass4 + updatedPass5 + updatedPass6;

  const finalNullResult = await db.execute(
    "SELECT COUNT(*) as n FROM player_match_stats WHERE source='te_history' AND opponent_rank IS NULL AND opponent_slug IS NOT NULL"
  );
  const finalNull = (finalNullResult.rows[0] as unknown as { n: number }).n;

  const patternsResult = await db.execute("DELETE FROM player_patterns");
  const patternsDeleted = patternsResult.rowsAffected;

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
    message: `Enriched ${totalUpdated}/${nullCount} rows. ${finalNull} remain unresolved. ${patternsDeleted} patterns invalidated.`,
  });
}
