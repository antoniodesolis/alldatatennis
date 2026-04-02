"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

function formatName(slug: string): string {
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function initialsPlaceholder(name: string): string {
  const parts = name.trim().split(/\s+/);
  const initials =
    parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><rect width='120' height='120' rx='60' fill='%23131a22'/><text x='60' y='78' text-anchor='middle' font-family='sans-serif' font-size='40' font-weight='600' fill='%23c8f135'>${initials}</text></svg>`;
  return `data:image/svg+xml,${svg}`;
}

const PATTERNS_SECTIONS = [
  { key: "surface", label: "Superficie", icon: "🎾", desc: "Win rate por superficie, evolución por temporada y rendimiento en condiciones específicas." },
  { key: "form", label: "Forma reciente", icon: "📈", desc: "Últimos 20 partidos, tendencia de sets, break points y estadísticas de saque/resto." },
  { key: "h2h", label: "H2H & rivales", icon: "⚔️", desc: "Historial cara a cara, patrones contra tipos de juego similares y rivales frecuentes." },
  { key: "psych", label: "Psicología & turno", icon: "🧠", desc: "Rendimiento diurno vs nocturno, partidos de 5 sets, tiebreaks y situaciones de presión." },
];

export default function PlayerPage() {
  const params = useParams();
  const slug = params.slug as string;
  const displayName = formatName(slug);

  const [photo, setPhoto] = useState<string>("");
  const [atpCode, setAtpCode] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/player-photo/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.photo) setPhoto(d.photo);
        if (d?.atpCode) setAtpCode(d.atpCode);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  const fallback = initialsPlaceholder(displayName);

  return (
    <main className="min-h-screen bg-[#080c10] text-white">
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
        nav{border-bottom:1px solid var(--border);background:rgba(8,12,16,0.95);backdrop-filter:blur(16px);position:sticky;top:0;z-index:50;}
        .pattern-card{background:var(--bg2);border:1px solid var(--border);border-radius:16px;padding:24px;transition:border-color 0.2s;}
        .pattern-card:hover{border-color:rgba(200,241,53,0.2);}
        .soon-badge{font-family:'Space Mono',monospace;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;padding:3px 8px;border-radius:4px;background:rgba(200,241,53,0.08);color:var(--acid);border:1px solid rgba(200,241,53,0.15);}
        .stat-skeleton{height:14px;border-radius:6px;background:linear-gradient(90deg,var(--bg2) 25%,var(--bg3) 50%,var(--bg2) 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;}
        @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
        .noise{background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.025'/%3E%3C/svg%3E");pointer-events:none;position:fixed;inset:0;z-index:999;}
        .back-btn{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:var(--muted);text-decoration:none;display:inline-flex;align-items:center;gap:8px;transition:color 0.2s;}
        .back-btn:hover{color:white;}
      `}</style>

      <div className="noise" />

      {/* Nav */}
      <nav>
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <a href="/" style={{ textDecoration: "none", color: "inherit" }} className="flex items-center gap-2">
            <span className="fd text-2xl tracking-wider glow" style={{ color: "var(--acid)" }}>ALLDATA</span>
            <span className="fd text-2xl tracking-wider">TENNIS</span>
          </a>
          <a href="/" className="back-btn">← Volver</a>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ background: "linear-gradient(180deg,#0a0f14 0%,#080c10 100%)" }}>
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="slabel mb-6">Ficha de jugador · ATP Tour</div>

          <div className="flex flex-col md:flex-row items-start gap-8">
            {/* Foto */}
            <div style={{ flexShrink: 0 }}>
              {loading ? (
                <div style={{ width: 140, height: 170, borderRadius: 16, background: "var(--bg3)", animation: "shimmer 1.4s infinite" }} />
              ) : (
                <img
                  src={photo || fallback}
                  alt={displayName}
                  width={140}
                  height={170}
                  referrerPolicy="no-referrer"
                  style={{ width: 140, height: 170, objectFit: "cover", objectPosition: "top", borderRadius: 16, background: "var(--bg3)", border: "1px solid var(--border)" }}
                  onError={(e) => { (e.target as HTMLImageElement).src = fallback; }}
                />
              )}
            </div>

            {/* Info */}
            <div className="flex flex-col justify-center" style={{ minWidth: 0 }}>
              <h1 className="fd leading-none mb-3 text-white" style={{ fontSize: "clamp(40px,6vw,72px)" }}>
                {displayName.toUpperCase()}
              </h1>

              <div className="flex flex-wrap items-center gap-3 mb-6">
                {atpCode && (
                  <span className="fm text-xs" style={{ color: "var(--muted)", letterSpacing: "0.1em" }}>
                    ATP CODE · <span style={{ color: "var(--acid)" }}>{atpCode.toUpperCase()}</span>
                  </span>
                )}
                <a
                  href={`https://www.atptour.com/en/players/${slug}/${atpCode}/overview`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="fm"
                  style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", textDecoration: "none", padding: "3px 10px", border: "1px solid var(--border)", borderRadius: 5, transition: "border-color 0.2s" }}
                >
                  ATP Tour ↗
                </a>
                <a
                  href={`https://www.tennisexplorer.com/player/${slug}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="fm"
                  style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", textDecoration: "none", padding: "3px 10px", border: "1px solid var(--border)", borderRadius: 5, transition: "border-color 0.2s" }}
                >
                  TennisExplorer ↗
                </a>
              </div>

              <p className="fb text-sm" style={{ color: "var(--muted)", maxWidth: 480, lineHeight: 1.7 }}>
                Los patrones de este jugador se analizarán automáticamente cruzando sus estadísticas de superficie, forma reciente, historial H2H y rendimiento psicológico en situaciones de presión.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Patrones — placeholders */}
      <section className="px-6 py-12 border-t" style={{ borderColor: "var(--border)" }}>
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-4 mb-8">
            <div>
              <div className="slabel mb-1">Análisis de patrones</div>
              <h2 className="fd text-4xl tracking-wide">FICHA DEL JUGADOR</h2>
            </div>
            <span className="soon-badge" style={{ marginLeft: "auto", alignSelf: "flex-start", marginTop: 4 }}>En desarrollo</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PATTERNS_SECTIONS.map((section) => (
              <div key={section.key} className="pattern-card">
                <div className="flex items-center gap-3 mb-3">
                  <span style={{ fontSize: 22 }}>{section.icon}</span>
                  <div>
                    <div className="fb font-semibold text-base">{section.label}</div>
                    <span className="soon-badge">Próximamente</span>
                  </div>
                </div>
                <p className="fb text-sm mb-4" style={{ color: "var(--muted)", lineHeight: 1.65 }}>
                  {section.desc}
                </p>
                {/* Skeleton lines simulating future stats */}
                <div className="flex flex-col gap-2">
                  <div className="stat-skeleton" style={{ width: "75%", opacity: 0.4 }} />
                  <div className="stat-skeleton" style={{ width: "55%", opacity: 0.25 }} />
                  <div className="stat-skeleton" style={{ width: "65%", opacity: 0.3 }} />
                </div>
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
