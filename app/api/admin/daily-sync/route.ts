/**
 * POST /api/admin/daily-sync
 *
 * Pipeline diario completo de retroalimentación.
 */

// Ampliar timeout de Vercel a 300s (máximo en plan Pro).
// Sin esto Vercel corta la función a los 10s y devuelve 504.
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { scrapeTeDay } from "@/lib/ingest/te-history";
import { ATP_SLUG_MAP } from "@/lib/analytics/player-resolver";
import { recomputeCalibration, getLearningStats } from "@/lib/learning/feedback";
import { backfillOpponentStyles, reclassifyAllStyles } from "@/lib/learning/style-classifier";
import { getPlayerPatterns, resetPatterns } from "@/lib/analytics/patterns";
import { analyzeMatch } from "@/lib/analytics/match-patterns";

// ── ATP_RANK (top-100 atpCode → rank) ─────────────────────
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

async function enrichNewRanks(): Promise<number> {
  const db = getDb();
  const slugRankMap = buildSlugRankMap();
  const atpSlugSet = new Set(Object.keys(ATP_SLUG_MAP));

  let total = 0;

  const tx = await db.transaction("write");
  const getStillNull = async () => {
    const r = await tx.execute(
      "SELECT DISTINCT opponent_slug FROM player_match_stats WHERE source='te_history' AND opponent_rank IS NULL AND opponent_slug IS NOT NULL"
    );
    return (r.rows as unknown as { opponent_slug: string }[]).map((row) => row.opponent_slug);
  };

  try {
    // Pass 1: top-100
    for (const slug of await getStillNull()) {
      const rank = slugRankMap.get(slug);
      if (rank) {
        const r = await tx.execute({
          sql: "UPDATE player_match_stats SET opponent_rank = ? WHERE source='te_history' AND opponent_slug = ? AND opponent_rank IS NULL",
          args: [rank, slug],
        });
        total += r.rowsAffected;
      }
    }
    // Pass 2: sackmann
    for (const slug of await getStillNull()) {
      const r = await tx.execute({
        sql: "SELECT opponent_rank FROM player_match_stats WHERE source='sackmann_csv' AND opponent_slug = ? AND opponent_rank IS NOT NULL ORDER BY match_date DESC LIMIT 1",
        args: [slug],
      });
      const row = r.rows[0] as unknown as { opponent_rank: number } | undefined;
      if (row) {
        const upd = await tx.execute({
          sql: "UPDATE player_match_stats SET opponent_rank = ? WHERE source='te_history' AND opponent_slug = ? AND opponent_rank IS NULL",
          args: [row.opponent_rank, slug],
        });
        total += upd.rowsAffected;
      }
    }
    // Pass 3: peer inference ≥3
    for (const slug of await getStillNull()) {
      const r = await tx.execute({
        sql: "SELECT opponent_rank FROM player_match_stats WHERE te_slug = ? AND opponent_rank IS NOT NULL ORDER BY match_date DESC LIMIT 30",
        args: [slug],
      });
      const rows = r.rows as unknown as { opponent_rank: number }[];
      if (rows.length >= 3) {
        const sorted = rows.map((row) => row.opponent_rank).sort((a, b) => a - b);
        const upd = await tx.execute({
          sql: "UPDATE player_match_stats SET opponent_rank = ? WHERE source='te_history' AND opponent_slug = ? AND opponent_rank IS NULL",
          args: [median(sorted), slug],
        });
        total += upd.rowsAffected;
      }
    }
    // Pass 4: ATP map default 150
    for (const slug of await getStillNull()) {
      if (atpSlugSet.has(slug)) {
        const upd = await tx.execute({
          sql: "UPDATE player_match_stats SET opponent_rank = ? WHERE source='te_history' AND opponent_slug = ? AND opponent_rank IS NULL",
          args: [150, slug],
        });
        total += upd.rowsAffected;
      }
    }
    // Pass 5: peer inference ≥1
    for (const slug of await getStillNull()) {
      const r = await tx.execute({
        sql: "SELECT opponent_rank FROM player_match_stats WHERE te_slug = ? AND opponent_rank IS NOT NULL ORDER BY match_date DESC LIMIT 30",
        args: [slug],
      });
      const rows = r.rows as unknown as { opponent_rank: number }[];
      if (rows.length >= 1) {
        const sorted = rows.map((row) => row.opponent_rank).sort((a, b) => a - b);
        const upd = await tx.execute({
          sql: "UPDATE player_match_stats SET opponent_rank = ? WHERE source='te_history' AND opponent_slug = ? AND opponent_rank IS NULL",
          args: [median(sorted), slug],
        });
        total += upd.rowsAffected;
      }
    }
    // Pass 6: universal default 250
    const upd6 = await tx.execute(
      "UPDATE player_match_stats SET opponent_rank = 250 WHERE source='te_history' AND opponent_rank IS NULL AND opponent_slug IS NOT NULL"
    );
    total += upd6.rowsAffected;

    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  } finally {
    tx.close();
  }

  return total;
}

async function normalizeNewSlugs(): Promise<number> {
  const db = getDb();
  const SLUG_MERGES: Record<string, string> = {
    "de-minaur":         "minaur",
    "davidovich-fokina": "fokina",
    "carabelli":         "ugo-carabelli",
  };
  let updated = 0;

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
      updated += r1.rowsAffected + r2.rowsAffected;
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

async function resolveByDateSlug(date: string): Promise<number> {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  const pendingResult = await db.execute({
    sql: `
      SELECT id, player1_slug, player2_slug, predicted_p1_pct
      FROM prediction_log
      WHERE match_date = ? AND resolved_at IS NULL
    `,
    args: [date],
  });
  const pending = pendingResult.rows as unknown as Array<{
    id: number;
    player1_slug: string;
    player2_slug: string;
    predicted_p1_pct: number;
  }>;

  if (pending.length === 0) return 0;

  let resolved = 0;
  const tx = await db.transaction("write");
  try {
    for (const pred of pending) {
      const winnerResult = await tx.execute({
        sql: `
          SELECT te_slug
          FROM player_match_stats
          WHERE match_date = ?
            AND source = 'te_history'
            AND result = 'W'
            AND (te_slug = ? OR te_slug = ?)
            AND (opponent_slug = ? OR opponent_slug = ?)
          LIMIT 1
        `,
        args: [date, pred.player1_slug, pred.player2_slug, pred.player1_slug, pred.player2_slug],
      });
      const row = winnerResult.rows[0] as unknown as { te_slug: string } | undefined;
      if (!row) continue;

      const actualWinner = row.te_slug === pred.player1_slug ? "p1" : "p2";
      const actualBinary = actualWinner === "p1" ? 1.0 : 0.0;
      const error = Math.abs(pred.predicted_p1_pct / 100 - actualBinary);

      await tx.execute({
        sql: "UPDATE prediction_log SET actual_winner = ?, prediction_error = ?, resolved_at = ? WHERE id = ?",
        args: [actualWinner, error, now, pred.id],
      });
      resolved++;
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  } finally {
    tx.close();
  }

  return resolved;
}

async function getAffectedSlugs(date: string): Promise<string[]> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT DISTINCT te_slug FROM player_match_stats WHERE match_date = ? AND source = 'te_history'",
    args: [date],
  });
  return (result.rows as unknown as { te_slug: string }[]).map((r) => r.te_slug);
}

/**
 * Genera insights post-partido para todos los partidos del día que aún no los tienen.
 * Usa el score de player_match_stats (fuente te_history) para detectar patrones:
 * remontadas, tiebreaks decisivos, bagels, oportunidades desperdiciadas, etc.
 * Los partidos scrapeados en vivo con stats completas ya los generan en te-scraper.ts.
 */
async function generateDayInsights(date: string): Promise<{ generated: number; skipped: number }> {
  const db = getDb();

  // Buscar partidos del día con score que aún no tienen insight
  const matchesResult = await db.execute({
    sql: `
      SELECT DISTINCT
        pms.te_match_id,
        pms.tournament,
        pms.surface,
        pms.score,
        win.te_slug  AS winner_slug,
        los.te_slug  AS loser_slug
      FROM player_match_stats pms
      JOIN player_match_stats win ON win.te_match_id = pms.te_match_id AND win.result = 'W'
      JOIN player_match_stats los ON los.te_match_id = pms.te_match_id AND los.result = 'L'
      LEFT JOIN match_insights mi ON mi.te_match_id = pms.te_match_id
      WHERE pms.match_date = ?
        AND pms.source = 'te_history'
        AND pms.score IS NOT NULL
        AND mi.te_match_id IS NULL
    `,
    args: [date],
  });

  const rows = matchesResult.rows as unknown as Array<{
    te_match_id: string;
    tournament: string | null;
    surface: string | null;
    score: string;
    winner_slug: string;
    loser_slug: string;
  }>;

  let generated = 0;
  let skipped = 0;

  for (const row of rows) {
    try {
      // Sin stats de servicio desde te_history — las columnas son null
      const emptyStats = {
        aces: null, doubleFaults: null, firstServePct: null,
        firstServeWonPct: null, secondServeWonPct: null,
        bpSaved: null, bpFaced: null, bpConverted: null, bpOpportunities: null,
        winners: null, unforcedErrors: null,
      };

      // Intentar recuperar stats reales si existen (de te_scrape)
      const statsResult = await db.execute({
        sql: `SELECT aces, double_faults, bp_saved, bp_faced, bp_converted, bp_opportunities, winners, unforced_errors, result
              FROM player_match_stats WHERE te_match_id = ? ORDER BY result ASC`,
        args: [row.te_match_id],
      });
      const statsRows = statsResult.rows as unknown as Array<{
        result: string; aces: number|null; double_faults: number|null;
        bp_saved: number|null; bp_faced: number|null;
        bp_converted: number|null; bp_opportunities: number|null;
        winners: number|null; unforced_errors: number|null;
      }>;

      const winRow = statsRows.find((r) => r.result === "W");
      const losRow = statsRows.find((r) => r.result === "L");

      const winnerStats = winRow ? {
        aces: winRow.aces, doubleFaults: winRow.double_faults,
        firstServePct: null, firstServeWonPct: null, secondServeWonPct: null,
        bpSaved: winRow.bp_saved, bpFaced: winRow.bp_faced,
        bpConverted: winRow.bp_converted, bpOpportunities: winRow.bp_opportunities,
        winners: winRow.winners, unforcedErrors: winRow.unforced_errors,
      } : emptyStats;

      const loserStats = losRow ? {
        aces: losRow.aces, doubleFaults: losRow.double_faults,
        firstServePct: null, firstServeWonPct: null, secondServeWonPct: null,
        bpSaved: losRow.bp_saved, bpFaced: losRow.bp_faced,
        bpConverted: losRow.bp_converted, bpOpportunities: losRow.bp_opportunities,
        winners: losRow.winners, unforcedErrors: losRow.unforced_errors,
      } : emptyStats;

      const insight = analyzeMatch(row.score, winnerStats, loserStats);

      await db.execute({
        sql: `
          INSERT INTO match_insights
            (te_match_id, match_date, winner_slug, loser_slug, tournament, surface, score,
             match_pattern, insights_json, enriched_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
          ON CONFLICT(te_match_id) DO UPDATE SET
            match_pattern = excluded.match_pattern,
            insights_json = excluded.insights_json,
            enriched_at   = excluded.enriched_at
        `,
        args: [
          row.te_match_id, date, row.winner_slug, row.loser_slug,
          row.tournament, row.surface, row.score,
          insight.pattern, JSON.stringify(insight),
        ],
      });
      generated++;
    } catch {
      skipped++;
    }
  }

  return { generated, skipped };
}

async function recomputePatternsForSlugs(slugs: string[]): Promise<{ recomputed: number; errors: number }> {
  let recomputed = 0;
  let errors = 0;
  for (const slug of slugs) {
    try {
      await resetPatterns(slug);
      await getPlayerPatterns(slug, "", 50);
      await getPlayerPatterns(slug, "", 30);
      recomputed++;
    } catch {
      errors++;
    }
  }
  return { recomputed, errors };
}

// ── GET: estado del sistema de aprendizaje ────────────────

export async function GET() {
  const stats = await getLearningStats();
  return NextResponse.json({ ok: true, learningStats: stats });
}

// ── POST: ejecutar pipeline diario ────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { date?: string; dryRun?: boolean };

  const targetDate = body.date ?? (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  const [year, month, day] = targetDate.split("-").map(Number);
  const dryRun = body.dryRun ?? false;

  const result: Record<string, unknown> = { date: targetDate, dryRun };

  if (dryRun) {
    const stats = await getLearningStats();
    return NextResponse.json({ ok: true, dryRun: true, learningStats: stats });
  }

  // ── Paso 1: Ingestar partidos del día ────────────────────
  // Scrapeamos solo el día concreto (no el mes completo) para cumplir maxDuration=300s.
  // scrapeTeDay hace 1 request + inserts en lugar de ~30 requests.
  console.log(`[daily-sync] Ingesting ${targetDate}…`);
  try {
    const ingestResult = await scrapeTeDay(year, month, day);
    result.ingest = {
      matches: ingestResult.matches,
      inserted: ingestResult.inserted,
      dupes: ingestResult.dupes,
    };
  } catch (err) {
    result.ingest = { error: (err as Error).message };
  }

  // ── Paso 2: Normalizar slugs ─────────────────────────────
  const normalizeUpdated = await normalizeNewSlugs();
  result.normalize = { rowsUpdated: normalizeUpdated };

  // ── Paso 3: Enriquecer opponent_rank ────────────────────
  const rankRows = await enrichNewRanks();
  result.enrichRanks = { rowsUpdated: rankRows };

  // ── Paso 4: Backfill + reclasificación de estilos ────────
  const styleRows = await backfillOpponentStyles();
  const styleClassified = await reclassifyAllStyles();
  result.backfillStyles = { rowsUpdated: styleRows, reclassified: styleClassified.length };

  // ── Paso 5: Generar insights post-partido ────────────────
  // Analiza el score de cada partido para detectar patrones: remontadas,
  // tiebreaks decisivos, oportunidades desperdiciadas, dominancia, etc.
  console.log(`[daily-sync] Generating match insights for ${targetDate}…`);
  try {
    const insightResult = await generateDayInsights(targetDate);
    result.matchInsights = insightResult;
  } catch (err) {
    result.matchInsights = { error: (err as Error).message };
  }

  // ── Paso 6: Resolver predicciones del día ────────────────
  const resolvedPreds = await resolveByDateSlug(targetDate);
  result.resolvedPredictions = { count: resolvedPreds };

  // ── Paso 6: Recalibrar factores ──────────────────────────
  const calibration = await recomputeCalibration();
  result.calibration = Object.fromEntries(
    Object.entries(calibration).map(([id, c]) => [id, {
      samples: c.sample_count,
      accuracy: Math.round(c.avg_accuracy * 100) + "%",
      weightMult: c.weight_mult.toFixed(3),
    }])
  );

  // ── Paso 7: Recomputar patrones de jugadores afectados ───
  const affectedSlugs = await getAffectedSlugs(targetDate);
  const patternResult = await recomputePatternsForSlugs(affectedSlugs);
  result.patternsRecomputed = {
    players: affectedSlugs.length,
    recomputed: patternResult.recomputed,
    errors: patternResult.errors,
    slugs: affectedSlugs,
  };

  // ── Resumen ───────────────────────────────────────────────
  const stats = await getLearningStats();
  result.learningStats = {
    totalPredictions: stats.totalPredictions,
    resolved: stats.resolved,
    pending: stats.pending,
    accuracy: stats.accuracy != null ? Math.round(stats.accuracy * 100) + "%" : null,
  };

  console.log("[daily-sync] Done:", JSON.stringify(result, null, 2));
  return NextResponse.json({ ok: true, ...result });
}
