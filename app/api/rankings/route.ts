// Rankings ATP — datos scrapeados el 2026-03-31, actualizables vía scraping
// Los códigos son los reales de atptour.com (extraídos de los URLs de cada jugador)

export interface ATPPlayer {
  rank: number;
  name: string;
  country: string; // emoji flag
  atpCode: string; // 4-char ATP code, e.g. "s0ag"
  photo: string;   // URL del proxy local /api/photo/[code]
  points: string;
}

// Mapa de códigos de bandera ATP (2-3 letras) → emoji
const FLAGS: Record<string, string> = {
  esp: "🇪🇸", ita: "🇮🇹", ger: "🇩🇪", srb: "🇷🇸", aus: "🇦🇺",
  can: "🇨🇦", usa: "🇺🇸", rus: "🇷🇺", kaz: "🇰🇿", nor: "🇳🇴",
  cze: "🇨🇿", fra: "🇫🇷", gbr: "🇬🇧", den: "🇩🇰", ned: "🇳🇱",
  arg: "🇦🇷", mon: "🇲🇨", bel: "🇧🇪", por: "🇵🇹", gre: "🇬🇷",
  hun: "🇭🇺", cro: "🇭🇷", per: "🇵🇪", bih: "🇧🇦", bul: "🇧🇬",
  aut: "🇦🇹", sui: "🇨🇭", chi: "🇨🇱", bra: "🇧🇷", pol: "🇵🇱",
  geo: "🇬🇪", uzb: "🇺🇿", svk: "🇸🇰", slo: "🇸🇮", col: "🇨🇴",
  ecu: "🇪🇨", uru: "🇺🇾", par: "🇵🇾",
};

// Top 100 ATP reales — ranking 31 marzo 2026 — extraídos de atptour.com
const STATIC_TOP100: ATPPlayer[] = [
  { rank:1,  name:"Carlos Alcaraz",               country: FLAGS.esp, atpCode:"a0e2", photo:"/api/photo/a0e2", points:"" },
  { rank:2,  name:"Jannik Sinner",                country: FLAGS.ita, atpCode:"s0ag", photo:"/api/photo/s0ag", points:"" },
  { rank:3,  name:"Alexander Zverev",             country: FLAGS.ger, atpCode:"z355", photo:"/api/photo/z355", points:"" },
  { rank:4,  name:"Novak Djokovic",               country: FLAGS.srb, atpCode:"d643", photo:"/api/photo/d643", points:"" },
  { rank:5,  name:"Lorenzo Musetti",              country: FLAGS.ita, atpCode:"m0ej", photo:"/api/photo/m0ej", points:"" },
  { rank:6,  name:"Alex de Minaur",               country: FLAGS.aus, atpCode:"dh58", photo:"/api/photo/dh58", points:"" },
  { rank:7,  name:"Felix Auger-Aliassime",        country: FLAGS.can, atpCode:"ag37", photo:"/api/photo/ag37", points:"" },
  { rank:8,  name:"Taylor Fritz",                 country: FLAGS.usa, atpCode:"fb98", photo:"/api/photo/fb98", points:"" },
  { rank:9,  name:"Ben Shelton",                  country: FLAGS.usa, atpCode:"s0s1", photo:"/api/photo/s0s1", points:"" },
  { rank:10, name:"Daniil Medvedev",              country: FLAGS.rus, atpCode:"mm58", photo:"/api/photo/mm58", points:"" },
  { rank:11, name:"Alexander Bublik",             country: FLAGS.kaz, atpCode:"bk92", photo:"/api/photo/bk92", points:"" },
  { rank:12, name:"Casper Ruud",                  country: FLAGS.nor, atpCode:"rh16", photo:"/api/photo/rh16", points:"" },
  { rank:13, name:"Flavio Cobolli",               country: FLAGS.ita, atpCode:"c0e9", photo:"/api/photo/c0e9", points:"" },
  { rank:14, name:"Jiri Lehecka",                 country: FLAGS.cze, atpCode:"l0bv", photo:"/api/photo/l0bv", points:"" },
  { rank:15, name:"Karen Khachanov",              country: FLAGS.rus, atpCode:"ke29", photo:"/api/photo/ke29", points:"" },
  { rank:16, name:"Andrey Rublev",                country: FLAGS.rus, atpCode:"re44", photo:"/api/photo/re44", points:"" },
  { rank:17, name:"Alejandro Davidovich Fokina",  country: FLAGS.esp, atpCode:"dh50", photo:"/api/photo/dh50", points:"" },
  { rank:18, name:"Frances Tiafoe",               country: FLAGS.usa, atpCode:"td51", photo:"/api/photo/td51", points:"" },
  { rank:19, name:"Luciano Darderi",              country: FLAGS.ita, atpCode:"d0fj", photo:"/api/photo/d0fj", points:"" },
  { rank:20, name:"Francisco Cerundolo",          country: FLAGS.arg, atpCode:"c0au", photo:"/api/photo/c0au", points:"" },
  { rank:21, name:"Tommy Paul",                   country: FLAGS.usa, atpCode:"pl56", photo:"/api/photo/pl56", points:"" },
  { rank:22, name:"Learner Tien",                 country: FLAGS.usa, atpCode:"t0ha", photo:"/api/photo/t0ha", points:"" },
  { rank:23, name:"Valentin Vacherot",            country: FLAGS.mon, atpCode:"va25", photo:"/api/photo/va25", points:"" },
  { rank:24, name:"Cameron Norrie",               country: FLAGS.gbr, atpCode:"n771", photo:"/api/photo/n771", points:"" },
  { rank:25, name:"Jack Draper",                  country: FLAGS.gbr, atpCode:"d0co", photo:"/api/photo/d0co", points:"" },
  { rank:26, name:"Jakub Mensik",                 country: FLAGS.cze, atpCode:"m0ni", photo:"/api/photo/m0ni", points:"" },
  { rank:27, name:"Arthur Rinderknech",           country: FLAGS.fra, atpCode:"rc91", photo:"/api/photo/rc91", points:"" },
  { rank:28, name:"Arthur Fils",                  country: FLAGS.fra, atpCode:"f0f1", photo:"/api/photo/f0f1", points:"" },
  { rank:29, name:"Holger Rune",                  country: FLAGS.den, atpCode:"r0dg", photo:"/api/photo/r0dg", points:"" },
  { rank:30, name:"Tallon Griekspoor",            country: FLAGS.ned, atpCode:"gj37", photo:"/api/photo/gj37", points:"" },
  { rank:31, name:"T.M. Etcheverry",              country: FLAGS.arg, atpCode:"ea24", photo:"/api/photo/ea24", points:"" },
  { rank:32, name:"Corentin Moutet",              country: FLAGS.fra, atpCode:"mw02", photo:"/api/photo/mw02", points:"" },
  { rank:33, name:"Brandon Nakashima",            country: FLAGS.usa, atpCode:"n0ae", photo:"/api/photo/n0ae", points:"" },
  { rank:34, name:"Ugo Humbert",                  country: FLAGS.fra, atpCode:"hh26", photo:"/api/photo/hh26", points:"" },
  { rank:35, name:"Alex Michelsen",               country: FLAGS.usa, atpCode:"m0qi", photo:"/api/photo/m0qi", points:"" },
  { rank:36, name:"Gabriel Diallo",               country: FLAGS.can, atpCode:"d0f6", photo:"/api/photo/d0f6", points:"" },
  { rank:37, name:"Jaume Munar",                  country: FLAGS.esp, atpCode:"mu94", photo:"/api/photo/mu94", points:"" },
  { rank:38, name:"Denis Shapovalov",             country: FLAGS.can, atpCode:"su55", photo:"/api/photo/su55", points:"" },
  { rank:39, name:"Alejandro Tabilo",             country: FLAGS.chi, atpCode:"te30", photo:"/api/photo/te30", points:"" },
  { rank:40, name:"Joao Fonseca",                 country: FLAGS.bra, atpCode:"f0fv", photo:"/api/photo/f0fv", points:"" },
  { rank:41, name:"Jenson Brooksby",              country: FLAGS.usa, atpCode:"b0cd", photo:"/api/photo/b0cd", points:"" },
  { rank:42, name:"Sebastian Korda",              country: FLAGS.usa, atpCode:"k0ah", photo:"/api/photo/k0ah", points:"" },
  { rank:43, name:"Adrian Mannarino",             country: FLAGS.fra, atpCode:"me82", photo:"/api/photo/me82", points:"" },
  { rank:44, name:"Terence Atmane",               country: FLAGS.fra, atpCode:"a0gc", photo:"/api/photo/a0gc", points:"" },
  { rank:45, name:"Alexei Popyrin",               country: FLAGS.aus, atpCode:"p09z", photo:"/api/photo/p09z", points:"" },
  { rank:46, name:"Zizou Bergs",                  country: FLAGS.bel, atpCode:"bu13", photo:"/api/photo/bu13", points:"" },
  { rank:47, name:"Fabian Marozsan",              country: FLAGS.hun, atpCode:"m0ci", photo:"/api/photo/m0ci", points:"" },
  { rank:48, name:"Nuno Borges",                  country: FLAGS.por, atpCode:"bt72", photo:"/api/photo/bt72", points:"" },
  { rank:49, name:"Stefanos Tsitsipas",           country: FLAGS.gre, atpCode:"te51", photo:"/api/photo/te51", points:"" },
  { rank:50, name:"Sebastian Baez",               country: FLAGS.arg, atpCode:"b0bi", photo:"/api/photo/b0bi", points:"" },
  { rank:51, name:"Marton Fucsovics",             country: FLAGS.hun, atpCode:"f724", photo:"/api/photo/f724", points:"" },
  { rank:52, name:"Daniel Altmaier",              country: FLAGS.ger, atpCode:"ae14", photo:"/api/photo/ae14", points:"" },
  { rank:53, name:"Kamil Majchrzak",              country: FLAGS.pol, atpCode:"mq75", photo:"/api/photo/mq75", points:"" },
  { rank:54, name:"Marin Cilic",                  country: FLAGS.cro, atpCode:"c977", photo:"/api/photo/c977", points:"" },
  { rank:55, name:"Tomas Machac",                 country: FLAGS.cze, atpCode:"m0fh", photo:"/api/photo/m0fh", points:"" },
  { rank:56, name:"Ethan Quinn",                  country: FLAGS.usa, atpCode:"q02l", photo:"/api/photo/q02l", points:"" },
  { rank:57, name:"G. Mpetshi-Perricard",         country: FLAGS.fra, atpCode:"m0gz", photo:"/api/photo/m0gz", points:"" },
  { rank:58, name:"Miomir Kecmanovic",            country: FLAGS.srb, atpCode:"ki95", photo:"/api/photo/ki95", points:"" },
  { rank:59, name:"Ignacio Buse",                 country: FLAGS.per, atpCode:"b0id", photo:"/api/photo/b0id", points:"" },
  { rank:60, name:"Mariano Navone",               country: FLAGS.arg, atpCode:"n0bs", photo:"/api/photo/n0bs", points:"" },
  { rank:61, name:"Yannick Hanfmann",             country: FLAGS.ger, atpCode:"h997", photo:"/api/photo/h997", points:"" },
  { rank:62, name:"Botic van de Zandschulp",      country: FLAGS.ned, atpCode:"v812", photo:"/api/photo/v812", points:"" },
  { rank:63, name:"Lorenzo Sonego",               country: FLAGS.ita, atpCode:"su87", photo:"/api/photo/su87", points:"" },
  { rank:64, name:"Reilly Opelka",                country: FLAGS.usa, atpCode:"o522", photo:"/api/photo/o522", points:"" },
  { rank:65, name:"Raphael Collignon",            country: FLAGS.bel, atpCode:"c0jp", photo:"/api/photo/c0jp", points:"" },
  { rank:66, name:"Marcos Giron",                 country: FLAGS.usa, atpCode:"gc88", photo:"/api/photo/gc88", points:"" },
  { rank:67, name:"Camilo Ugo Carabelli",         country: FLAGS.arg, atpCode:"u182", photo:"/api/photo/u182", points:"" },
  { rank:68, name:"Arthur Cazaux",                country: FLAGS.fra, atpCode:"c0h0", photo:"/api/photo/c0h0", points:"" },
  { rank:69, name:"J.M. Cerundolo",               country: FLAGS.arg, atpCode:"c0c8", photo:"/api/photo/c0c8", points:"" },
  { rank:70, name:"Vit Kopriva",                  country: FLAGS.cze, atpCode:"ki82", photo:"/api/photo/ki82", points:"" },
  { rank:71, name:"Valentin Royer",               country: FLAGS.fra, atpCode:"r0eb", photo:"/api/photo/r0eb", points:"" },
  { rank:72, name:"Hubert Hurkacz",               country: FLAGS.pol, atpCode:"hb71", photo:"/api/photo/hb71", points:"" },
  { rank:73, name:"Mattia Bellucci",              country: FLAGS.ita, atpCode:"b0gg", photo:"/api/photo/b0gg", points:"" },
  { rank:74, name:"Damir Dzumhur",                country: FLAGS.bih, atpCode:"d923", photo:"/api/photo/d923", points:"" },
  { rank:75, name:"Jan-Lennard Struff",           country: FLAGS.ger, atpCode:"sl28", photo:"/api/photo/sl28", points:"" },
  { rank:76, name:"Alexander Shevchenko",         country: FLAGS.kaz, atpCode:"s0h2", photo:"/api/photo/s0h2", points:"" },
  { rank:77, name:"R.A. Burruchaga",              country: FLAGS.arg, atpCode:"b0fv", photo:"/api/photo/b0fv", points:"" },
  { rank:78, name:"Sebastian Ofner",              country: FLAGS.aut, atpCode:"o513", photo:"/api/photo/o513", points:"" },
  { rank:79, name:"Eliot Spizzirri",              country: FLAGS.usa, atpCode:"s0ja", photo:"/api/photo/s0ja", points:"" },
  { rank:80, name:"Roberto Bautista Agut",        country: FLAGS.esp, atpCode:"bd06", photo:"/api/photo/bd06", points:"" },
  { rank:81, name:"Hamad Medjedovic",             country: FLAGS.srb, atpCode:"m0jf", photo:"/api/photo/m0jf", points:"" },
  { rank:82, name:"Zachary Svajda",               country: FLAGS.usa, atpCode:"s0k7", photo:"/api/photo/s0k7", points:"" },
  { rank:83, name:"T.A. Tirante",                 country: FLAGS.arg, atpCode:"t0a1", photo:"/api/photo/t0a1", points:"" },
  { rank:84, name:"Aleksandar Vukic",             country: FLAGS.aus, atpCode:"v832", photo:"/api/photo/v832", points:"" },
  { rank:85, name:"Aleksandar Kovacevic",         country: FLAGS.usa, atpCode:"k0az", photo:"/api/photo/k0az", points:"" },
  { rank:86, name:"Filip Misolic",                country: FLAGS.aut, atpCode:"m0jz", photo:"/api/photo/m0jz", points:"" },
  { rank:87, name:"Francisco Comesana",           country: FLAGS.arg, atpCode:"c0df", photo:"/api/photo/c0df", points:"" },
  { rank:88, name:"Pablo Carreno Busta",          country: FLAGS.esp, atpCode:"cd85", photo:"/api/photo/cd85", points:"" },
  { rank:89, name:"Rafael Jodar",                 country: FLAGS.esp, atpCode:"j0dz", photo:"/api/photo/j0dz", points:"" },
  { rank:90, name:"Quentin Halys",                country: FLAGS.fra, atpCode:"hb64", photo:"/api/photo/hb64", points:"" },
  { rank:91, name:"Matteo Berrettini",            country: FLAGS.ita, atpCode:"bk40", photo:"/api/photo/bk40", points:"" },
  { rank:92, name:"Alexander Blockx",             country: FLAGS.bel, atpCode:"b0pg", photo:"/api/photo/b0pg", points:"" },
  { rank:93, name:"Grigor Dimitrov",              country: FLAGS.bul, atpCode:"d875", photo:"/api/photo/d875", points:"" },
  { rank:94, name:"Alexandre Muller",             country: FLAGS.fra, atpCode:"mp20", photo:"/api/photo/mp20", points:"" },
  { rank:95, name:"James Duckworth",              country: FLAGS.aus, atpCode:"d994", photo:"/api/photo/d994", points:"" },
  { rank:96, name:"Patrick Kypson",               country: FLAGS.usa, atpCode:"k0a3", photo:"/api/photo/k0a3", points:"" },
  { rank:97, name:"Jacob Fearnley",               country: FLAGS.gbr, atpCode:"f0by", photo:"/api/photo/f0by", points:"" },
  { rank:98, name:"Stan Wawrinka",                country: FLAGS.sui, atpCode:"w367", photo:"/api/photo/w367", points:"" },
  { rank:99, name:"Jesper de Jong",               country: FLAGS.ned, atpCode:"d0c1", photo:"/api/photo/d0c1", points:"" },
  { rank:100,name:"Cristian Garin",               country: FLAGS.chi, atpCode:"gd64", photo:"/api/photo/gd64", points:"" },
];

// Caché en memoria — intentar scraping en vivo 1 vez por hora
let cache: { players: ATPPlayer[]; ts: number; source: string } | null = null;
const CACHE_MS = 60 * 60 * 1000;

function lastMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

function parseRankings(html: string): ATPPlayer[] {
  // Extrae pares flag-xxx / /en/players/slug/code/overview en orden de aparición
  const tokens = [...html.matchAll(/flag-([a-z]+)|\/en\/players\/[^/]+\/([a-z0-9]+)\/overview/g)];
  const players: ATPPlayer[] = [];
  let pendingFlag = "";

  for (const t of tokens) {
    if (t[1]) {
      pendingFlag = t[1]; // flag code
    } else if (t[2]) {
      const atpCode = t[2];
      if (players.some((p) => p.atpCode === atpCode)) continue; // deduplicar
      // Extraer nombre del jugador desde contexto del link
      const idx = t.index ?? 0;
      const before = html.slice(Math.max(0, idx - 300), idx + 300);
      const nameMatch = before.match(/class="lastName">([^<]+)<\/span>/);
      const nameMatch2 = before.match(/<span>([A-Z][a-z]+(?: [A-Z][a-z-]+)+)<\/span>/);
      const name = nameMatch?.[1]?.trim() ?? nameMatch2?.[1]?.trim() ?? atpCode;
      const rank = players.length + 1;
      if (rank > 100) break;
      players.push({
        rank,
        name,
        country: FLAGS[pendingFlag] ?? "🎾",
        atpCode,
        photo: `/api/photo/${atpCode}`,
        points: "",
      });
      pendingFlag = "";
    }
  }
  return players;
}

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_MS) {
    return Response.json({ players: cache.players, source: cache.source });
  }

  const rankDate = lastMonday();
  const url = `https://www.atptour.com/en/rankings/singles?rankDate=${rankDate}&rankRange=1-100`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://www.google.com/",
        "Cache-Control": "no-cache",
      },
      signal: AbortSignal.timeout(12_000),
    });

    if (!res.ok) throw new Error(`ATP HTTP ${res.status}`);

    const html = await res.text();
    const players = parseRankings(html);

    if (players.length >= 20) {
      cache = { players, ts: Date.now(), source: "live" };
      return Response.json({ players, source: "live" });
    }
    throw new Error(`Solo ${players.length} jugadores parseados`);
  } catch (err) {
    console.warn("[rankings] Usando datos estáticos:", (err as Error).message);
    cache = { players: STATIC_TOP100, ts: Date.now(), source: "static" };
    return Response.json({ players: STATIC_TOP100, source: "static" });
  }
}
