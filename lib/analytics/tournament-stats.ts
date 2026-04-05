/**
 * lib/analytics/tournament-stats.ts
 *
 * Agrega estadísticas de una edición de torneo a partir de match_insights.
 * Detecta el comportamiento real de la pista: velocidad inferida desde patrones
 * de partido (3 sets = muchos breaks = pista lenta), estilos que rinden mejor, etc.
 *
 * La tabla tournament_edition_stats almacena estas métricas con clave (tourney_name, year).
 * Se actualiza en el daily-sync tras generar los insights del día.
 */

import { getDb } from "../db/client";
import type { MatchInsightData, MatchPattern } from "./match-patterns";

// ── Tipos ──────────────────────────────────────────────────

export interface TournamentEditionStats {
  tourneyName: string;
  year: number;
  tourneySlug: string;
  surface: string | null;
  matchesAnalyzed: number;
  updatedAt: number;

  // Patrones de partido
  threeSetRate: number | null;       // % partidos a 3 sets
  tiebreakRate: number | null;       // % partidos con tiebreak
  comebackRate: number | null;       // % remontadas (ganó el que perdió 1er set)
  closeSetRate: number | null;       // % sets con margen ≤ 2
  dominantSetRate: number | null;    // % sets con margen ≥ 4
  bagelRate: number | null;          // % partidos con 6-0 en algún set

  // Distribución de patrones
  patternCounts: Partial<Record<MatchPattern, number>>;

  // Estilos de jugadores: cuántas victorias tuvo cada estilo este torneo
  styleWins: Record<string, number>;

  // Interpretación del comportamiento de la pista este año
  surfaceReading: string;

  // Frases de análisis listas para usar en predicciones
  narrativeLines: string[];
}

// ── Helpers ────────────────────────────────────────────────

export function slugifyTourney(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function pct(num: number, den: number): number | null {
  if (den < 3) return null;
  return Math.round((num / den) * 100) / 100;
}

// ── Lógica de agregación ───────────────────────────────────

export async function aggregateTournamentEditionStats(
  tourneyName: string,
  year: number,
): Promise<TournamentEditionStats> {
  const db = getDb();

  // Traer todos los match_insights de este torneo y año
  const result = await db.execute({
    sql: `
      SELECT mi.surface, mi.score, mi.match_pattern, mi.insights_json,
             mi.winner_slug, mi.loser_slug
      FROM match_insights mi
      WHERE mi.tournament = ?
        AND strftime('%Y', mi.match_date) = ?
        AND mi.insights_json IS NOT NULL
    `,
    args: [tourneyName, String(year)],
  });

  const rows = result.rows as unknown as Array<{
    surface: string | null;
    score: string | null;
    match_pattern: string | null;
    insights_json: string;
    winner_slug: string;
    loser_slug: string;
  }>;

  // Traer estilos de jugadores (player_patterns o player_match_stats)
  // Usamos opponent_style de player_match_stats si existe
  const stylesResult = await db.execute({
    sql: `
      SELECT pms.te_slug, pms.opponent_style, pms.result
      FROM player_match_stats pms
      WHERE pms.tournament = ?
        AND strftime('%Y', pms.match_date) = ?
        AND pms.opponent_style IS NOT NULL
        AND pms.result = 'W'
    `,
    args: [tourneyName, String(year)],
  });
  const styleRows = stylesResult.rows as unknown as Array<{
    te_slug: string;
    opponent_style: string;
    result: string;
  }>;

  // También traer el estilo del propio jugador (via player_patterns si tiene surface)
  const surface = rows[0]?.surface ?? null;
  const slugsInTourney = [...new Set(rows.flatMap((r) => [r.winner_slug, r.loser_slug]))];
  let winnerStyleMap: Record<string, string> = {};

  if (slugsInTourney.length > 0) {
    const placeholders = slugsInTourney.map(() => "?").join(",");
    const ppResult = await db.execute({
      sql: `SELECT te_slug, patterns_json FROM player_patterns WHERE te_slug IN (${placeholders}) AND surface = ?`,
      args: [...slugsInTourney, surface ?? ""],
    });
    for (const row of ppResult.rows as unknown as Array<{ te_slug: string; patterns_json: string | null }>) {
      if (row.patterns_json) {
        try {
          const pp = JSON.parse(row.patterns_json) as { style?: string };
          if (pp.style) winnerStyleMap[row.te_slug] = pp.style;
        } catch { /* ignore */ }
      }
    }
  }

  // Contadores
  let threeSet = 0;
  let tbMatches = 0;
  let comebacks = 0;
  let totalSets = 0;
  let closeSets = 0;
  let dominantSets = 0;
  let bagelMatches = 0;
  const patternCounts: Partial<Record<MatchPattern, number>> = {};
  const styleWins: Record<string, number> = {};
  const matchCount = rows.length;

  for (const row of rows) {
    let insight: MatchInsightData;
    try {
      insight = JSON.parse(row.insights_json) as MatchInsightData;
    } catch {
      continue;
    }

    if (insight.setsCount === 3) threeSet++;
    if (insight.hadTiebreak) tbMatches++;
    if (insight.winnerCameFromSetDown) comebacks++;
    if (insight.bagel) bagelMatches++;

    for (const s of insight.sets) {
      totalSets++;
      const margin = Math.abs(s.winner - s.loser);
      if (margin <= 2 || s.tiebreak !== null) closeSets++;
      if (margin >= 4) dominantSets++;
    }

    const pat = (row.match_pattern ?? "unknown") as MatchPattern;
    patternCounts[pat] = (patternCounts[pat] ?? 0) + 1;

    // Estilo del ganador
    const winStyle = winnerStyleMap[row.winner_slug];
    if (winStyle) {
      styleWins[winStyle] = (styleWins[winStyle] ?? 0) + 1;
    }
  }

  // También contar victorias desde opponent_style (cuando el ganador era el "opponent" del perdedor)
  for (const sr of styleRows) {
    // sr.opponent_style es el estilo del oponente (perdedor). Lo que nos interesa es el estilo del ganador.
    // Si result='W', te_slug ganó → su oponente tiene opponent_style. No nos sirve directamente.
    // Esto da el estilo del perdedor. Saltamos esta fuente para styleWins.
    void sr;
  }

  // Ratios
  const threeSetRate = pct(threeSet, matchCount);
  const tiebreakRate = pct(tbMatches, matchCount);
  const comebackRate = pct(comebacks, matchCount);
  const closeSetRate = totalSets >= 3 ? pct(closeSets, totalSets) : null;
  const dominantSetRate = totalSets >= 3 ? pct(dominantSets, totalSets) : null;
  const bagelRate = pct(bagelMatches, matchCount);

  // ── Interpretación de la pista ────────────────────────────
  let surfaceReading = "Datos insuficientes para caracterizar la pista este año.";
  if (matchCount >= 3) {
    const t3 = threeSetRate ?? 0;
    const tb = tiebreakRate ?? 0;
    const cl = closeSetRate ?? 0;

    if (t3 >= 0.55 && tb < 0.25) {
      surfaceReading =
        "Pista muy lenta esta edición: más de la mitad de los partidos van a 3 sets y los tiebreaks escasean — los breaks son frecuentes y el saque no domina.";
    } else if (t3 >= 0.4 && tb < 0.35) {
      surfaceReading =
        "Pista lenta: los partidos tienden a prolongarse, los especialistas de fondo tienen ventaja clara sobre los sacadores.";
    } else if (tb >= 0.45 && t3 < 0.3) {
      surfaceReading =
        "Pista rápida esta edición: los saques dominan, los tiebreaks son habituales y pocos partidos llegan al tercer set.";
    } else if (tb >= 0.35 && t3 < 0.4) {
      surfaceReading =
        "Pista de velocidad media-rápida: equilibrio entre el saque y el resto, con tiebreaks frecuentes.";
    } else if (cl >= 0.6) {
      surfaceReading =
        "Pista de desgaste: los sets son muy igualados esta edición, los partidos se deciden en los detalles.";
    } else {
      surfaceReading =
        "Comportamiento estándar de la pista — sin señales claras de que favorezca especialmente ni al servicio ni al resto.";
    }
  }

  // ── Frases narrativas ─────────────────────────────────────
  const narrativeLines: string[] = [];

  if (matchCount >= 3) {
    const t3pct = threeSetRate != null ? Math.round(threeSetRate * 100) : null;
    const tbpct = tiebreakRate != null ? Math.round(tiebreakRate * 100) : null;

    if (t3pct != null && t3pct >= 50) {
      narrativeLines.push(
        `El ${t3pct}% de los partidos jugados aquí esta edición han ido a 3 sets — la pista no perdona y las remontadas son posibles.`
      );
    }
    if (tbpct != null && tbpct >= 40) {
      narrativeLines.push(
        `Los tiebreaks han aparecido en el ${tbpct}% de los partidos — los sacadores están teniendo buenos momentos esta semana.`
      );
    }
    if (comebackRate != null && comebackRate >= 0.3) {
      const cpct = Math.round(comebackRate * 100);
      narrativeLines.push(
        `Un ${cpct}% de remontadas desde set abajo esta semana — la pista no mata los partidos en el primer set.`
      );
    }

    // Estilo dominante
    const topStyle = Object.entries(styleWins).sort((a, b) => b[1] - a[1])[0];
    if (topStyle && topStyle[1] >= 2) {
      const styleLabels: Record<string, string> = {
        "big-server": "sacadores dominantes",
        "aggressive-baseliner": "fondistas agresivos",
        "all-court": "jugadores de todo terreno",
        "counter-puncher": "defensores/contrapunchistas",
        "baseliner": "fondistas de base",
      };
      const label = styleLabels[topStyle[0]] ?? topStyle[0];
      narrativeLines.push(
        `Los ${label} acumulan ${topStyle[1]} victorias esta edición — son el perfil que mejor está rindiendo en este torneo.`
      );
    }

    if (bagelRate != null && bagelRate >= 0.2) {
      const bpct = Math.round(bagelRate * 100);
      narrativeLines.push(
        `Hay 6-0 en el ${bpct}% de los partidos — algunos encuentros están siendo muy dominantes.`
      );
    }
  }

  const tourneySlug = slugifyTourney(tourneyName);

  return {
    tourneyName,
    year,
    tourneySlug,
    surface,
    matchesAnalyzed: matchCount,
    updatedAt: Math.floor(Date.now() / 1000),
    threeSetRate,
    tiebreakRate,
    comebackRate,
    closeSetRate,
    dominantSetRate,
    bagelRate,
    patternCounts,
    styleWins,
    surfaceReading,
    narrativeLines,
  };
}

// ── Persistencia ──────────────────────────────────────────

export async function saveTournamentEditionStats(stats: TournamentEditionStats): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `
      INSERT INTO tournament_edition_stats
        (tourney_name, year, tourney_slug, surface, matches_analyzed,
         three_set_rate, tiebreak_rate, comeback_rate, close_set_rate,
         dominant_set_rate, bagel_rate, pattern_json, style_wins_json,
         surface_reading, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
      ON CONFLICT(tourney_name, year) DO UPDATE SET
        matches_analyzed  = excluded.matches_analyzed,
        three_set_rate    = excluded.three_set_rate,
        tiebreak_rate     = excluded.tiebreak_rate,
        comeback_rate     = excluded.comeback_rate,
        close_set_rate    = excluded.close_set_rate,
        dominant_set_rate = excluded.dominant_set_rate,
        bagel_rate        = excluded.bagel_rate,
        pattern_json      = excluded.pattern_json,
        style_wins_json   = excluded.style_wins_json,
        surface_reading   = excluded.surface_reading,
        updated_at        = excluded.updated_at
    `,
    args: [
      stats.tourneyName, stats.year, stats.tourneySlug, stats.surface,
      stats.matchesAnalyzed, stats.threeSetRate, stats.tiebreakRate,
      stats.comebackRate, stats.closeSetRate, stats.dominantSetRate,
      stats.bagelRate,
      JSON.stringify(stats.patternCounts),
      JSON.stringify(stats.styleWins),
      stats.surfaceReading,
    ],
  });
}

export async function getTournamentEditionStats(
  tourneySlug: string,
  year?: number,
): Promise<TournamentEditionStats | null> {
  const db = getDb();
  const targetYear = year ?? new Date().getFullYear();
  const result = await db.execute({
    sql: `SELECT * FROM tournament_edition_stats WHERE tourney_slug = ? AND year = ?`,
    args: [tourneySlug, targetYear],
  });
  const row = result.rows[0] as unknown as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToStats(row);
}

export async function getTournamentEditionStatsByName(
  tourneyName: string,
  year?: number,
): Promise<TournamentEditionStats | null> {
  const db = getDb();
  const targetYear = year ?? new Date().getFullYear();
  const result = await db.execute({
    sql: `SELECT * FROM tournament_edition_stats WHERE tourney_name = ? AND year = ?`,
    args: [tourneyName, targetYear],
  });
  const row = result.rows[0] as unknown as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToStats(row);
}

function rowToStats(row: Record<string, unknown>): TournamentEditionStats {
  let patternCounts: Partial<Record<MatchPattern, number>> = {};
  let styleWins: Record<string, number> = {};
  try { patternCounts = JSON.parse(row.pattern_json as string) as Partial<Record<MatchPattern, number>>; } catch { /* empty */ }
  try { styleWins = JSON.parse(row.style_wins_json as string) as Record<string, number>; } catch { /* empty */ }

  const stats: TournamentEditionStats = {
    tourneyName: row.tourney_name as string,
    year: row.year as number,
    tourneySlug: row.tourney_slug as string,
    surface: row.surface as string | null,
    matchesAnalyzed: row.matches_analyzed as number,
    updatedAt: row.updated_at as number,
    threeSetRate: row.three_set_rate as number | null,
    tiebreakRate: row.tiebreak_rate as number | null,
    comebackRate: row.comeback_rate as number | null,
    closeSetRate: row.close_set_rate as number | null,
    dominantSetRate: row.dominant_set_rate as number | null,
    bagelRate: row.bagel_rate as number | null,
    patternCounts,
    styleWins,
    surfaceReading: row.surface_reading as string ?? "",
    narrativeLines: [],
  };

  // Regenerar narrativeLines desde los datos persistidos
  if (stats.matchesAnalyzed >= 3) {
    if (stats.threeSetRate != null && stats.threeSetRate >= 0.5) {
      stats.narrativeLines.push(
        `El ${Math.round(stats.threeSetRate * 100)}% de los partidos han ido a 3 sets esta edición.`
      );
    }
    if (stats.tiebreakRate != null && stats.tiebreakRate >= 0.4) {
      stats.narrativeLines.push(
        `Los tiebreaks han aparecido en el ${Math.round(stats.tiebreakRate * 100)}% de los partidos.`
      );
    }
    if (stats.comebackRate != null && stats.comebackRate >= 0.3) {
      stats.narrativeLines.push(
        `Un ${Math.round(stats.comebackRate * 100)}% de remontadas desde set abajo.`
      );
    }
    const topStyle = Object.entries(styleWins).sort((a, b) => b[1] - a[1])[0];
    if (topStyle && topStyle[1] >= 2) {
      const styleLabels: Record<string, string> = {
        "big-server": "sacadores dominantes",
        "aggressive-baseliner": "fondistas agresivos",
        "all-court": "jugadores de todo terreno",
        "counter-puncher": "defensores/contrapunchistas",
        "baseliner": "fondistas de base",
      };
      stats.narrativeLines.push(
        `Los ${styleLabels[topStyle[0]] ?? topStyle[0]} acumulan ${topStyle[1]} victorias esta edición.`
      );
    }
  }

  return stats;
}

// ── Función de refresco ───────────────────────────────────

export async function refreshTournamentStats(
  tourneyName: string,
  year?: number,
): Promise<TournamentEditionStats> {
  const targetYear = year ?? new Date().getFullYear();
  const stats = await aggregateTournamentEditionStats(tourneyName, targetYear);
  // Guardar siempre — incluso con 0 partidos, para registrar el slug en la tabla
  await saveTournamentEditionStats(stats);
  return stats;
}

/**
 * Inicializa una edición de torneo con datos mínimos (sin sobrescribir si ya existe).
 * Se llama al inicio del torneo, cuando aún no hay partidos terminados.
 */
export async function initTournamentEdition(
  tourneyName: string,
  surface: string | null,
  year?: number,
): Promise<void> {
  const db = getDb();
  const targetYear = year ?? new Date().getFullYear();
  const slug = slugifyTourney(tourneyName);
  // INSERT OR IGNORE — no sobreescribir si ya tiene datos
  await db.execute({
    sql: `
      INSERT OR IGNORE INTO tournament_edition_stats
        (tourney_name, year, tourney_slug, surface, matches_analyzed,
         pattern_json, style_wins_json, surface_reading, updated_at)
      VALUES (?, ?, ?, ?, 0, '{}', '{}', '', unixepoch())
    `,
    args: [tourneyName, targetYear, slug, surface],
  });
}
