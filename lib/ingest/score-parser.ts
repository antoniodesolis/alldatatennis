/**
 * Parsea el string de resultado de un partido de tenis (Sackmann CSV).
 * Detecta: sets jugados, tiebreaks, si fue al set decisivo.
 *
 * Formato típico: "6-3 6-4", "7-6(5) 4-6 7-6(3)", "6-3 3-6 RET"
 * Desde la perspectiva del GANADOR (result="W").
 * Para el perdedor invertir tb_won.
 */

export interface ScoreParsed {
  setsPlayed: number;
  tbPlayed: number;
  tbWonByWinner: number;    // tiebreaks ganados por el ganador del partido
  retired: boolean;
  walkover: boolean;
}

const SET_PATTERN = /^(\d+)-(\d+)(?:\(\d+\))?$/;

export function parseScore(score: string | null | undefined): ScoreParsed {
  const empty: ScoreParsed = { setsPlayed: 0, tbPlayed: 0, tbWonByWinner: 0, retired: false, walkover: false };
  if (!score) return empty;

  const s = score.trim().toUpperCase();
  if (s === "W/O" || s === "DEF" || s.startsWith("DEF")) return { ...empty, walkover: true };

  const retired = s.includes("RET") || s.includes("ABD");

  // Partir por espacios, quedarse con tokens que sean sets
  const tokens = s.replace(/RET|ABD|DEF/g, "").trim().split(/\s+/);
  let setsPlayed = 0;
  let tbPlayed = 0;
  let tbWonByWinner = 0;

  for (const tok of tokens) {
    // Normalizar notación "(X)" con posible lowercase
    const cleanTok = tok.replace(/\([^)]*\)/, "(X)");
    const m = tok.match(/^(\d+)-(\d+)(?:\(\d+\))?$/);
    if (!m) continue;
    const a = parseInt(m[1]); // ganador del partido
    const b = parseInt(m[2]); // perdedor del partido
    setsPlayed++;

    // Tiebreak: un set termina 7-6 o 6-7
    if ((a === 7 && b === 6) || (a === 6 && b === 7)) {
      tbPlayed++;
      if (a === 7) tbWonByWinner++; // ganador ganó el tiebreak
    }
  }

  const walkover = false;
  return { setsPlayed, tbPlayed, tbWonByWinner, retired, walkover };
}

/**
 * Dado el score y el resultado (W/L), devuelve stats desde la perspectiva del jugador.
 */
export function playerScoreStats(score: string | null | undefined, result: string | null, bestOf: number) {
  const parsed = parseScore(score);
  if (parsed.walkover || parsed.setsPlayed === 0) return null;

  const isWinner = result === "W";

  const tbPlayed = parsed.tbPlayed;
  const tbWon    = isWinner ? parsed.tbWonByWinner : parsed.tbPlayed - parsed.tbWonByWinner;

  const isDeciding = parsed.setsPlayed === bestOf || parsed.setsPlayed === bestOf - (isWinner ? 0 : 0);
  // Consideramos "partido decisivo" si se jugaron más de (bestOf-1)/2 sets
  // Para bestOf=3: decisivo = 3 sets. Para bestOf=5: decisivo = 4 o 5 sets
  const wentToDeciding = parsed.setsPlayed >= Math.ceil(bestOf / 2) + 1;

  return {
    setsPlayed: parsed.setsPlayed,
    tbPlayed,
    tbWon,
    wentToDeciding,
    wonDeciding: wentToDeciding && isWinner,
    retired: parsed.retired,
  };
}
