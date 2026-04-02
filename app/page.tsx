"use client";
import { useRef, useEffect, useState, useCallback } from "react";
import type { ATPPlayer } from "./api/rankings/route";
import type { ATPMatch } from "./api/matches/route";

// Torneos ATP principales (excluir challengers, UTR, futures)
function isMainATP(tournament: string) {
  const lower = tournament.toLowerCase();
  return !lower.includes("challenger") && !lower.includes("chall.") && !lower.includes("chall ")
    && !lower.includes("utr") && !lower.includes("itf") && !lower.includes("futures")
    && !lower.includes("miyazaki") && !lower.includes("barletta") && !lower.includes("menorca")
    && !lower.includes("sao leopoldo") && !lower.includes("san luis") && !lower.includes("pro tennis series");
}

const SURFACE_ES: Record<string, string> = {
  clay: "Tierra", hard: "Pista dura", grass: "Hierba",
  "indoor hard": "Indoor", carpet: "Moqueta", "": "—",
};
const SURFACE_COLOR: Record<string, string> = {
  clay: "#c97d47", hard: "#4a90d9", grass: "#5cb85c",
  "indoor hard": "#8e44ad", carpet: "#7f8c8d",
};

const PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='170' viewBox='0 0 140 170'%3E%3Crect width='140' height='170' fill='%230d1318'/%3E%3Ccircle cx='70' cy='60' r='28' fill='%23131a22'/%3E%3Cellipse cx='70' cy='130' rx='40' ry='25' fill='%23131a22'/%3E%3C/svg%3E";

// Genera SVG con iniciales como placeholder
function initialsPlaceholder(name: string): string {
  const parts = name.trim().split(/\s+/);
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='52' height='52' viewBox='0 0 52 52'><rect width='52' height='52' rx='26' fill='%23131a22'/><text x='26' y='33' text-anchor='middle' font-family='sans-serif' font-size='16' font-weight='600' fill='%23c8f135'>${initials}</text></svg>`;
  return `data:image/svg+xml,${svg}`;
}

// Extrae apellido de "Alcaraz C." o "Carlos Alcaraz"
function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  // Si el último token es una inicial (1-2 chars con punto), el apellido es el primero
  const last = parts[parts.length - 1];
  if (/^[A-Z]\.?$/.test(last)) return parts[0].toLowerCase();
  return last.toLowerCase();
}

// Componente que resuelve y muestra la foto de un jugador
function PlayerPhoto({
  name, slug, rankingMap, size = 52, style,
}: {
  name: string;
  slug: string;
  rankingMap: Map<string, string>; // lastName → photo URL
  size?: number;
  style?: React.CSSProperties;
}) {
  const [src, setSrc] = useState<string>(() => {
    const photo = rankingMap.get(lastName(name));
    return photo ?? "";
  });
  const [tried, setTried] = useState(false);

  // Si no está en rankings, pedir al API
  useEffect(() => {
    if (src || tried) return;
    setTried(true);
    fetch(`/api/player-photo/${encodeURIComponent(slug)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.photo) setSrc(d.photo); })
      .catch(() => {});
  }, [src, tried, slug]);

  const fallback = initialsPlaceholder(name);
  const imgSrc = src || fallback;

  return (
    <img
      src={imgSrc}
      alt={name}
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      style={{ borderRadius: "50%", objectFit: "cover", objectPosition: "top", background: "#131a22", flexShrink: 0, ...style }}
      onError={(e) => { (e.target as HTMLImageElement).src = fallback; }}
    />
  );
}

export default function Home() {
  const carouselRef = useRef<HTMLDivElement>(null);
  const [players, setPlayers] = useState<ATPPlayer[]>([]);
  const [rankSource, setRankSource] = useState<"live" | "static" | "">("");
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<ATPMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  // Map: lastName(lower) → photo URL — construido desde el ranking top 100
  const [rankingMap, setRankingMap] = useState<Map<string, string>>(new Map());

  const buildRankingMap = useCallback((ps: ATPPlayer[]) => {
    const m = new Map<string, string>();
    for (const p of ps) {
      // Nombre puede ser "Jannik Sinner" o "Carlos Alcaraz"
      const parts = p.name.trim().split(/\s+/);
      const last = parts[parts.length - 1].toLowerCase();
      m.set(last, p.photo);
    }
    setRankingMap(m);
  }, []);

  useEffect(() => {
    fetch("/api/rankings")
      .then((r) => r.json())
      .then((data) => {
        const ps: ATPPlayer[] = data.players ?? [];
        setPlayers(ps);
        setRankSource(data.source ?? "static");
        buildRankingMap(ps);
      })
      .catch(() => setPlayers([]))
      .finally(() => setLoading(false));

    fetch("/api/matches")
      .then((r) => r.json())
      .then((data) => {
        const all: ATPMatch[] = data.matches ?? [];
        setMatches(all.filter((m) => isMainATP(m.tournament)));
      })
      .catch(() => setMatches([]))
      .finally(() => setMatchesLoading(false));
  }, []);

  const scroll = (dir: "left" | "right") => {
    if (!carouselRef.current) return;
    carouselRef.current.scrollBy({ left: dir === "left" ? -400 : 400, behavior: "smooth" });
  };

  const tickerItems = matches.length > 0
    ? matches.map((m) => `${m.tournament}: ${m.player1} vs ${m.player2}`)
    : ["Cargando partidos ATP..."];

  return (
    <main className="min-h-screen bg-[#080c10] text-white overflow-x-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=Space+Mono:wght@400;700&display=swap');
        :root {
          --acid: #c8f135; --acid-dim: rgba(200,241,53,0.11);
          --bg: #080c10; --bg2: #0d1318; --bg3: #131a22;
          --border: rgba(255,255,255,0.07); --muted: rgba(255,255,255,0.38);
        }
        .fd{font-family:'Bebas Neue',cursive;} .fm{font-family:'Space Mono',monospace;} .fb{font-family:'DM Sans',sans-serif;}
        .glow{text-shadow:0 0 60px rgba(200,241,53,0.45);}
        .slabel{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:0.25em;text-transform:uppercase;color:var(--acid);}
        .ticker-wrap{background:var(--acid);overflow:hidden;white-space:nowrap;}
        .ticker{display:inline-block;animation:tick 55s linear infinite;font-family:'Space Mono',monospace;font-size:11px;font-weight:700;letter-spacing:0.12em;color:#080c10;}
        @keyframes tick{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
        nav{border-bottom:1px solid var(--border);background:rgba(8,12,16,0.95);backdrop-filter:blur(16px);position:sticky;top:0;z-index:50;}
        .nav-link{font-family:'Space Mono',monospace;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:var(--muted);transition:color 0.2s;}
        .nav-link:hover{color:white;}

        /* Carousel */
        .carousel{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;padding-bottom:8px;cursor:grab;}
        .carousel:active{cursor:grabbing;}
        .carousel::-webkit-scrollbar{display:none;}
        .p-card{flex-shrink:0;width:140px;scroll-snap-align:start;background:var(--bg2);border:1px solid var(--border);border-radius:14px;overflow:hidden;transition:all 0.3s;cursor:pointer;}
        .p-card:hover{border-color:rgba(200,241,53,0.3);transform:translateY(-3px);}
        .p-card img{width:100%;height:170px;object-fit:cover;object-position:top center;display:block;background:var(--bg3);}
        .p-card-skeleton{flex-shrink:0;width:140px;height:250px;border-radius:14px;background:linear-gradient(90deg,var(--bg2) 25%,var(--bg3) 50%,var(--bg2) 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;}
        @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
        .scroll-btn{width:36px;height:36px;border-radius:50%;background:var(--bg2);border:1px solid var(--border);color:white;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.2s;flex-shrink:0;}
        .scroll-btn:hover{border-color:var(--acid);color:var(--acid);}

        .match-card{background:var(--bg2);border:1px solid var(--border);border-radius:16px;transition:all 0.3s;overflow:hidden;cursor:pointer;}
        .match-card:hover{border-color:rgba(200,241,53,0.25);transform:translateY(-2px);box-shadow:0 8px 40px rgba(0,0,0,0.5);}
        .avatar{width:52px;height:52px;border-radius:50%;object-fit:cover;object-position:top;background:var(--bg3);border:2px solid var(--border);flex-shrink:0;}
        .bar-track{background:rgba(255,255,255,0.08);border-radius:999px;height:5px;overflow:hidden;}
        .bar-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--acid),#9ab82a);}
        .bar-dim{height:100%;border-radius:999px;background:rgba(255,255,255,0.18);}
        .tag{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;padding:3px 8px;border-radius:5px;background:var(--acid-dim);color:var(--acid);border:1px solid rgba(200,241,53,0.18);white-space:nowrap;}
        .tag-g{background:rgba(255,255,255,0.05);color:var(--muted);border-color:rgba(255,255,255,0.07);}
        .pct{font-family:'Bebas Neue',cursive;font-size:40px;line-height:1;}
        .insight-dot{width:5px;height:5px;border-radius:50%;background:var(--acid);flex-shrink:0;margin-top:5px;}
        .noise{background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.025'/%3E%3C/svg%3E");pointer-events:none;position:fixed;inset:0;z-index:999;}
      `}</style>

      <div className="noise" />

      {/* Ticker */}
      <div className="ticker-wrap py-1.5">
        <span className="ticker">
          {Array(3).fill(tickerItems.map((t) => `· ${t}`).join("    ") + "    ").join("")}
        </span>
      </div>

      {/* Nav */}
      <nav>
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="fd text-2xl tracking-wider glow" style={{ color: "var(--acid)" }}>ALLDATA</span>
            <span className="fd text-2xl tracking-wider">TENNIS</span>
          </div>
          <div className="hidden md:flex gap-8">
            {["Partidos", "Jugadores", "Torneos", "Análisis"].map((l) => (
              <a key={l} href="#" className="nav-link">{l}</a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--acid)" }} />
            <span className="fm text-xs" style={{ color: "var(--acid)" }}>LIVE</span>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 pt-14 pb-10" style={{ background: "linear-gradient(180deg,#0a0f14 0%,#080c10 100%)" }}>
        <div className="max-w-6xl mx-auto">
          <div className="slabel mb-4">Análisis automático · ATP Tour</div>
          <h1 className="fd leading-[0.92] mb-4 text-white" style={{ fontSize: "clamp(52px,7vw,88px)" }}>
            TODOS LOS PARTIDOS ATP.<br />
            <span style={{ color: "var(--acid)" }} className="glow">ANALIZADOS.</span>
          </h1>
          <p className="fb text-base leading-relaxed mb-10" style={{ color: "var(--muted)", maxWidth: "500px" }}>
            Patrones de jugadores, condiciones climáticas, superficie, turno y psicología — cruzados automáticamente para cada partido del día.
          </p>

          {/* Ranking carousel */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="slabel">Ranking ATP</div>
                {!loading && (
                  <span className="fm" style={{ fontSize: "9px", color: "var(--muted)", letterSpacing: "0.15em", textTransform: "uppercase" }}>
                    {rankSource === "live" ? (
                      <><span style={{ color: "var(--acid)" }}>●</span> En vivo · {players.length} jugadores</>
                    ) : (
                      <>● Top {players.length} · datos oficiales</>
                    )}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button className="scroll-btn" onClick={() => scroll("left")}>←</button>
                <button className="scroll-btn" onClick={() => scroll("right")}>→</button>
              </div>
            </div>

            <div className="carousel" ref={carouselRef}>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="p-card-skeleton" />
                ))
              ) : players.length === 0 ? (
                <div className="fm text-xs" style={{ color: "var(--muted)" }}>No se pudieron cargar los rankings.</div>
              ) : (
                players.map((p) => (
                  <a key={p.rank} href={`/player/${lastName(p.name)}`} className="p-card" style={{ textDecoration: "none", color: "inherit" }}>
                    <img
                      src={p.photo}
                      alt={p.name}
                      referrerPolicy="no-referrer"
                      onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER; }}
                    />
                    <div className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="fd text-2xl" style={{ color: "var(--acid)" }}>#{p.rank}</span>
                        <span className="text-base">{p.country}</span>
                      </div>
                      <div className="fb font-semibold text-sm leading-tight mb-1">{p.name}</div>
                      {p.points && (
                        <div className="fm text-[10px]" style={{ color: "var(--muted)" }}>{p.points} pts</div>
                      )}
                    </div>
                  </a>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Partidos */}
      <section className="px-6 py-12">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-end justify-between mb-6">
            <div>
              <div className="slabel mb-1.5">
                {new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </div>
              <h2 className="fd text-4xl tracking-wide">PARTIDOS ATP HOY</h2>
            </div>
            <div className="flex items-center gap-2 fm text-xs" style={{ color: "var(--muted)" }}>
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--acid)" }} />
              {matchesLoading ? "Cargando..." : `${matches.length} partidos · ATP singles`}
            </div>
          </div>

          {matchesLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-2xl h-24 p-card-skeleton" />
              ))}
            </div>
          ) : matches.length === 0 ? (
            <div className="fm text-sm" style={{ color: "var(--muted)" }}>No hay partidos ATP programados hoy.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {matches.map((m) => {
                const surfColor = SURFACE_COLOR[m.surface] ?? "rgba(255,255,255,0.2)";
                const surfLabel = SURFACE_ES[m.surface] ?? m.surface;
                const isFinished = m.status === "finished";
                const isLive = m.status === "live";
                return (
                  <div key={m.id} className="match-card" style={{ opacity: isFinished ? 0.6 : 1 }}>
                    <div className="p-5 flex flex-wrap items-center gap-4">

                      {/* Hora + estado */}
                      <div className="flex flex-col items-center" style={{ minWidth: 48 }}>
                        <span className="fd text-2xl" style={{ color: isLive ? "#c8f135" : isFinished ? "var(--muted)" : "white", lineHeight: 1 }}>
                          {m.time || "—"}
                        </span>
                        {isLive && <span className="fm text-[9px] tracking-widest" style={{ color: "#c8f135" }}>LIVE</span>}
                        {isFinished && <span className="fm text-[9px] tracking-widest" style={{ color: "var(--muted)" }}>FIN</span>}
                      </div>

                      {/* Jugadores */}
                      <a href={`/player/${m.player1Slug}`} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit", minWidth: 0 }}>
                        <PlayerPhoto name={m.player1} slug={m.player1Slug} rankingMap={rankingMap} size={52} />
                        <div className="fb font-semibold text-base leading-tight">{m.player1}</div>
                      </a>
                      <div className="fm text-[10px]" style={{ color: "var(--muted)", flexShrink: 0 }}>VS</div>
                      <a href={`/player/${m.player2Slug}`} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit", minWidth: 0 }}>
                        <PlayerPhoto name={m.player2} slug={m.player2Slug} rankingMap={rankingMap} size={52} style={{ opacity: 0.75 }} />
                        <div className="fb font-semibold text-base leading-tight" style={{ color: "rgba(255,255,255,0.6)" }}>{m.player2}</div>
                      </a>

                      {/* Torneo + ronda + superficie */}
                      <div className="flex flex-wrap gap-2 items-center ml-auto">
                        <span className="tag tag-g">{m.tournament}</span>
                        {m.round && <span className="tag tag-g">{m.round}</span>}
                        <span className="tag" style={{
                          background: `${surfColor}22`,
                          color: surfColor,
                          borderColor: `${surfColor}44`,
                        }}>{surfLabel}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="px-6 pb-16 border-t" style={{ borderColor: "var(--border)" }}>
        <div className="max-w-6xl mx-auto pt-12">
          <div className="slabel mb-2">Metodología</div>
          <h2 className="fd text-4xl tracking-wide mb-8">CÓMO FUNCIONA</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { n: "01", title: "Detección automática", desc: "Cada mañana el sistema detecta todos los partidos ATP programados del día en cualquier torneo activo." },
              { n: "02", title: "Cruce de patrones", desc: "Cruza los patrones de cada jugador — superficie, turno, clima, H2H, forma reciente y psicología — con las condiciones reales del partido." },
              { n: "03", title: "Porcentaje de victoria", desc: "Genera un porcentaje de victoria basado en datos objetivos. Se actualiza si cambian las condiciones antes del partido." },
            ].map((s, i) => (
              <div key={i} className="rounded-xl p-6" style={{ background: "var(--bg2)", border: "1px solid var(--border)" }}>
                <div className="fd text-5xl mb-3" style={{ color: "var(--acid)", opacity: 0.25 }}>{s.n}</div>
                <div className="fb font-semibold text-base mb-2">{s.title}</div>
                <div className="fb text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t px-6 py-8" style={{ borderColor: "var(--border)" }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <span className="fd text-xl" style={{ color: "var(--acid)" }}>ALLDATA</span>
            <span className="fd text-xl">TENNIS</span>
          </div>
          <div className="fm text-xs" style={{ color: "var(--muted)" }}>© 2026 · AI-powered tennis analytics</div>
        </div>
      </footer>
    </main>
  );
}
