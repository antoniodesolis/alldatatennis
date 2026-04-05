/**
 * lib/ingest/chronicle-scraper.ts
 *
 * Busca y extrae texto de crónicas post-partido de fuentes públicas.
 * Intenta en orden:
 *   1. atptour.com (noticias del jugador)
 *   2. DuckDuckGo HTML search → primer artículo relevante encontrado
 *
 * Devuelve el texto limpio (sin HTML) listo para pasar a Claude.
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";
const TIMEOUT_MS = 12_000;

export interface ChronicleResult {
  url: string;
  source: string;
  text: string;          // texto extraído, max 6000 chars
}

// ── Extractor de texto ────────────────────────────────────

/** Elimina etiquetas HTML y limpia el texto. */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, " ")
    .replace(/\s{3,}/g, "  ")
    .trim();
}

/** Extrae el bloque de texto más denso de un HTML (artículo principal). */
function extractArticleText(html: string, maxChars = 6000): string {
  // Intentar extraer solo el cuerpo del artículo (entre <article>, <main>, <div class="article">)
  const articleMatch =
    html.match(/<article[\s\S]*?<\/article>/i)?.[0] ??
    html.match(/<main[\s\S]*?<\/main>/i)?.[0] ??
    html.match(/class="[^"]*(?:article|content|story|match-report)[^"]*"[\s\S]{0,50}>([\s\S]{200,8000}?)<\/(?:div|section|article)>/i)?.[1] ??
    html;

  const text = stripHtml(articleMatch);
  // Quedar con un bloque continuo relevante
  return text.slice(0, maxChars);
}

// ── Fuente 1: ATP Tour player news ───────────────────────

/**
 * Busca la noticia en la página de noticias del jugador en ATP Tour.
 * URL: /en/players/{slug}/{id}/news → lista artículos, luego buscamos uno del torneo/fecha.
 */
async function tryAtpTourPlayerNews(
  playerATPCode: string,
  playerSlug: string,
  opponentName: string,
  tournament: string,
  year: string,
): Promise<ChronicleResult | null> {
  if (!playerATPCode) return null;
  const newsUrl = `https://www.atptour.com/en/players/${playerSlug}/${playerATPCode}/news`;
  try {
    const res = await fetch(newsUrl, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Buscar links de artículos que mencionen el torneo o el oponente
    const linkPattern = /href="(\/en\/news\/[^"]+)"/g;
    const candidates: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = linkPattern.exec(html)) !== null) {
      const href = m[1].toLowerCase();
      if (
        href.includes(tournament.toLowerCase().split(" ")[0]) ||
        href.includes(year) ||
        href.includes(opponentName.toLowerCase().split(" ").pop()!)
      ) {
        candidates.push(`https://www.atptour.com${m[1]}`);
      }
    }
    if (candidates.length === 0) return null;

    // Fetch el primer candidato
    const articleRes = await fetch(candidates[0], {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!articleRes.ok) return null;
    const articleHtml = await articleRes.text();
    const text = extractArticleText(articleHtml);

    if (text.length < 200) return null;
    return { url: candidates[0], source: "atptour.com", text };
  } catch {
    return null;
  }
}

// ── Fuente 2: DuckDuckGo HTML search ─────────────────────

/**
 * Busca artículos via DuckDuckGo HTML (sin JS, más accesible que Google).
 * Devuelve URLs candidatas.
 */
async function duckduckgoSearch(query: string): Promise<string[]> {
  const encoded = encodeURIComponent(query);
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encoded}`;
  try {
    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const html = await res.text();

    // Extraer URLs de resultados (DDG usa uddg= como parámetro en los links)
    const urls: string[] = [];
    const pattern = /uddg=([^"&\s]+)/g;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(html)) !== null) {
      try {
        const url = decodeURIComponent(m[1]);
        if (url.startsWith("http") && !url.includes("duckduckgo.com")) {
          urls.push(url);
        }
      } catch { /* skip */ }
    }

    // También buscar en los href directos de resultados
    const hrefPattern = /href="(https?:\/\/(?!duckduckgo)[^"]+)"/g;
    while ((m = hrefPattern.exec(html)) !== null) {
      if (!urls.includes(m[1])) urls.push(m[1]);
    }

    return urls.slice(0, 10);
  } catch {
    return [];
  }
}

/** Puntúa la relevancia de una URL para una crónica de tenis. */
function scoreTennisUrl(url: string, p1: string, p2: string): number {
  const u = url.toLowerCase();
  let score = 0;
  // Fuentes de calidad preferidas
  if (u.includes("atptour.com")) score += 5;
  if (u.includes("tennis.com")) score += 3;
  if (u.includes("wtatennis.com")) score += 3;
  if (u.includes("tennishead.net")) score += 2;
  if (u.includes("eurosport")) score += 2;
  if (u.includes("espn.com")) score += 2;
  if (u.includes("bbc.co.uk/sport")) score += 2;
  if (u.includes("theguardian.com/sport")) score += 2;
  // Palabras relevantes en la URL
  if (u.includes("tennis")) score += 1;
  if (u.includes("match") || u.includes("result") || u.includes("report")) score += 1;
  // Nombres de jugadores
  const p1last = p1.toLowerCase().split(" ").pop() ?? "";
  const p2last = p2.toLowerCase().split(" ").pop() ?? "";
  if (p1last && u.includes(p1last)) score += 3;
  if (p2last && u.includes(p2last)) score += 3;
  // Penalizar redes sociales, wikis, etc.
  if (u.includes("twitter.com") || u.includes("facebook.com") || u.includes("wikipedia")) score -= 5;
  if (u.includes("youtube.com") || u.includes("reddit.com")) score -= 5;
  return score;
}

/** Fetch un artículo y extrae el texto. */
async function fetchArticle(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const text = extractArticleText(html);
    return text.length >= 250 ? text : null;
  } catch {
    return null;
  }
}

// ── API pública ───────────────────────────────────────────

export interface ChronicleParams {
  p1Name: string;
  p2Name: string;
  p1ATPCode?: string;
  p1Slug?: string;
  tournament: string;
  matchDate: string;       // YYYY-MM-DD
}

/**
 * Busca la crónica del partido.
 * Intenta varias fuentes y devuelve el primer resultado útil.
 */
export async function fetchMatchChronicle(
  params: ChronicleParams,
): Promise<ChronicleResult | null> {
  const { p1Name, p2Name, p1ATPCode, p1Slug, tournament, matchDate } = params;
  const year = matchDate.slice(0, 4);
  const p1last = p1Name.split(" ").pop() ?? p1Name;
  const p2last = p2Name.split(" ").pop() ?? p2Name;

  // Fuente 1: ATP Tour player news (si tenemos el código ATP)
  if (p1ATPCode && p1Slug) {
    const atpResult = await tryAtpTourPlayerNews(p1ATPCode, p1Slug, p2Name, tournament, year);
    if (atpResult) return atpResult;
  }

  // Fuente 2: DuckDuckGo search
  const query = `"${p1last}" "${p2last}" tennis ${tournament} ${year} match result`;
  const urls = await duckduckgoSearch(query);

  if (urls.length === 0) return null;

  // Ordenar por relevancia y probar los mejores 3
  const sorted = urls
    .map((u) => ({ url: u, score: scoreTennisUrl(u, p1Name, p2Name) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  for (const { url } of sorted) {
    const text = await fetchArticle(url);
    if (text) {
      const domain = new URL(url).hostname.replace("www.", "");
      return { url, source: domain, text };
    }
  }

  return null;
}
