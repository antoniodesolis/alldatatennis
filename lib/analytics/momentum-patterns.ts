/**
 * lib/analytics/momentum-patterns.ts
 *
 * Detección de patrones de momentum intra-partido y entre partidos.
 * Analiza match_insights acumulados para construir un perfil psicológico/táctico
 * del jugador basado en cómo reacciona a situaciones de presión.
 *
 * Lo que podemos detectar con datos reales disponibles (score por sets):
 *
 * RESILIENCE: % victorias desde set abajo, tasa de 3er set ganado
 * CLOSING:    cuando va ganando 1-0 sets, ¿cierra sin complicaciones?
 * MOMENTUM:   variación de margen entre sets (¿sube o baja la intensidad?)
 * COLLAPSE:   partidos donde ganó un set dominante pero perdió el siguiente
 * TIEBREAKS:  rendimiento global en tiebreaks (tb_won/tb_played)
 * SET START:  tendencia a ganar el primer set (primer golpe de efecto)
 */

import { getDb } from "../db/client";
import type { MatchInsightData } from "./match-patterns";

// ── Tipos ─────────────────────────────────────────────────

export interface MomentumProfile {
  slug: string;
  matchesAnalyzed: number;
  computedAt: number;

  // ── Resiliencia ──────────────────────────────────────────
  /** Partidos jugados a 3 sets */
  threeSetMatches: number;
  /** Cuántos ganó desde set abajo (perdió el 1.°) */
  comebackWins: number;
  /** comebackWins / threeSetMatches (null si <3 partidos a 3 sets) */
  comebackRate: number | null;
  /** % de los 3er sets ganados cuando el partido llegó a 3 */
  decidingSetWinRate: number | null;

  // ── Cierre ───────────────────────────────────────────────
  /** Partidos donde ganó el set 1 */
  wonSet1: number;
  /** De los que ganó set 1, cuántos cerró en 2 (sin dar el 3.°) */
  closedFromSet1Lead: number;
  /** closedFromSet1Lead / wonSet1 */
  closingRate: number | null;

  // ── Colapso ──────────────────────────────────────────────
  /** Partidos donde el jugador ganó un set con margen ≥4 (6-2, 6-1, 6-0)
   *  pero luego perdió el siguiente set con margen ≥3 */
  dominantThenCollapse: number;
  /** dominantThenCollapse / partidos ≥2 sets */
  collapseAfterDominanceRate: number | null;

  // ── Tiebreaks ────────────────────────────────────────────
  tbMatchesPlayed: number;
  tbWon: number;
  tbWinRate: number | null;

  // ── Momentum entre sets ──────────────────────────────────
  /** Partidos donde el jugador perdió un set y ganó el siguiente (respuesta) */
  respondedAfterSetLoss: number;
  /** Partidos donde perdió un set */
  setLossOccurrences: number;
  /** respondedAfterSetLoss / setLossOccurrences */
  responseRate: number | null;

  // ── Varianza de sets ─────────────────────────────────────
  /** Margen medio de los sets ganados por el jugador (4 = gana 6-2) */
  avgWonSetMargin: number | null;
  /** Margen medio de los sets perdidos */
  avgLostSetMargin: number | null;
  /** Tendencia al partido cerrado (todos los sets ≤2 de diferencia) */
  grinderMatches: number;

  // ── Perfil mental sintético ──────────────────────────────
  /** "resilient" | "closer" | "volatile" | "grinder" | "fragile" | "balanced" */
  mentalProfile: string;

  /** Frases listas para incluir en la narrativa */
  narrativeLines: string[];
}

// ── Helpers ───────────────────────────────────────────────

function pct(num: number, den: number): number | null {
  if (den < 3) return null; // sin suficientes muestras
  return Math.round((num / den) * 100) / 100;
}

/** Desde la perspectiva del jugador (ganador o perdedor), extrae los márgenes
 *  de cada set. Positivo = el jugador ganó ese set, negativo = lo perdió. */
function setMarginsForPlayer(insight: MatchInsightData, isWinner: boolean): number[] {
  return insight.sets.map((s) => {
    const margin = s.winner - s.loser; // siempre positivo desde perspectiva del winner total
    return isWinner ? margin : -margin;
  });
}

// ── Función principal ─────────────────────────────────────

export async function computePlayerMomentumProfile(
  slug: string,
  n = 30,
): Promise<MomentumProfile> {
  const db = getDb();

  // Traer los últimos N insights donde el jugador participó
  const result = await db.execute({
    sql: `
      SELECT te_match_id, winner_slug, loser_slug, score, insights_json
      FROM match_insights
      WHERE (winner_slug = ? OR loser_slug = ?)
        AND score IS NOT NULL
        AND insights_json IS NOT NULL
      ORDER BY match_date DESC
      LIMIT ?
    `,
    args: [slug, slug, n],
  });

  const rows = result.rows as unknown as Array<{
    te_match_id: string;
    winner_slug: string;
    loser_slug: string;
    score: string;
    insights_json: string;
  }>;

  // Contadores
  let threeSetMatches = 0, comebackWins = 0, decidingSetWins = 0;
  let wonSet1 = 0, closedFromSet1Lead = 0;
  let dominantThenCollapse = 0, multiSetMatches = 0;
  let tbMatchesPlayed = 0, tbWon = 0;
  let respondedAfterSetLoss = 0, setLossOccurrences = 0;
  const wonSetMargins: number[] = [];
  const lostSetMargins: number[] = [];
  let grinderMatches = 0;

  for (const row of rows) {
    let insight: MatchInsightData;
    try {
      insight = JSON.parse(row.insights_json) as MatchInsightData;
    } catch {
      continue;
    }

    const isWinner = row.winner_slug === slug;
    const sets = insight.sets;
    if (sets.length === 0) continue;

    const margins = setMarginsForPlayer(insight, isWinner);

    // ── Resiliencia ──────────────────────────────────────────
    if (sets.length === 3) {
      threeSetMatches++;
      // "Desde set abajo": el jugador perdió el 1.° set
      if (margins[0] < 0) {
        if (isWinner) comebackWins++;
      }
      if (isWinner) decidingSetWins++;
    }

    // ── Cierre ───────────────────────────────────────────────
    // El jugador ganó el set 1
    if (margins[0] > 0) {
      wonSet1++;
      if (sets.length === 2 && isWinner) closedFromSet1Lead++; // cerró en 2
      // Si fue a 3 sets y el jugador ganó set 1 pero el partido duró 3 → no cerró
    }

    // ── Tiebreaks ────────────────────────────────────────────
    const hadTb = sets.some((s) => s.tiebreak !== null);
    if (hadTb) {
      tbMatchesPlayed++;
      // El jugador ganó los TBs en los sets que ganó
      const playerTbWins = sets.filter((s, i) => s.tiebreak !== null && margins[i] > 0).length;
      if (playerTbWins > 0) tbWon++;
    }

    // ── Colapso tras dominancia ───────────────────────────────
    if (sets.length >= 2) {
      multiSetMatches++;
      for (let i = 0; i < sets.length - 1; i++) {
        const m = margins[i];
        const mNext = margins[i + 1];
        // Ganó un set con margen ≥4 (6-2, 6-1, 6-0)
        if (m >= 4) {
          // Pero luego perdió el siguiente por ≥3
          if (mNext <= -3) {
            dominantThenCollapse++;
            break; // contar máximo una vez por partido
          }
        }
      }
    }

    // ── Respuesta tras pérdida de set ────────────────────────
    for (let i = 0; i < margins.length - 1; i++) {
      if (margins[i] < 0) {
        setLossOccurrences++;
        if (margins[i + 1] > 0) respondedAfterSetLoss++;
      }
    }

    // ── Márgenes de sets ─────────────────────────────────────
    for (const m of margins) {
      if (m > 0) wonSetMargins.push(m);
      else lostSetMargins.push(Math.abs(m));
    }

    // ── Partido de desgaste ───────────────────────────────────
    const isGrinder = sets.every((s) => Math.abs(s.winner - s.loser) <= 2 || s.tiebreak !== null);
    if (isGrinder && sets.length >= 2) grinderMatches++;
  }

  const matchesAnalyzed = rows.length;

  // ── Ratios ────────────────────────────────────────────────
  const comebackRate     = pct(comebackWins, threeSetMatches);
  const decidingSetRate  = pct(decidingSetWins, threeSetMatches);
  const closingRate      = pct(closedFromSet1Lead, wonSet1);
  const collapseRate     = pct(dominantThenCollapse, multiSetMatches);
  const tbWinRate        = pct(tbWon, tbMatchesPlayed);
  const responseRate     = pct(respondedAfterSetLoss, setLossOccurrences);

  const avgWonSetMargin = wonSetMargins.length > 0
    ? Math.round((wonSetMargins.reduce((a, b) => a + b, 0) / wonSetMargins.length) * 10) / 10
    : null;
  const avgLostSetMargin = lostSetMargins.length > 0
    ? Math.round((lostSetMargins.reduce((a, b) => a + b, 0) / lostSetMargins.length) * 10) / 10
    : null;

  // ── Perfil mental sintético ──────────────────────────────
  let mentalProfile = "balanced";
  if (comebackRate !== null && comebackRate >= 0.55) mentalProfile = "resilient";
  else if (closingRate !== null && closingRate >= 0.75 && (comebackRate === null || comebackRate < 0.4)) mentalProfile = "closer";
  else if (collapseRate !== null && collapseRate >= 0.3) mentalProfile = "volatile";
  else if (grinderMatches >= Math.ceil(matchesAnalyzed * 0.5)) mentalProfile = "grinder";
  else if (comebackRate !== null && comebackRate < 0.25 && threeSetMatches >= 5) mentalProfile = "fragile";

  // ── Frases narrativas ────────────────────────────────────
  const narrativeLines: string[] = [];
  const name = slug.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");

  if (comebackRate !== null && threeSetMatches >= 4) {
    const pct100 = Math.round(comebackRate * 100);
    if (comebackRate >= 0.5) {
      narrativeLines.push(
        `${name} muestra una resiliencia notable en partidos a 3 sets: ha remontado desde set abajo en ${comebackWins} de ${threeSetMatches} ocasiones (${pct100}%). El hecho de perder el primer set no lo desestabiliza.`
      );
    } else if (comebackRate < 0.25) {
      narrativeLines.push(
        `${name} raramente remonta cuando pierde el primer set — solo lo ha conseguido en ${comebackWins} de ${threeSetMatches} veces (${pct100}%). Si pierde el 1.° set, las probabilidades se complican seriamente.`
      );
    }
  }

  if (closingRate !== null && wonSet1 >= 4) {
    const pct100 = Math.round(closingRate * 100);
    if (closingRate >= 0.75) {
      narrativeLines.push(
        `Cuando ${name} gana el primer set, cierra el partido en dos sets el ${pct100}% de las veces — es un jugador que sabe rematar cuando tiene ventaja.`
      );
    } else if (closingRate < 0.45) {
      narrativeLines.push(
        `${name} tiene dificultades para cerrar partidos: gana el primer set pero acaba yendo al 3.° el ${100 - pct100}% de las veces — el rival siempre tiene opciones de reengancharse.`
      );
    }
  }

  if (collapseRate !== null && multiSetMatches >= 4) {
    const pct100 = Math.round(collapseRate * 100);
    if (collapseRate >= 0.25) {
      narrativeLines.push(
        `Patrón de colapso detectado: en ${pct100}% de sus partidos ${name} gana un set de forma dominante pero cede el siguiente con un margen importante — la inercia del dominio puede volverse en su contra.`
      );
    }
  }

  if (responseRate !== null && setLossOccurrences >= 4) {
    const pct100 = Math.round(responseRate * 100);
    if (responseRate >= 0.65) {
      narrativeLines.push(
        `${name} responde bien a los sets perdidos: gana el set siguiente en el ${pct100}% de las ocasiones — sabe reaccionar cuando el partido se complica.`
      );
    } else if (responseRate < 0.35) {
      narrativeLines.push(
        `Cuando ${name} pierde un set, raramente responde en el siguiente (${pct100}% de respuesta) — la inercia negativa tiende a acumularse.`
      );
    }
  }

  if (tbWinRate !== null && tbMatchesPlayed >= 3) {
    const pct100 = Math.round(tbWinRate * 100);
    if (tbWinRate >= 0.65) {
      narrativeLines.push(
        `${name} domina los tiebreaks — los gana en el ${pct100}% de los partidos donde aparecen. Los momentos de máxima tensión le favorecen.`
      );
    } else if (tbWinRate < 0.4) {
      narrativeLines.push(
        `Los tiebreaks son una debilidad de ${name}: los pierde en el ${100 - pct100}% de los partidos donde se producen.`
      );
    }
  }

  return {
    slug,
    matchesAnalyzed,
    computedAt: Math.floor(Date.now() / 1000),
    threeSetMatches,
    comebackWins,
    comebackRate,
    decidingSetWinRate: decidingSetRate,
    wonSet1,
    closedFromSet1Lead,
    closingRate,
    dominantThenCollapse,
    collapseAfterDominanceRate: collapseRate,
    tbMatchesPlayed,
    tbWon,
    tbWinRate,
    respondedAfterSetLoss,
    setLossOccurrences,
    responseRate,
    avgWonSetMargin,
    avgLostSetMargin,
    grinderMatches,
    mentalProfile,
    narrativeLines,
  };
}

// ── Persistencia ──────────────────────────────────────────

export async function saveMomentumProfile(profile: MomentumProfile): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `
      INSERT INTO player_insights (te_slug, insights_json, match_count, updated_at)
      VALUES (?, ?, ?, unixepoch())
      ON CONFLICT(te_slug) DO UPDATE SET
        insights_json = excluded.insights_json,
        match_count   = excluded.match_count,
        updated_at    = excluded.updated_at
    `,
    args: [profile.slug, JSON.stringify(profile), profile.matchesAnalyzed],
  });
}

export async function getMomentumProfile(slug: string): Promise<MomentumProfile | null> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT insights_json, updated_at FROM player_insights WHERE te_slug = ?",
    args: [slug],
  });
  const row = result.rows[0] as unknown as { insights_json: string; updated_at: number } | undefined;
  if (!row) return null;

  // Recomputar si tiene más de 24 horas
  const ageHours = (Math.floor(Date.now() / 1000) - row.updated_at) / 3600;
  if (ageHours > 24) return null;

  try {
    return JSON.parse(row.insights_json) as MomentumProfile;
  } catch {
    return null;
  }
}

/**
 * Calcula y persiste el perfil de momentum de un jugador.
 * Devuelve el perfil calculado.
 */
export async function refreshMomentumProfile(slug: string): Promise<MomentumProfile> {
  const profile = await computePlayerMomentumProfile(slug);
  if (profile.matchesAnalyzed >= 3) {
    await saveMomentumProfile(profile);
  }
  return profile;
}
