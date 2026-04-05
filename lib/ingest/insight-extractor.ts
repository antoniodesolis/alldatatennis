/**
 * lib/ingest/insight-extractor.ts
 *
 * Llama a la Claude API (via fetch directo, sin SDK) para extraer
 * insights tácticos estructurados de crónicas de partidos o del marcador.
 *
 * Requiere: ANTHROPIC_API_KEY en las variables de entorno.
 */

import type { MatchPattern } from "../analytics/match-pattern";
import { matchPatternLabel, winnerInsightFromPattern, loserInsightFromPattern } from "../analytics/match-pattern";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001"; // Haiku: rápido y barato para extracción

export interface MatchInsights {
  matchDynamics: string;            // cómo se desarrolló el partido (2-3 frases)
  keyMoments: string[];             // momentos decisivos (max 3)
  winnerTactical: {
    patterns: string[];             // patrones observados
    weaponObserved: string | null;  // qué arma funcionó
    mentalNote: string | null;      // nota mental/presión
  };
  loserTactical: {
    patterns: string[];
    weaknessObserved: string | null; // qué se explotó
  };
  surfaceNote: string | null;        // si la superficie fue factor
  confidence: "high" | "medium" | "low"; // confianza en los insights (high=desde crónica, low=inferido)
}

// ── Llamada a la API ──────────────────────────────────────

async function callClaude(prompt: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      console.error(`Claude API error ${res.status}: ${await res.text()}`);
      return null;
    }

    const data = await res.json() as {
      content: Array<{ type: string; text: string }>;
    };
    return data.content?.[0]?.text ?? null;
  } catch (err) {
    console.error("Claude API fetch error:", err);
    return null;
  }
}

// ── Extracción desde crónica (texto rico) ─────────────────

const CHRONICLE_PROMPT = (
  winnerName: string,
  loserName: string,
  tournament: string,
  surface: string,
  score: string,
  text: string,
) => `
Eres un analista de tenis experto. Lee esta crónica del partido ${winnerName} vs ${loserName} (${tournament}, ${surface}, ${score}) y extrae insights tácticos.

CRÓNICA:
${text.slice(0, 4000)}

Responde SOLO con un JSON válido con esta estructura exacta (sin texto adicional):
{
  "matchDynamics": "descripción de 2-3 frases de cómo se desarrolló el partido",
  "keyMoments": ["momento 1 (max 15 palabras)", "momento 2", "momento 3"],
  "winnerTactical": {
    "patterns": ["patrón táctico 1 observado", "patrón 2"],
    "weaponObserved": "arma clave que funcionó o null",
    "mentalNote": "nota sobre presión/mentalidad o null"
  },
  "loserTactical": {
    "patterns": ["patrón del perdedor"],
    "weaknessObserved": "debilidad explotada o null"
  },
  "surfaceNote": "si la superficie fue factor o null"
}
`;

// ── Extracción inferida desde marcador ────────────────────

const INFERRED_PROMPT = (
  winnerName: string,
  loserName: string,
  tournament: string,
  surface: string,
  score: string,
  pattern: MatchPattern,
  patternLabel: string,
) => `
Eres un analista de tenis experto. Solo tienes el marcador del partido: ${winnerName} derrotó a ${loserName} ${score} en ${tournament} (${surface}).

El análisis del marcador clasifica este como un partido de tipo: ${patternLabel}

Basándote en este tipo de partido, el marcador, la superficie (${surface}) y lo que sabes de estos jugadores, genera insights tácticos inferidos.

Responde SOLO con JSON válido (sin texto adicional):
{
  "matchDynamics": "descripción breve inferida de cómo fue el partido (2 frases, usa 'probablemente' o 'sugiere')",
  "keyMoments": ["insight inferido del marcador 1", "insight inferido 2"],
  "winnerTactical": {
    "patterns": ["patrón inferido del tipo de victoria"],
    "weaponObserved": "arma que probablemente decidió según el tipo o null",
    "mentalNote": "nota mental inferida o null"
  },
  "loserTactical": {
    "patterns": ["patrón inferido del perdedor"],
    "weaknessObserved": "debilidad probable o null"
  },
  "surfaceNote": "cómo la superficie probablemente influyó o null"
}
`;

// ── API pública ───────────────────────────────────────────

export async function extractInsightsFromChronicle(
  winnerName: string,
  loserName: string,
  tournament: string,
  surface: string,
  score: string,
  chronicleText: string,
): Promise<MatchInsights | null> {
  const prompt = CHRONICLE_PROMPT(winnerName, loserName, tournament, surface, score, chronicleText);
  const raw = await callClaude(prompt);
  if (!raw) return null;

  try {
    // Extraer solo el JSON si hay texto adicional
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as Omit<MatchInsights, "confidence">;
    return { ...parsed, confidence: "high" };
  } catch {
    return null;
  }
}

export async function extractInsightsFromScore(
  winnerName: string,
  loserName: string,
  tournament: string,
  surface: string,
  score: string,
  pattern: MatchPattern,
): Promise<MatchInsights | null> {
  // Si no hay API key, construir insights básicos desde el patrón sin llamar a Claude
  if (!process.env.ANTHROPIC_API_KEY) {
    return buildFallbackInsights(winnerName, loserName, surface, score, pattern);
  }

  const prompt = INFERRED_PROMPT(
    winnerName, loserName, tournament, surface, score, pattern, matchPatternLabel(pattern),
  );
  const raw = await callClaude(prompt);
  if (!raw) return buildFallbackInsights(winnerName, loserName, surface, score, pattern);

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return buildFallbackInsights(winnerName, loserName, surface, score, pattern);
    const parsed = JSON.parse(jsonMatch[0]) as Omit<MatchInsights, "confidence">;
    return { ...parsed, confidence: "medium" };
  } catch {
    return buildFallbackInsights(winnerName, loserName, surface, score, pattern);
  }
}

/** Construye insights mínimos sin llamar a Claude (fallback desde el patrón). */
function buildFallbackInsights(
  winnerName: string,
  loserName: string,
  surface: string,
  score: string,
  pattern: MatchPattern,
): MatchInsights {
  const winnerInsight = winnerInsightFromPattern(pattern);
  const loserInsight  = loserInsightFromPattern(pattern);

  return {
    matchDynamics: matchPatternLabel(pattern),
    keyMoments: [],
    winnerTactical: {
      patterns: winnerInsight ? [winnerInsight] : [],
      weaponObserved: null,
      mentalNote: pattern === "remontada" ? "demostró capacidad de remontada" :
                  pattern === "batalla"   ? "sólido en puntos decisivos" : null,
    },
    loserTactical: {
      patterns: loserInsight ? [loserInsight] : [],
      weaknessObserved: null,
    },
    surfaceNote: null,
    confidence: "low",
  };
}
