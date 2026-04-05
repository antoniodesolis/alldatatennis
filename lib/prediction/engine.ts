/**
 * Motor de predicción ATP v2 — lib/prediction/engine.ts
 *
 * 11 factores ponderados con redistribución dinámica de pesos cuando
 * un factor no tiene datos suficientes (< MIN_MATCHES_FACTOR partidos).
 *
 * Pesos base (deben sumar 1.0):
 *   1. CSI exacto del torneo        17%
 *   2. Forma reciente 3 meses       14%
 *   3. Win rate vs ranking rival    14%
 *   4. Historial torneo específico   9%
 *   5. H2H en superficie             9%
 *   6. Nivel de torneo               9%
 *   7. Turno día/noche               5%
 *   8. Clima                         5%
 *   9. TB + 3er set (si igualado)    5%
 *  10. Días de descanso              5%
 *  11. Perfil táctico del matchup    8%
 *
 * Probabilidad final: logistic( Σ effectiveWeight_i × rawAdv_i × LOGIT_SCALE )
 */

import { getPlayerPatterns } from "../analytics/patterns";
import { getTournamentCourtModel } from "../analytics/court-speed";
import { getDb } from "../db/client";
import { canonicalSlug } from "../analytics/player-resolver";
import { getCalibration } from "../learning/feedback";
import { computePlayerConfidence, adjustProbabilityForConfidence } from "../analytics/player-confidence";
import type { PlayerConfidence } from "../analytics/player-confidence";
import { analyzeMatchup } from "../analytics/matchup-intelligence";
import { generateNarrative } from "../analytics/narrative";
import type { TacticalAnalysis } from "../analytics/narrative";
import { getPlayerInsights } from "../db/queries";

// ── Constants ─────────────────────────────────────────────

const LOGIT_SCALE     = 6.5;  // amplificador de ventajas en el espacio logit
const MIN_MATCHES_FACTOR = 5; // mínimo de partidos para considerar que un factor tiene datos
const WIN_RATE_NORM   = 0.30; // 30pp diferencia = ventaja máxima en factores de win rate

const BASE_WEIGHTS: Record<string, number> = {
  csi_exact:        0.17,
  recent_form_3m:   0.14,
  vs_rank:          0.14,
  tourney_history:  0.09,
  h2h_surface:      0.09,
  level:            0.09,
  time_of_day:      0.05,
  weather:          0.05,
  tiebreak_3rdset:  0.05,
  rest_days:        0.05,
  tactical_profile: 0.08,
};

// ── Types ────────────────────────────────────────────────

export interface PredictionInput {
  player1: string;
  player2: string;
  player1Name: string;
  player2Name: string;
  tournament: string;
  tourneyLevel: string;   // "grand-slam"|"masters-1000"|"atp-500"|"atp-250"|"atp-finals"|"other"
  surface: string;        // "clay"|"hard"|"grass"|"indoor hard"
  round?: string;         // "R128"|"R64"|"R32"|"R16"|"QF"|"SF"|"F"|"Q"|"Q1"|"Q2"|"RR"
  timeOfDay?: string;     // "day"|"evening"|"night"
  date?: string;          // YYYY-MM-DD
  lat?: number;
  lon?: number;
  indoor?: boolean;
  player1Rank?: number;   // ranking actual (opcional)
  player2Rank?: number;
}

export interface FactorResult {
  id: string;
  label: string;
  p1Label: string;
  p2Label: string;
  p1Advantage: number;    // -1 a +1 desde perspectiva de p1
  winner: "p1" | "p2" | "neutral";
  magnitude: number;
  confidence: number;     // 0-1
  // Nuevos campos v2
  baseWeight: number;     // peso original (0-1)
  effectiveWeight: number;// peso después de redistribución
  hasData: boolean;
  dataCount: number;      // nº de partidos usados para este factor (el menor de p1 y p2)
  explanation: string;    // frase explicativa en español
}

export interface WeatherData {
  temp: number;
  humidity: number;
  windSpeed: number;
  description: string;
  effect: string;
  source: "live" | "static";
}

export interface PredictionResult {
  player1: { slug: string; name: string; winPct: number };
  player2: { slug: string; name: string; winPct: number };
  keyPatterns: FactorResult[];   // top 3 por impacto
  allFactors: FactorResult[];    // los 10 factores completos
  weather?: WeatherData;
  h2h: { p1Wins: number; p2Wins: number; total: number; lastMatches: string[] };
  confidence: number;
  courtModel?: { speed: number; profile: string; name: string };
  mainReason: string;            // frase principal del pronóstico
  playerConfidence?: {
    p1: PlayerConfidence;
    p2: PlayerConfidence;
    adjustmentNote: string;
  };
  tacticalAnalysis?: TacticalAnalysis;
}

// ── Tournament geo map ────────────────────────────────────

const TOURNEY_GEO: Record<string, { lat: number; lon: number; indoor: boolean }> = {
  "Australian Open":     { lat: -37.82, lon: 144.98, indoor: false },
  "Roland Garros":       { lat: 48.85,  lon:   2.25, indoor: false },
  "Wimbledon":           { lat: 51.43,  lon:  -0.21, indoor: false },
  "Us Open":             { lat: 40.75,  lon: -73.85, indoor: false },
  "Indian Wells Masters":{ lat: 33.72,  lon:-116.37, indoor: false },
  "Miami Masters":       { lat: 25.69,  lon: -80.16, indoor: false },
  "Monte Carlo Masters": { lat: 43.74,  lon:   7.43, indoor: false },
  "Madrid Masters":      { lat: 40.42,  lon:  -3.69, indoor: false },
  "Rome Masters":        { lat: 41.93,  lon:  12.46, indoor: false },
  "Barcelona":           { lat: 41.38,  lon:   2.18, indoor: false },
  "Hamburg":             { lat: 53.55,  lon:   9.99, indoor: false },
  "Canada Masters":      { lat: 45.56,  lon: -73.62, indoor: false },
  "Cincinnati Masters":  { lat: 39.35,  lon: -84.37, indoor: false },
  "Shanghai Masters":    { lat: 31.22,  lon: 121.47, indoor: false },
  "Vienna":              { lat: 48.21,  lon:  16.37, indoor: true  },
  "Basel":               { lat: 47.55,  lon:   7.59, indoor: true  },
  "Paris Masters":       { lat: 48.89,  lon:   2.37, indoor: true  },
  "Tour Finals":         { lat: 45.07,  lon:   7.69, indoor: true  },
  "Brisbane":            { lat: -27.47, lon: 153.03, indoor: false },
  "Halle":               { lat: 51.92,  lon:   8.34, indoor: false },
  "Queen's Club":        { lat: 51.47,  lon:  -0.20, indoor: false },
  "Washington":          { lat: 38.91,  lon: -77.05, indoor: false },
  "Acapulco":            { lat: 16.85,  lon: -99.89, indoor: false },
  "Dubai":               { lat: 25.20,  lon:  55.27, indoor: false },
  "Houston":             { lat: 29.76,  lon: -95.37, indoor: false },
  "Doha":                { lat: 25.29,  lon:  51.53, indoor: false },
  "Auckland":            { lat: -36.85, lon: 174.76, indoor: false },
  "Santiago":            { lat: -33.45, lon: -70.67, indoor: false },
  "Rio":                 { lat: -22.91, lon: -43.17, indoor: false },
  "Buenos Aires":        { lat: -34.60, lon: -58.38, indoor: false },
  "Delray Beach":        { lat: 26.46,  lon: -80.07, indoor: false },
  "Winston Salem":       { lat: 36.10,  lon: -80.24, indoor: false },
  "Atlanta":             { lat: 33.75,  lon: -84.39, indoor: false },
};

// ── Helpers ───────────────────────────────────────────────

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function pctStr(v: number | null | undefined): string {
  if (v == null) return "sin datos";
  return `${(v * 100).toFixed(0)}%`;
}

/** Convierte diferencia de win rates en rawAdvantage [-1, +1] */
function rateToAdv(p1Rate: number | null, p2Rate: number | null): number {
  if (p1Rate == null && p2Rate == null) return 0;
  const r1 = p1Rate ?? 0.5;
  const r2 = p2Rate ?? 0.5;
  return clamp((r1 - r2) / WIN_RATE_NORM, -1, 1);
}

function makeFactorResult(
  id: string,
  label: string,
  p1Label: string,
  p2Label: string,
  rawAdv: number,
  confidence: number,
  hasData: boolean,
  dataCount: number,
  explanation: string,
): Omit<FactorResult, "baseWeight" | "effectiveWeight"> {
  const magnitude = Math.abs(rawAdv);
  const winner: "p1" | "p2" | "neutral" = magnitude < 0.05 ? "neutral" : rawAdv > 0 ? "p1" : "p2";
  return { id, label, p1Label, p2Label, p1Advantage: rawAdv, winner, magnitude, confidence, hasData, dataCount, explanation };
}

// ── H2H ──────────────────────────────────────────────────

function getH2H(p1: string, p2: string) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT result, match_date, tournament, surface
    FROM player_match_stats
    WHERE te_slug = ? AND opponent_slug = ? AND result IS NOT NULL
    ORDER BY match_date DESC LIMIT 20
  `).all(p1, p2) as { result: string; match_date: string; tournament: string; surface: string }[];

  const p1Wins = rows.filter((r) => r.result === "W").length;
  const p2Wins = rows.filter((r) => r.result === "L").length;
  const lastMatches = rows.slice(0, 5).map((r) => r.result);

  return { p1Wins, p2Wins, total: p1Wins + p2Wins, lastMatches, rows };
}

function getH2HSurface(p1: string, p2: string, surface: string): { p1Wins: number; p2Wins: number; total: number } {
  const db = getDb();
  // Normalizar superficie para el match (clay/hard/grass)
  const surfNorm = surface.includes("clay") ? "clay" : surface.includes("grass") ? "grass" : "hard";
  const rows = db.prepare(`
    SELECT result FROM player_match_stats
    WHERE te_slug = ? AND opponent_slug = ?
      AND result IS NOT NULL
      AND (surface LIKE ? OR surface = ?)
    ORDER BY match_date DESC LIMIT 12
  `).all(p1, p2, `%${surfNorm}%`, surface) as { result: string }[];

  const p1Wins = rows.filter((r) => r.result === "W").length;
  const p2Wins = rows.filter((r) => r.result === "L").length;
  return { p1Wins, p2Wins, total: p1Wins + p2Wins };
}

// ── Recent form (últimos 3 meses) ─────────────────────────

function getRecentForm3m(slug: string, refDate: string): { winRate: number | null; matches: number } {
  const db = getDb();
  const since = (() => {
    const d = new Date(refDate);
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  })();

  const rows = db.prepare(`
    SELECT result FROM player_match_stats
    WHERE te_slug = ? AND match_date >= ? AND result IS NOT NULL
    ORDER BY match_date DESC LIMIT 40
  `).all(slug, since) as { result: string }[];

  if (rows.length === 0) return { winRate: null, matches: 0 };
  const wins = rows.filter((r) => r.result === "W").length;
  return { winRate: wins / rows.length, matches: rows.length };
}

// ── Rival rank estimation ─────────────────────────────────

function estimatePlayerRank(slug: string): number | null {
  const db = getDb();
  // El ranking del jugador aparece como opponent_rank cuando otros jugaron contra él
  const rows = db.prepare(`
    SELECT opponent_rank FROM player_match_stats
    WHERE opponent_slug = ? AND opponent_rank IS NOT NULL
    ORDER BY match_date DESC LIMIT 10
  `).all(slug) as { opponent_rank: number }[];
  if (rows.length === 0) return null;
  // Mediana para evitar outliers
  const ranks = rows.map((r) => r.opponent_rank).sort((a, b) => a - b);
  return ranks[Math.floor(ranks.length / 2)];
}

function rankBracketKey(rank: number | null): "top10" | "top20" | "top50" | "top100" | "rest" {
  if (rank == null) return "rest";
  if (rank <= 10) return "top10";
  if (rank <= 20) return "top20";
  if (rank <= 50) return "top50";
  if (rank <= 100) return "top100";
  return "rest";
}

// ── Rest days ─────────────────────────────────────────────

function getLastMatchDate(slug: string, beforeDate: string): string | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT MAX(match_date) as last FROM player_match_stats
    WHERE te_slug = ? AND match_date < ? AND result IS NOT NULL
  `).get(slug, beforeDate) as { last: string | null };
  return row?.last ?? null;
}

/** Calcula la racha actual desde recentForm (["W","W","L",...]).
 *  Positivo = racha ganadora, negativo = racha perdedora. */
function computeCurrentStreak(recentForm: string[] | undefined): number {
  if (!recentForm || recentForm.length === 0) return 0;
  const first = recentForm[0];
  if (first !== "W" && first !== "L") return 0;
  let count = 0;
  for (const r of recentForm) {
    if (r === first) count++;
    else break;
  }
  return first === "W" ? count : -count;
}

function restDaysScore(daysRest: number | null): number {
  if (daysRest == null) return 0.50; // sin datos → neutral
  if (daysRest === 0) return 0.30;   // jugó hoy → muy cansado
  if (daysRest === 1) return 0.70;
  if (daysRest <= 3) return 1.00;   // óptimo
  if (daysRest <= 5) return 0.90;
  if (daysRest <= 7) return 0.80;
  if (daysRest <= 14) return 0.70;
  return 0.60;                       // demasiado descanso → desentrenado
}

// ── Weather ───────────────────────────────────────────────

const weatherCache = new Map<string, { data: WeatherData; ts: number }>();
const WEATHER_TTL = 60 * 60 * 1000;

function staticSeasonalWeather(lat: number, lon: number): WeatherData {
  const month = new Date().getMonth();
  const isSouthernHemi = lat < 0;
  const seasonMonth = isSouthernHemi ? (month + 6) % 12 : month;
  const absLat = Math.abs(lat);

  let baseTemp: number;
  if (absLat < 15)      baseTemp = 30 + Math.random() * 3;
  else if (absLat < 35) baseTemp = 22 + Math.cos(((seasonMonth - 6) / 6) * Math.PI) * 10;
  else if (absLat < 50) baseTemp = 15 + Math.cos(((seasonMonth - 6) / 6) * Math.PI) * 12;
  else                  baseTemp = 10 + Math.cos(((seasonMonth - 6) / 6) * Math.PI) * 14;

  const isCoastal = absLat < 20 || Math.abs(lon) > 100 || (lon > 0 && lon < 15 && absLat < 45);
  const humidity  = Math.round((isCoastal ? 72 : 55) + (Math.random() * 14 - 7));
  const isSpring  = seasonMonth >= 2 && seasonMonth <= 4;
  const windSpeed = Math.round((isSpring ? 18 : 10) + Math.random() * 10);
  const temp      = Math.round(baseTemp * 10) / 10;

  let description = "cielo despejado";
  if (humidity > 75) description = "parcialmente nublado";
  if (humidity > 85) description = "nublado";
  if (temp < 5)      description = "frío con nubes";

  const effects: string[] = [];
  if (windSpeed > 30) effects.push("viento fuerte → juego disruptivo");
  else if (windSpeed > 20) effects.push("viento moderado → afecta peloteo");
  if (humidity > 70) effects.push("alta humedad → bola más pesada");
  if (temp > 32)     effects.push("calor extremo → partido físico");
  if (temp < 12)     effects.push("frío → bote bajo");

  return { temp, humidity, windSpeed, description, effect: effects.join(", ") || "condiciones normales", source: "static" };
}

function buildWeatherData(json: {
  main: { temp: number; humidity: number };
  wind: { speed: number };
  weather: { description: string }[];
}): WeatherData {
  const windKmh = Math.round((json.wind?.speed ?? 0) * 3.6 * 10) / 10;
  const humidity = json.main?.humidity ?? 50;
  const temp = Math.round((json.main?.temp ?? 20) * 10) / 10;
  const desc = json.weather?.[0]?.description ?? "";

  const effects: string[] = [];
  if (windKmh > 30) effects.push("viento fuerte → juego disruptivo");
  else if (windKmh > 20) effects.push("viento moderado → afecta peloteo");
  if (humidity > 70) effects.push("alta humedad → bola más pesada");
  if (temp > 32)     effects.push("calor extremo → partido físico");
  if (temp < 12)     effects.push("frío → bote bajo");

  return { temp, humidity, windSpeed: windKmh, description: desc, effect: effects.join(", ") || "condiciones normales", source: "live" };
}

async function fetchWeather(lat: number, lon: number): Promise<WeatherData> {
  const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = weatherCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < WEATHER_TTL) return cached.data;

  const apiKey = process.env.OPENWEATHER_API_KEY;
  const hasRealKey = apiKey && apiKey !== "PLACEHOLDER" && apiKey.length > 10;

  if (hasRealKey) {
    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (res.ok) {
        const json = await res.json() as { main: { temp: number; humidity: number }; wind: { speed: number }; weather: { description: string }[] };
        const data = buildWeatherData(json);
        weatherCache.set(cacheKey, { data, ts: Date.now() });
        return data;
      }
    } catch { /* caer al fallback */ }
  }

  const data = staticSeasonalWeather(lat, lon);
  weatherCache.set(cacheKey, { data, ts: Date.now() - (WEATHER_TTL - 15 * 60 * 1000) });
  return data;
}

function findGeo(tournament: string): { lat: number; lon: number } | null {
  const exact = TOURNEY_GEO[tournament];
  if (exact) return exact;
  const lower = tournament.toLowerCase();
  for (const [key, geo] of Object.entries(TOURNEY_GEO)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower.split(" ")[0])) {
      return geo;
    }
  }
  return null;
}

function getPlayerStyle(slug: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getPlayerStyle: gps } = require("../analytics/player-styles");
    return gps(slug) as string;
  } catch { return "baseliner"; }
}

function weatherStyleBonus(style: string, weather: WeatherData): number {
  let bonus = 0;
  const { windSpeed: wind, humidity, temp } = weather;
  if (wind > 25) {
    if (style === "big-server")           bonus += 0.20;
    else if (style === "aggressive-baseliner") bonus += 0.10;
    else if (style === "counter-puncher") bonus -= 0.15;
    else if (style === "baseliner")       bonus -= 0.10;
  }
  if (humidity > 70) {
    if (style === "counter-puncher")      bonus += 0.12;
    else if (style === "baseliner")       bonus += 0.08;
    else if (style === "big-server")      bonus -= 0.08;
    else if (style === "aggressive-baseliner") bonus -= 0.05;
  }
  if (temp > 32) {
    if (style === "aggressive-baseliner") bonus += 0.10;
    else if (style === "all-court")       bonus += 0.05;
    else if (style === "counter-puncher") bonus -= 0.08;
  }
  return clamp(bonus, -0.5, 0.5);
}

// ── Weight redistribution ─────────────────────────────────

function redistributeWeights(
  factors: Array<{ id: string; hasData: boolean }>,
  calibrationMults: Record<string, number>,
): Record<string, number> {
  // Aplicar multiplicadores de calibración aprendida a los pesos base
  // Ejemplo: si csi_exact ha fallado sistemáticamente → su weight_mult < 1.0 → pesa menos
  const calibratedBase: Record<string, number> = {};
  for (const f of factors) {
    const mult = calibrationMults[f.id] ?? 1.0;
    calibratedBase[f.id] = BASE_WEIGHTS[f.id] * mult;
  }

  // Normalizar pesos calibrados para que sumen 1.0 entre los factores CON datos
  const withData    = factors.filter((f) => f.hasData);
  const withoutData = factors.filter((f) => !f.hasData);

  const calibratedSum = withData.reduce((s, f) => s + calibratedBase[f.id], 0);
  // Peso total que debe redistribuirse (el de los sin datos, en escala calibrada)
  const lostWeight = withoutData.reduce((s, f) => s + calibratedBase[f.id], 0);

  const result: Record<string, number> = {};
  for (const f of factors) {
    if (!f.hasData) {
      result[f.id] = 0;
    } else if (calibratedSum > 0) {
      result[f.id] = calibratedBase[f.id] + (calibratedBase[f.id] / calibratedSum) * lostWeight;
    } else {
      result[f.id] = calibratedBase[f.id];
    }
  }

  // Renormalizar para que sumen exactamente 1.0
  const total = Object.values(result).reduce((s, v) => s + v, 0);
  if (total > 0) {
    for (const id of Object.keys(result)) result[id] /= total;
  }

  return result;
}

// ── Player name helpers ───────────────────────────────────

/** Extrae el apellido manejando "Carlos Alcaraz" → "Alcaraz" y "Marozsan F." → "Marozsan" */
function playerLastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  // Si el último token es una inicial (letra mayúscula + punto opcional), usar el primero
  if (/^[A-Z]\.?$/.test(last)) return parts[0];
  return last;
}

// ── Main explanation generator ────────────────────────────

function buildMainReason(
  factors: FactorResult[],
  p1Name: string,
  p2Name: string,
  winPct1: number,
): string {
  const p1Last = playerLastName(p1Name);
  const p2Last = playerLastName(p2Name);

  // Top 2 factores favorables al favorito
  const favored = winPct1 >= 50 ? "p1" : "p2";
  const favoredName = winPct1 >= 50 ? p1Last : p2Last;
  const underdogName = winPct1 >= 50 ? p2Last : p1Last;

  const topFavorable = [...factors]
    .filter((f) => f.hasData && f.effectiveWeight > 0)
    .filter((f) => f.winner === favored)
    .sort((a, b) => (b.magnitude * b.effectiveWeight) - (a.magnitude * a.effectiveWeight))
    .slice(0, 2);

  if (topFavorable.length === 0) {
    return `Partido muy igualado entre ${p1Last} y ${p2Last}, sin factores determinantes claros.`;
  }

  const pct = winPct1 >= 50 ? winPct1 : 100 - winPct1;
  const dominance = pct >= 75 ? "gran favorito" : pct >= 65 ? "claro favorito" : "ligero favorito";

  const reasons = topFavorable.map((f) => {
    const e = f.explanation;
    return e.charAt(0).toLowerCase() + e.slice(1);
  });

  if (reasons.length === 1) {
    return `${favoredName} es ${dominance} (${pct}%) principalmente por ${reasons[0]}.`;
  }
  return `${favoredName} es ${dominance} (${pct}%) por ${reasons[0]} y ${reasons[1]}.`;
}

// ── Main predict function ─────────────────────────────────

export async function predict(input: PredictionInput): Promise<PredictionResult> {
  const today = input.date ?? new Date().toISOString().slice(0, 10);

  // Normalize slugs to canonical form before any DB access
  const p1 = canonicalSlug(input.player1);
  const p2 = canonicalSlug(input.player2);

  // ── 1. Cargar patrones ────────────────────────────────────
  const [pat1, pat2] = await Promise.all([
    getPlayerPatterns(p1, "", 50),
    getPlayerPatterns(p2, "", 50),
  ]);

  // ── 2. Court model ────────────────────────────────────────
  const courtModel = getTournamentCourtModel(input.tournament);
  const courtSpeed = courtModel?.court_speed ?? null;
  const csiProfile = courtSpeed == null ? null
    : courtSpeed >= 65 ? "fast"
    : courtSpeed >= 45 ? "mediumFast"
    : courtSpeed >= 25 ? "medium"
    : "slow";

  // ── 3. H2H ────────────────────────────────────────────────
  const h2hData = getH2H(p1, p2);
  const h2h = { p1Wins: h2hData.p1Wins, p2Wins: h2hData.p2Wins, total: h2hData.total, lastMatches: h2hData.lastMatches };

  // ── 4. Clima ──────────────────────────────────────────────
  let weather: WeatherData | undefined;
  if (!input.indoor) {
    const geo = input.lat && input.lon
      ? { lat: input.lat, lon: input.lon }
      : findGeo(input.tournament);
    if (geo) weather = await fetchWeather(geo.lat, geo.lon);
  }

  // ── 5. Datos auxiliares (rank, forma, descanso) ───────────
  const [form1, form2] = [
    getRecentForm3m(p1, today),
    getRecentForm3m(p2, today),
  ];

  const p1RankEstimated = input.player1Rank ?? estimatePlayerRank(p1);
  const p2RankEstimated = input.player2Rank ?? estimatePlayerRank(p2);

  const p1LastMatch = getLastMatchDate(p1, today);
  const p2LastMatch = getLastMatchDate(p2, today);

  const daysRest1 = p1LastMatch ? Math.round((new Date(today).getTime() - new Date(p1LastMatch).getTime()) / 86400000) : null;
  const daysRest2 = p2LastMatch ? Math.round((new Date(today).getTime() - new Date(p2LastMatch).getTime()) / 86400000) : null;

  // ── 5b. Confianza estadística por jugador ─────────────────
  const conf1 = computePlayerConfidence(p1);
  const conf2 = computePlayerConfidence(p2);

  // ── 5c. Análisis de matchup (necesario para factor táctico) ─
  let matchupEarly: ReturnType<typeof analyzeMatchup>;
  try {
    matchupEarly = analyzeMatchup(p1, p2, pat1, pat2, {
      surface: input.surface,
      tourneyLevel: input.tourneyLevel,
      tournament: input.tournament,
      weather: weather ? { temp: weather.temp, windSpeed: weather.windSpeed, humidity: weather.humidity, effect: weather.effect } : undefined,
      p1RankEstimated,
      p2RankEstimated,
      isIndoor: input.indoor,
    });
  } catch (e) {
    console.warn("[engine] analyzeMatchup early error:", (e as Error).message);
    matchupEarly = analyzeMatchup(p1, p2, pat1, pat2, { surface: input.surface, tourneyLevel: input.tourneyLevel, tournament: input.tournament });
  }

  // ── 6. Construir los 11 factores ──────────────────────────

  const rawFactors: Array<Omit<FactorResult, "baseWeight" | "effectiveWeight">> = [];

  // ─── Factor 1: CSI exacto (20%) ───────────────────────────
  (() => {
    // Buscar historial en este torneo específico primero
    const t1CourtStat = pat1?.courtStats?.[input.tournament];
    const t2CourtStat = pat2?.courtStats?.[input.tournament];

    // Helper para acceder a courtSpeedSplits con clave dinámica tipada
    type CSKey = "fast" | "mediumFast" | "medium" | "slow";
    const getCSI = (pat: typeof pat1, key: string | null) => {
      if (!key || !pat?.courtSpeedSplits) return null;
      return pat.courtSpeedSplits[key as CSKey] ?? null;
    };

    // Si hay historial suficiente en el torneo → lo usa; si no, bucket CSI
    const csiSplit1 = getCSI(pat1, csiProfile);
    const csiSplit2 = getCSI(pat2, csiProfile);
    const p1Rate = (t1CourtStat && t1CourtStat.split.matches >= MIN_MATCHES_FACTOR)
      ? t1CourtStat.split.winRate
      : csiSplit1?.winRate ?? null;
    const p2Rate = (t2CourtStat && t2CourtStat.split.matches >= MIN_MATCHES_FACTOR)
      ? t2CourtStat.split.winRate
      : csiSplit2?.winRate ?? null;

    const p1Matches = (t1CourtStat?.split.matches ?? 0) >= MIN_MATCHES_FACTOR
      ? t1CourtStat!.split.matches
      : (csiSplit1?.matches ?? 0);
    const p2Matches = (t2CourtStat?.split.matches ?? 0) >= MIN_MATCHES_FACTOR
      ? t2CourtStat!.split.matches
      : (csiSplit2?.matches ?? 0);

    const dataCount = Math.min(p1Matches, p2Matches);
    const hasData = (p1Rate != null || p2Rate != null) && (p1Matches >= MIN_MATCHES_FACTOR || p2Matches >= MIN_MATCHES_FACTOR);
    const rawAdv = rateToAdv(p1Rate, p2Rate);
    const favored = rawAdv > 0.05 ? playerLastName(input.player1Name) : rawAdv < -0.05 ? playerLastName(input.player2Name) : null;
    const csiLabel = courtModel ? `CSI ${courtSpeed} (${courtModel.court_profile})` : "pista";
    const explanation = favored
      ? `mejor rendimiento de ${favored} en pistas de velocidad ${csiLabel} (${pctStr(rawAdv > 0 ? p1Rate : p2Rate)} vs ${pctStr(rawAdv > 0 ? p2Rate : p1Rate)})`
      : `rendimiento similar en pista ${csiLabel}`;

    rawFactors.push(makeFactorResult(
      "csi_exact", `Velocidad de pista (CSI ${courtSpeed ?? "?"})`,
      p1Rate != null ? `${pctStr(p1Rate)} en ${csiProfile ?? "esta pista"}` : "sin datos",
      p2Rate != null ? `${pctStr(p2Rate)} en ${csiProfile ?? "esta pista"}` : "sin datos",
      rawAdv,
      hasData ? 0.90 : 0.15,
      hasData, dataCount, explanation,
    ));
  })();

  // ─── Factor 2: Forma reciente 3 meses (15%) ───────────────
  (() => {
    const r1 = form1.winRate, r2 = form2.winRate;
    const hasData = (form1.matches >= MIN_MATCHES_FACTOR || form2.matches >= MIN_MATCHES_FACTOR);
    const rawAdv = rateToAdv(r1, r2);
    const favored = rawAdv > 0.05 ? playerLastName(input.player1Name) : rawAdv < -0.05 ? playerLastName(input.player2Name) : null;
    const explanation = favored
      ? `mejor forma reciente de ${favored} en los últimos 3 meses (${pctStr(rawAdv > 0 ? r1 : r2)})`
      : `forma reciente similar en los últimos 3 meses`;

    rawFactors.push(makeFactorResult(
      "recent_form_3m", "Forma reciente (3 meses)",
      r1 != null ? `${pctStr(r1)} (${form1.matches} partidos)` : "sin datos",
      r2 != null ? `${pctStr(r2)} (${form2.matches} partidos)` : "sin datos",
      rawAdv,
      hasData ? 0.85 : 0.15,
      hasData, Math.min(form1.matches, form2.matches), explanation,
    ));
  })();

  // ─── Factor 3: Win rate vs ranking del rival (15%) ───────
  // Usa dos fuentes combinadas para capturar calidad del rival:
  //   a) opponentRankSplits[bracket]: historial vs jugadores del nivel del rival (si ≥5 partidos)
  //   b) qualityWinRate: win rate ponderada por calidad del rival (top-10→2x, top-50→1.2x, >100→0.6x)
  //      captura que ganar a un #5 vale más que ganar a un #80 incluso sin datos de bracket exacto
  (() => {
    const p2Bracket = rankBracketKey(p2RankEstimated);
    const p1Bracket = rankBracketKey(p1RankEstimated);

    // Fuente a: historial por bracket de ranking
    const p1VsP2Level = pat1?.opponentRankSplits?.[p2Bracket];
    const p2VsP1Level = pat2?.opponentRankSplits?.[p1Bracket];
    const p1BracketRate  = p1VsP2Level?.winRate ?? null;
    const p2BracketRate  = p2VsP1Level?.winRate ?? null;
    const p1BracketM     = p1VsP2Level?.matches ?? 0;
    const p2BracketM     = p2VsP1Level?.matches ?? 0;
    const hasBracketData = (p1BracketM >= MIN_MATCHES_FACTOR || p2BracketM >= MIN_MATCHES_FACTOR);

    // Fuente b: qualityWinRate ponderada
    const p1QualRate = pat1?.qualityWinRate ?? null;
    const p2QualRate = pat2?.qualityWinRate ?? null;
    const hasQualData = (pat1?.matchesUsed ?? 0) >= MIN_MATCHES_FACTOR || (pat2?.matchesUsed ?? 0) >= MIN_MATCHES_FACTOR;

    // Combinar: preferir bracket si hay datos; de lo contrario usar qualityWinRate
    let p1Rate: number | null;
    let p2Rate: number | null;
    let dataCount: number;
    let hasData: boolean;
    let sourceLabel: string;

    if (hasBracketData) {
      p1Rate = p1BracketRate;
      p2Rate = p2BracketRate;
      dataCount = Math.min(p1BracketM, p2BracketM);
      hasData = true;
      sourceLabel = "bracket";
    } else if (hasQualData) {
      // qualityWinRate normalizada: centrada en 0.5, escalar igual que bracket rates
      p1Rate = p1QualRate;
      p2Rate = p2QualRate;
      dataCount = Math.min(pat1?.matchesUsed ?? 0, pat2?.matchesUsed ?? 0);
      hasData = true;
      sourceLabel = "calidad";
    } else {
      p1Rate = null; p2Rate = null; dataCount = 0; hasData = false; sourceLabel = "sin datos";
    }

    const rawAdv = rateToAdv(p1Rate, p2Rate);
    const p2RankLabel = p2RankEstimated ? `#${p2RankEstimated} (${p2Bracket})` : p2Bracket;
    const p1RankLabel = p1RankEstimated ? `#${p1RankEstimated} (${p1Bracket})` : p1Bracket;
    const favored = rawAdv > 0.05 ? playerLastName(input.player1Name) : rawAdv < -0.05 ? playerLastName(input.player2Name) : null;
    const explanation = favored
      ? sourceLabel === "bracket"
        ? `${favored} tiene mejor historial contra rivales de su nivel — ${pctStr(rawAdv > 0 ? p1Rate : p2Rate)} vs ${p2Bracket}`
        : `${favored} acumula victorias de mayor calidad (win rate ponderada por ranking rival: ${pctStr(rawAdv > 0 ? p1Rate : p2Rate)})`
      : `rendimiento similar contra rivales de nivel equivalente`;

    rawFactors.push(makeFactorResult(
      "vs_rank", "Win rate vs calidad del rival",
      p1Rate != null ? `${pctStr(p1Rate)} vs ${p2RankLabel}` : "sin datos",
      p2Rate != null ? `${pctStr(p2Rate)} vs ${p1RankLabel}` : "sin datos",
      rawAdv,
      hasData ? 0.80 : 0.10,
      hasData, dataCount, explanation,
    ));
  })();

  // ─── Factor 4: Historial torneo específico (10%) ──────────
  (() => {
    const t1 = pat1?.courtStats?.[input.tournament];
    const t2 = pat2?.courtStats?.[input.tournament];
    const p1Rate = t1?.split.winRate ?? null;
    const p2Rate = t2?.split.winRate ?? null;
    const p1M = t1?.split.matches ?? 0;
    const p2M = t2?.split.matches ?? 0;
    const hasData = (p1M >= MIN_MATCHES_FACTOR || p2M >= MIN_MATCHES_FACTOR);
    const rawAdv = rateToAdv(p1Rate, p2Rate);
    const favored = rawAdv > 0.05 ? playerLastName(input.player1Name) : rawAdv < -0.05 ? playerLastName(input.player2Name) : null;
    const explanation = favored
      ? `historial superior de ${favored} en ${input.tournament} (${pctStr(rawAdv > 0 ? p1Rate : p2Rate)} en ${rawAdv > 0 ? p1M : p2M} partidos)`
      : `historial similar en ${input.tournament}`;

    rawFactors.push(makeFactorResult(
      "tourney_history", `Historial en ${input.tournament}`,
      p1Rate != null ? `${pctStr(p1Rate)} (${p1M} partidos)` : "sin datos",
      p2Rate != null ? `${pctStr(p2Rate)} (${p2M} partidos)` : "sin datos",
      rawAdv,
      hasData ? 0.92 : 0.10,
      hasData, Math.min(p1M, p2M), explanation,
    ));
  })();

  // ─── Factor 5: H2H en superficie similar (10%) ────────────
  (() => {
    const h2hSurf = getH2HSurface(p1, p2, input.surface);
    const hasData = h2hSurf.total >= 2;
    const p1WinRate = h2hSurf.total > 0 ? h2hSurf.p1Wins / h2hSurf.total : null;
    const rawAdv = p1WinRate != null ? clamp((p1WinRate - 0.5) * 2, -1, 1) : 0;
    const surfLabel = input.surface === "clay" ? "tierra" : input.surface === "grass" ? "hierba" : "pista dura";
    const favored = rawAdv > 0.05 ? playerLastName(input.player1Name) : rawAdv < -0.05 ? playerLastName(input.player2Name) : null;
    const explanation = favored
      ? `${favored} gana el H2H en ${surfLabel} (${h2hSurf.p1Wins > h2hSurf.p2Wins ? h2hSurf.p1Wins : h2hSurf.p2Wins}-${h2hSurf.p1Wins > h2hSurf.p2Wins ? h2hSurf.p2Wins : h2hSurf.p1Wins} en ${h2hSurf.total} duelos)`
      : h2hSurf.total > 0 ? `H2H igualado en ${surfLabel} (${h2hSurf.p1Wins}-${h2hSurf.p2Wins})`
      : `sin duelos previos en ${surfLabel}`;

    const p1Label = hasData ? `${h2hSurf.p1Wins}V-${h2hSurf.p2Wins}D en ${surfLabel}` : "sin H2H en esta superficie";
    const p2Label = hasData ? `${h2hSurf.p2Wins}V-${h2hSurf.p1Wins}D en ${surfLabel}` : "sin H2H en esta superficie";

    rawFactors.push(makeFactorResult(
      "h2h_surface", `H2H en ${input.surface}`,
      p1Label, p2Label, rawAdv,
      hasData ? Math.min(0.95, 0.55 + h2hSurf.total * 0.06) : 0.10,
      hasData, h2hSurf.total, explanation,
    ));
  })();

  // ─── Factor 6: Nivel de torneo (10%) ─────────────────────
  (() => {
    const lvl = input.tourneyLevel;
    const p1Split = pat1?.levelSplits?.[lvl];
    const p2Split = pat2?.levelSplits?.[lvl];
    const p1Rate = p1Split?.winRate ?? null;
    const p2Rate = p2Split?.winRate ?? null;
    const p1M = p1Split?.matches ?? 0;
    const p2M = p2Split?.matches ?? 0;
    const hasData = (p1M >= MIN_MATCHES_FACTOR || p2M >= MIN_MATCHES_FACTOR);
    const rawAdv = rateToAdv(p1Rate, p2Rate);
    const LEVEL_LABELS: Record<string, string> = {
      "grand-slam": "Grand Slam", "masters-1000": "Masters 1000",
      "atp-500": "ATP 500", "atp-250": "ATP 250", "atp-finals": "ATP Finals", "other": "otro",
    };
    const lvlLabel = LEVEL_LABELS[lvl] ?? lvl;
    const favored = rawAdv > 0.05 ? playerLastName(input.player1Name) : rawAdv < -0.05 ? playerLastName(input.player2Name) : null;
    const explanation = favored
      ? `${favored} rinde mejor en ${lvlLabel} (${pctStr(rawAdv > 0 ? p1Rate : p2Rate)})`
      : `rendimiento similar en torneos ${lvlLabel}`;

    rawFactors.push(makeFactorResult(
      "level", `Nivel ${lvlLabel}`,
      p1Rate != null ? `${pctStr(p1Rate)} en ${lvlLabel}` : "sin datos",
      p2Rate != null ? `${pctStr(p2Rate)} en ${lvlLabel}` : "sin datos",
      rawAdv,
      hasData ? 0.85 : 0.10,
      hasData, Math.min(p1M, p2M), explanation,
    ));
  })();

  // ─── Factor 7: Turno día/noche (5%) ───────────────────────
  (() => {
    const tod = input.timeOfDay;
    const todKey = tod === "night" ? "night" : tod === "evening" ? "evening" : tod === "day" ? "day" : null;
    const p1Split = todKey ? pat1?.timeOfDaySplits?.[todKey as "day" | "evening" | "night"] : null;
    const p2Split = todKey ? pat2?.timeOfDaySplits?.[todKey as "day" | "evening" | "night"] : null;
    const p1Rate = p1Split?.winRate ?? null;
    const p2Rate = p2Split?.winRate ?? null;
    const p1M = p1Split?.matches ?? 0;
    const p2M = p2Split?.matches ?? 0;
    const hasData = todKey != null && (p1M >= MIN_MATCHES_FACTOR || p2M >= MIN_MATCHES_FACTOR);
    const rawAdv = rateToAdv(p1Rate, p2Rate);
    const todLabel = todKey === "night" ? "nocturno" : todKey === "evening" ? "vespertino" : todKey === "day" ? "diurno" : "sin turno especificado";
    const favored = rawAdv > 0.05 ? playerLastName(input.player1Name) : rawAdv < -0.05 ? playerLastName(input.player2Name) : null;
    const explanation = favored
      ? `${favored} tiene mejor rendimiento en turno ${todLabel} (${pctStr(rawAdv > 0 ? p1Rate : p2Rate)})`
      : todKey ? `rendimiento similar en turno ${todLabel}` : "turno no especificado";

    rawFactors.push(makeFactorResult(
      "time_of_day", `Turno ${todLabel}`,
      p1Rate != null ? `${pctStr(p1Rate)} en turno ${todLabel}` : "sin datos",
      p2Rate != null ? `${pctStr(p2Rate)} en turno ${todLabel}` : "sin datos",
      rawAdv,
      hasData ? 0.75 : 0.05,
      hasData, Math.min(p1M, p2M), explanation,
    ));
  })();

  // ─── Factor 8: Clima (5%) ─────────────────────────────────
  (() => {
    if (!weather) {
      rawFactors.push(makeFactorResult(
        "weather", "Condiciones climáticas",
        "interior / sin datos", "interior / sin datos",
        0, 0.05, false, 0, "partido en interior, clima no relevante",
      ));
      return;
    }
    const style1 = getPlayerStyle(p1);
    const style2 = getPlayerStyle(p2);
    const wb1 = weatherStyleBonus(style1, weather);
    const wb2 = weatherStyleBonus(style2, weather);
    const wxNetAdv = clamp(wb1 - wb2, -1, 1);
    const wxEffects: string[] = [];
    if (weather.windSpeed > 20) wxEffects.push(`viento ${weather.windSpeed.toFixed(0)} km/h`);
    if (weather.humidity > 70)  wxEffects.push(`humedad ${weather.humidity}%`);
    if (weather.temp > 32)      wxEffects.push(`calor ${weather.temp.toFixed(0)}°C`);
    if (weather.temp < 12)      wxEffects.push(`frío ${weather.temp.toFixed(0)}°C`);
    const conditions = wxEffects.join(", ") || "condiciones normales";
    const hasData = Math.abs(wxNetAdv) >= 0.05;
    const favored = wxNetAdv > 0.05 ? playerLastName(input.player1Name) : wxNetAdv < -0.05 ? playerLastName(input.player2Name) : null;
    const explanation = favored
      ? `estilo ${style1 === (wxNetAdv > 0 ? style1 : style2) && wxNetAdv > 0 ? style1 : style2} de ${favored} favorecido por ${conditions}`
      : `condiciones climáticas neutras para ambos estilos`;

    rawFactors.push(makeFactorResult(
      "weather", `Clima (${conditions})`,
      `${style1}: ${wb1 >= 0 ? "+" : ""}${(wb1 * 100).toFixed(0)}pp`,
      `${style2}: ${wb2 >= 0 ? "+" : ""}${(wb2 * 100).toFixed(0)}pp`,
      wxNetAdv, 0.60, hasData, 0, explanation,
    ));
  })();

  // ─── Factor 9: TB + 3er set si partido igualado (5%) ─────
  // Este factor se calcula tras conocer el logit preliminar (factores 1-8)
  // para saber si el partido es "igualado". Por ahora calculamos sus datos
  // y decidimos si aplicarlo al final.
  const tbFactor = (() => {
    const tb1 = pat1?.tbStats, ds1 = pat1?.thirdSetStats;
    const tb2 = pat2?.tbStats, ds2 = pat2?.thirdSetStats;
    const p1TbRate  = tb1?.winRate ?? null;
    const p2TbRate  = tb2?.winRate ?? null;
    const p1DsRate  = ds1?.winRate ?? null;
    const p2DsRate  = ds2?.winRate ?? null;
    // Combinar: 60% TB + 40% set decisivo
    const combine = (tb: number | null, ds: number | null) => {
      if (tb != null && ds != null) return 0.6 * tb + 0.4 * ds;
      return tb ?? ds ?? null;
    };
    const p1Combined = combine(p1TbRate, p1DsRate);
    const p2Combined = combine(p2TbRate, p2DsRate);
    const p1TbM = tb1?.played ?? 0;
    const p2TbM = tb2?.played ?? 0;
    const hasData = (p1TbM >= MIN_MATCHES_FACTOR || p2TbM >= MIN_MATCHES_FACTOR);
    const rawAdv = rateToAdv(p1Combined, p2Combined);
    const favored = rawAdv > 0.05 ? playerLastName(input.player1Name) : rawAdv < -0.05 ? playerLastName(input.player2Name) : null;
    const explanation = favored
      ? `${favored} más fiable en tiebreaks y sets decisivos (${pctStr(rawAdv > 0 ? p1Combined : p2Combined)} combinado)`
      : `rendimiento similar en situaciones de presión`;

    const p1Label = [
      p1TbRate != null ? `TB ${pctStr(p1TbRate)} (${tb1!.played} TBs)` : null,
      p1DsRate != null ? `3er set ${pctStr(p1DsRate)} (${ds1!.played})` : null,
    ].filter(Boolean).join(", ") || "sin datos";

    const p2Label = [
      p2TbRate != null ? `TB ${pctStr(p2TbRate)} (${tb2!.played} TBs)` : null,
      p2DsRate != null ? `3er set ${pctStr(p2DsRate)} (${ds2!.played})` : null,
    ].filter(Boolean).join(", ") || "sin datos";

    return { rawAdv, hasData, dataCount: Math.min(p1TbM, p2TbM), p1Label, p2Label, explanation };
  })();

  // ─── Factor 10: Días de descanso (5%) ────────────────────
  (() => {
    const hasData = daysRest1 != null || daysRest2 != null;
    const s1 = restDaysScore(daysRest1);
    const s2 = restDaysScore(daysRest2);
    const rawAdv = clamp((s1 - s2) * 2, -1, 1);
    const formatRest = (d: number | null) => d == null ? "sin datos" : d === 0 ? "jugó hoy" : `${d}d descanso`;
    const favored = rawAdv > 0.05 ? playerLastName(input.player1Name) : rawAdv < -0.05 ? playerLastName(input.player2Name) : null;
    const explanation = favored
      ? `${favored} llega más descansado (${formatRest(rawAdv > 0 ? daysRest1 : daysRest2)} vs ${formatRest(rawAdv > 0 ? daysRest2 : daysRest1)})`
      : `descanso similar para ambos jugadores`;

    rawFactors.push(makeFactorResult(
      "rest_days", "Días de descanso",
      p1LastMatch ? `${formatRest(daysRest1)} (últ. ${p1LastMatch})` : "sin datos",
      p2LastMatch ? `${formatRest(daysRest2)} (últ. ${p2LastMatch})` : "sin datos",
      rawAdv, hasData ? 0.80 : 0.10,
      hasData, 0, explanation,
    ));
  })();

  // ─── Factor 11: Perfil táctico del matchup (8%) ──────────
  (() => {
    const score = matchupEarly.tacticalEdgeScore; // -10 a +10 desde perspectiva P1
    const rawAdv = clamp(score / 10, -1, 1);
    const hasData = Math.abs(score) >= 0.5; // solo contar si hay ventaja apreciable
    const favored = rawAdv > 0.05 ? playerLastName(input.player1Name) : rawAdv < -0.05 ? playerLastName(input.player2Name) : null;
    const explanation = favored
      ? `ventaja táctica de ${favored} por perfil de juego, armas y adaptación a la superficie`
      : `matchup tácticamente equilibrado`;
    rawFactors.push(makeFactorResult(
      "tactical_profile", "Perfil táctico del matchup",
      `score táctico P1: ${score >= 0 ? "+" : ""}${score.toFixed(1)}`,
      `score táctico P2: ${score <= 0 ? "+" : ""}${(-score).toFixed(1)}`,
      rawAdv,
      hasData ? 0.70 : 0.20,
      hasData, 0, explanation,
    ));
  })();

  // ─── Leer calibración aprendida ───────────────────────────
  const calibration = getCalibration();
  const calibrationMults: Record<string, number> = {};
  for (const [id, cal] of Object.entries(calibration)) {
    calibrationMults[id] = cal.weight_mult;
  }

  // ─── Calcular logit preliminar (sin factor 9 y 10) ────────
  const prelimFactors = rawFactors.filter((f) => !["tiebreak_3rdset", "rest_days"].includes(f.id));
  const prelimWeights = redistributeWeights(
    prelimFactors.map((f) => ({ id: f.id, hasData: f.hasData })),
    calibrationMults,
  );
  const prelimLogit = prelimFactors.reduce((sum, f) => {
    const w = prelimWeights[f.id] ?? 0;
    return sum + w * f.p1Advantage * LOGIT_SCALE;
  }, 0);
  const prelimProb = sigmoid(prelimLogit);

  // ─── Factor 9: aplicar solo si partido igualado (<= ±15pp del 50%) ──
  const isClose = Math.abs(prelimProb - 0.5) <= 0.15;
  rawFactors.push(makeFactorResult(
    "tiebreak_3rdset",
    "Tiebreaks y sets decisivos" + (!isClose ? " (partido no igualado)" : ""),
    tbFactor.p1Label,
    tbFactor.p2Label,
    tbFactor.rawAdv,
    tbFactor.hasData ? 0.82 : 0.10,
    tbFactor.hasData && isClose,
    tbFactor.dataCount,
    tbFactor.explanation,
  ));

  // ── 7. Redistribuir pesos finales (con calibración) ──────
  const effectiveWeights = redistributeWeights(
    rawFactors.map((f) => ({ id: f.id, hasData: f.hasData })),
    calibrationMults,
  );

  // ── 8. Calcular logit y probabilidad final ────────────────
  const totalLogit = rawFactors.reduce((sum, f) => {
    const w = effectiveWeights[f.id] ?? 0;
    return sum + w * f.p1Advantage * LOGIT_SCALE;
  }, 0);

  const p1Prob = sigmoid(totalLogit);

  // ── 8b. Ajustar probabilidad si hay baja confianza ────────
  const confAdjResult = adjustProbabilityForConfidence(
    p1Prob, conf1, conf2, p1RankEstimated, p2RankEstimated,
  );
  const finalProb = confAdjResult.wasAdjusted ? confAdjResult.adjustedProb : p1Prob;
  let winPct1 = Math.round(finalProb * 100);
  winPct1 = clamp(winPct1, 5, 95);
  const winPct2 = 100 - winPct1;

  // ── 9. Ensamblar FactorResult finales con pesos ───────────
  const allFactors: FactorResult[] = rawFactors.map((f) => ({
    ...f,
    baseWeight: BASE_WEIGHTS[f.id],
    effectiveWeight: effectiveWeights[f.id] ?? 0,
  }));

  // ── 10. Key patterns: top 3 por impacto real ─────────────
  const keyPatterns = [...allFactors]
    .filter((f) => f.hasData)
    .sort((a, b) => (b.magnitude * b.effectiveWeight * b.confidence) - (a.magnitude * a.effectiveWeight * a.confidence))
    .slice(0, 3);

  // ── 11. Confianza global ───────────────────────────────────
  const factorsWithData = allFactors.filter((f) => f.hasData);
  const avgConf = factorsWithData.length > 0
    ? factorsWithData.reduce((s, f) => s + f.confidence * f.effectiveWeight, 0)
      / factorsWithData.reduce((s, f) => s + f.effectiveWeight, 0)
    : 0;
  const confidence = Math.round(clamp(
    25 + avgConf * 55 + factorsWithData.length * 2
    + (h2h.total >= 3 ? 8 : 0)
    + ((pat1?.matchesUsed ?? 0) >= 20 ? 5 : 0)
    + ((pat2?.matchesUsed ?? 0) >= 20 ? 5 : 0),
    20, 95
  ));

  // ── 12. Razón principal ────────────────────────────────────
  const mainReason = buildMainReason(allFactors, input.player1Name, input.player2Name, winPct1);

  // ── 13. Reusar matchup calculado en 5c ────────────────────
  const matchup = matchupEarly;

  const topFactor = allFactors
    .filter((f) => f.hasData && f.effectiveWeight > 0)
    .sort((a, b) => (b.magnitude * b.effectiveWeight) - (a.magnitude * a.effectiveWeight))[0];

  // ── 13b. Datos específicos para narración completa ────────
  const todKey = (input.timeOfDay === "night" || input.timeOfDay === "evening" || input.timeOfDay === "day")
    ? input.timeOfDay as "day" | "evening" | "night"
    : null;

  const p1TimeOfDaySplit = todKey ? pat1?.timeOfDaySplits?.[todKey] ?? null : null;
  const p2TimeOfDaySplit = todKey ? pat2?.timeOfDaySplits?.[todKey] ?? null : null;

  const p1CourtData = pat1?.courtStats?.[input.tournament];
  const p2CourtData = pat2?.courtStats?.[input.tournament];
  const p1TourneyHistoryData = (p1CourtData?.split)
    ? { winRate: p1CourtData.split.winRate ?? null, matches: p1CourtData.split.matches ?? 0 }
    : null;
  const p2TourneyHistoryData = (p2CourtData?.split)
    ? { winRate: p2CourtData.split.winRate ?? null, matches: p2CourtData.split.matches ?? 0 }
    : null;

  const p1Streak = computeCurrentStreak(pat1?.recentForm);
  const p2Streak = computeCurrentStreak(pat2?.recentForm);

  let p1Insights: ReturnType<typeof getPlayerInsights> | null = null;
  let p2Insights: ReturnType<typeof getPlayerInsights> | null = null;
  try {
    p1Insights = getPlayerInsights(p1);
    p2Insights = getPlayerInsights(p2);
  } catch { /* insights no disponibles */ }

  let tacticalAnalysis: TacticalAnalysis | undefined;
  try {
    tacticalAnalysis = generateNarrative({
      p1Name: input.player1Name,
      p2Name: input.player2Name,
      p1Slug: p1,
      p2Slug: p2,
      tournament: input.tournament,
      tourneyLevel: input.tourneyLevel,
      surface: input.surface,
      round: input.round,
      timeOfDay: input.timeOfDay,
      isIndoor: input.indoor,
      courtSpeed: courtSpeed,
      courtProfile: csiProfile,
      weather: weather ? { temp: weather.temp, windSpeed: weather.windSpeed, humidity: weather.humidity, effect: weather.effect } : undefined,
      winPct1,
      winPct2,
      p1Rank: p1RankEstimated,
      p2Rank: p2RankEstimated,
      recentForm1: form1,
      recentForm2: form2,
      p1Streak,
      p2Streak,
      daysRest1,
      daysRest2,
      h2h,
      p1TimeOfDaySplit: p1TimeOfDaySplit ? { winRate: p1TimeOfDaySplit.winRate, matches: p1TimeOfDaySplit.matches } : null,
      p2TimeOfDaySplit: p2TimeOfDaySplit ? { winRate: p2TimeOfDaySplit.winRate, matches: p2TimeOfDaySplit.matches } : null,
      p1TourneyHistory: p1TourneyHistoryData,
      p2TourneyHistory: p2TourneyHistoryData,
      p1Patterns: pat1,
      p2Patterns: pat2,
      matchup,
      mainFactor: topFactor?.id,
      p1AccumulatedInsights: (p1Insights && p1Insights.matchCount > 0) ? p1Insights : null,
      p2AccumulatedInsights: (p2Insights && p2Insights.matchCount > 0) ? p2Insights : null,
    });
  } catch (e) {
    console.error("[engine] generateNarrative error:", (e as Error).message);
  }

  return {
    player1: { slug: p1, name: input.player1Name, winPct: winPct1 },
    player2: { slug: p2, name: input.player2Name, winPct: winPct2 },
    keyPatterns,
    allFactors,
    weather,
    h2h,
    confidence,
    courtModel: courtModel
      ? { speed: courtModel.court_speed, profile: courtModel.court_profile, name: courtModel.tourney_name }
      : undefined,
    mainReason,
    playerConfidence: {
      p1: conf1,
      p2: conf2,
      adjustmentNote: confAdjResult.adjustmentNote,
    },
    tacticalAnalysis,
  };
}
