"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { PlayerPatterns, SplitStat } from "../../../lib/analytics/patterns";

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

function pct(v: number | null | undefined, decimals = 0): string {
  if (v === null || v === undefined) return "—";
  return `${(v * 100).toFixed(decimals)}%`;
}

function num(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined) return "—";
  return v.toFixed(decimals);
}

// ── Stat bar ──────────────────────────────────────────────
function StatBar({ label, value, max, format }: {
  label: string; value: number | null | undefined;
  max: number; format?: (v: number) => string;
}) {
  const v = value ?? 0;
  const pctWidth = Math.min(100, (v / max) * 100);
  const display = format ? (value !== null && value !== undefined ? format(v) : "—") : num(value);
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="flex items-center justify-between mb-1">
        <span className="fb text-xs" style={{ color: "var(--muted)" }}>{label}</span>
        <span className="fm text-xs" style={{ color: value !== null && value !== undefined ? "white" : "var(--muted)" }}>{display}</span>
      </div>
      <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 999, height: 5 }}>
        <div style={{
          width: `${pctWidth}%`, height: "100%", borderRadius: 999,
          background: value !== null && value !== undefined
            ? "linear-gradient(90deg,#c8f135,#9ab82a)"
            : "rgba(255,255,255,0.15)",
          transition: "width 0.6s ease",
        }} />
      </div>
    </div>
  );
}

// ── Recent form badge ─────────────────────────────────────
function FormBadge({ result }: { result: string }) {
  const isW = result === "W";
  const isL = result === "L";
  return (
    <div style={{
      width: 24, height: 24, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
      background: isW ? "rgba(200,241,53,0.15)" : isL ? "rgba(255,80,80,0.12)" : "rgba(255,255,255,0.05)",
      border: `1px solid ${isW ? "rgba(200,241,53,0.3)" : isL ? "rgba(255,80,80,0.25)" : "rgba(255,255,255,0.1)"}`,
    }}>
      <span className="fm" style={{ fontSize: 9, color: isW ? "#c8f135" : isL ? "#ff6060" : "var(--muted)" }}>
        {result}
      </span>
    </div>
  );
}

// ── Surface pill ──────────────────────────────────────────
const SURFACE_COLOR: Record<string, string> = {
  clay: "#c97d47", hard: "#4a90d9", grass: "#5cb85c", "indoor hard": "#8e44ad",
};

interface PatternBlock {
  label: string;
  surface: string;
  data: PlayerPatterns | null;
}

export default function PlayerPage() {
  const params = useParams();
  const slug = params.slug as string;
  const displayName = formatName(slug);

  const [photo, setPhoto]       = useState<string>("");
  const [atpCode, setAtpCode]   = useState<string>("");
  const [photoLoading, setPhotoLoading] = useState(true);

  const [patterns, setPatterns] = useState<{
    all: PlayerPatterns | null;
    clay: PlayerPatterns | null;
    hard: PlayerPatterns | null;
    grass: PlayerPatterns | null;
  } | null>(null);
  const [patternsLoading, setPatternsLoading] = useState(true);
  const [totalMatches, setTotalMatches] = useState<number | null>(null);
  const [noData, setNoData] = useState(false);

  useEffect(() => {
    fetch(`/api/player-photo/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.photo) setPhoto(d.photo);
        if (d?.atpCode) setAtpCode(d.atpCode);
      })
      .catch(() => {})
      .finally(() => setPhotoLoading(false));

    // Stats (total de partidos en DB)
    fetch(`/api/player/${encodeURIComponent(slug)}/stats?limit=1`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.total !== undefined) setTotalMatches(d.total); })
      .catch(() => {});

    // Patrones
    fetch(`/api/player/${encodeURIComponent(slug)}/patterns?window=20`)
      .then((r) => {
        if (r.status === 404) { setNoData(true); return null; }
        return r.ok ? r.json() : null;
      })
      .then((d) => { if (d?.patterns) setPatterns(d.patterns); })
      .catch(() => {})
      .finally(() => setPatternsLoading(false));
  }, [slug]);

  const fallback = initialsPlaceholder(displayName);
  const all = patterns?.all;
  const activeSurface = all?.surfaceSplits;

  const surfaceBlocks: PatternBlock[] = [
    { label: "Tierra", surface: "clay", data: patterns?.clay ?? null },
    { label: "Pista dura", surface: "hard", data: patterns?.hard ?? null },
    { label: "Hierba", surface: "grass", data: patterns?.grass ?? null },
  ];

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
        .card{background:var(--bg2);border:1px solid var(--border);border-radius:16px;padding:24px;}
        .card:hover{border-color:rgba(200,241,53,0.15);}
        .skeleton{border-radius:6px;background:linear-gradient(90deg,var(--bg2) 25%,var(--bg3) 50%,var(--bg2) 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;}
        @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
        .noise{background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.025'/%3E%3C/svg%3E");pointer-events:none;position:fixed;inset:0;z-index:999;}
        .big-stat{font-family:'Bebas Neue',cursive;font-size:36px;line-height:1;color:var(--acid);}
        .tag{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;padding:3px 8px;border-radius:5px;background:var(--acid-dim);color:var(--acid);border:1px solid rgba(200,241,53,0.18);}
        .soon-badge{font-family:'Space Mono',monospace;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;padding:3px 8px;border-radius:4px;background:rgba(200,241,53,0.08);color:var(--acid);border:1px solid rgba(200,241,53,0.15);}
      `}</style>

      <div className="noise" />

      {/* Nav */}
      <nav>
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <a href="/" style={{ textDecoration: "none", color: "inherit" }} className="flex items-center gap-2">
            <span className="fd text-2xl tracking-wider glow" style={{ color: "var(--acid)" }}>ALLDATA</span>
            <span className="fd text-2xl tracking-wider">TENNIS</span>
          </a>
          <a href="/" className="fm" style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--muted)", textDecoration: "none" }}>← Volver</a>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ background: "linear-gradient(180deg,#0a0f14 0%,#080c10 100%)" }}>
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="slabel mb-6">Ficha de jugador · ATP Tour</div>

          <div className="flex flex-col md:flex-row items-start gap-8">
            {/* Foto */}
            <div style={{ flexShrink: 0 }}>
              {photoLoading ? (
                <div className="skeleton" style={{ width: 140, height: 170, borderRadius: 16 }} />
              ) : (
                <img
                  src={photo || fallback}
                  alt={displayName}
                  width={140} height={170}
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

              <div className="flex flex-wrap items-center gap-3 mb-4">
                {atpCode && (
                  <span className="fm text-xs" style={{ color: "var(--muted)", letterSpacing: "0.1em" }}>
                    ATP · <span style={{ color: "var(--acid)" }}>{atpCode.toUpperCase()}</span>
                  </span>
                )}
                {totalMatches !== null && (
                  <span className="tag">{totalMatches} partidos en DB</span>
                )}
                {atpCode && (
                  <a href={`https://www.atptour.com/en/players/${slug}/${atpCode}/overview`}
                    target="_blank" rel="noopener noreferrer"
                    className="fm" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", textDecoration: "none", padding: "3px 10px", border: "1px solid var(--border)", borderRadius: 5 }}>
                    ATP Tour ↗
                  </a>
                )}
                <a href={`https://www.tennisexplorer.com/player/${slug}/`}
                  target="_blank" rel="noopener noreferrer"
                  className="fm" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", textDecoration: "none", padding: "3px 10px", border: "1px solid var(--border)", borderRadius: 5 }}>
                  TennisExplorer ↗
                </a>
              </div>

              {/* Win rate general */}
              {all && (
                <div className="flex gap-6 mt-2">
                  <div>
                    <div className="slabel mb-1">Win rate</div>
                    <div className="big-stat">{pct(all.winRate)}</div>
                    <div className="fb text-xs mt-1" style={{ color: "var(--muted)" }}>{all.wins}V · {all.losses}D · últ. {all.matchesUsed} partidos</div>
                  </div>
                  {all.firstServePct && (
                    <div>
                      <div className="slabel mb-1">1er saque</div>
                      <div className="big-stat">{pct(all.firstServePct)}</div>
                      <div className="fb text-xs mt-1" style={{ color: "var(--muted)" }}>entrada</div>
                    </div>
                  )}
                  {all.avgAces !== null && (
                    <div>
                      <div className="slabel mb-1">Aces/partido</div>
                      <div className="big-stat">{num(all.avgAces)}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Patrones */}
      <section className="px-6 py-12 border-t" style={{ borderColor: "var(--border)" }}>
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="slabel mb-1">Análisis estadístico · últimos 20 partidos</div>
              <h2 className="fd text-4xl tracking-wide">PATRONES DEL JUGADOR</h2>
            </div>
            {noData && !patternsLoading && (
              <span className="soon-badge">Sin datos históricos aún — ingesta CSV pendiente</span>
            )}
          </div>

          {patternsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1,2,3,4].map((i) => (
                <div key={i} className="skeleton" style={{ height: 200, borderRadius: 16 }} />
              ))}
            </div>
          ) : noData ? (
            <div className="card" style={{ maxWidth: 540 }}>
              <div className="fb font-semibold mb-2">Sin datos históricos para este jugador</div>
              <p className="fb text-sm" style={{ color: "var(--muted)", lineHeight: 1.7 }}>
                Inicia la ingesta del CSV histórico de Sackmann desde la ruta de administración:
              </p>
              <code className="fm text-xs block mt-3 p-3" style={{ background: "var(--bg3)", borderRadius: 8, color: "var(--acid)" }}>
                curl -X POST http://localhost:3000/api/admin/ingest-csv \<br/>
                &nbsp;&nbsp;-H "Content-Type: application/json" \<br/>
                &nbsp;&nbsp;-d '{`{"years":[2023,2024],"charting":true}`}'
              </code>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Servicio */}
              <div className="card">
                <div className="flex items-center gap-2 mb-5">
                  <span style={{ fontSize: 20 }}>🎾</span>
                  <div className="fb font-semibold text-base">Servicio</div>
                </div>
                <StatBar label="1er saque %" value={all?.firstServePct} max={1} format={(v) => pct(v)} />
                <StatBar label="Pts ganados con 1er saque" value={all?.firstServeWonPct} max={1} format={(v) => pct(v)} />
                <StatBar label="Pts ganados con 2do saque" value={all?.secondServeWonPct} max={1} format={(v) => pct(v)} />
                <StatBar label="Break points salvados" value={all?.bpSavePct} max={1} format={(v) => pct(v)} />
                <StatBar label="Aces / partido" value={all?.avgAces} max={20} format={(v) => v.toFixed(1)} />
                <StatBar label="Dobles faltas / partido" value={all?.avgDoubleFaults} max={10} format={(v) => v.toFixed(1)} />
              </div>

              {/* Forma reciente */}
              <div className="card">
                <div className="flex items-center gap-2 mb-5">
                  <span style={{ fontSize: 20 }}>📈</span>
                  <div className="fb font-semibold text-base">Forma reciente · últimos {all?.recentForm?.length ?? 10}</div>
                </div>
                {all?.recentForm && (
                  <div className="flex gap-1.5 flex-wrap mb-5">
                    {all.recentForm.map((r, i) => <FormBadge key={i} result={r} />)}
                  </div>
                )}
                <StatBar label="Win rate general" value={all?.winRate} max={1} format={(v) => pct(v)} />
                {all?.avgWinners != null && (
                  <StatBar label="Winners / partido" value={all.avgWinners} max={40} format={(v) => v.toFixed(1)} />
                )}
                {all?.avgUnforced != null && (
                  <StatBar label="No forzados / partido" value={all.avgUnforced} max={40} format={(v) => v.toFixed(1)} />
                )}
                <div className="fb text-xs mt-3" style={{ color: "var(--muted)" }}>
                  Basado en {all?.matchesUsed} partidos · {all?.wins}V {all?.losses}D
                </div>
              </div>

              {/* Por superficie */}
              <div className="card">
                <div className="flex items-center gap-2 mb-5">
                  <span style={{ fontSize: 20 }}>🏟️</span>
                  <div className="fb font-semibold text-base">Rendimiento por superficie</div>
                </div>
                {surfaceBlocks.map(({ label, surface, data }) => {
                  const color = SURFACE_COLOR[surface] ?? "rgba(255,255,255,0.4)";
                  const wr = data?.winRate;
                  const m  = data?.matchesUsed ?? 0;
                  return (
                    <div key={surface} className="flex items-center gap-3 mb-4">
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="fb text-xs" style={{ color: "var(--muted)" }}>{label}</span>
                          <span className="fm text-xs" style={{ color: wr != null ? "white" : "var(--muted)" }}>
                            {wr != null ? pct(wr) : "—"} {m > 0 ? `(${m}p)` : ""}
                          </span>
                        </div>
                        <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 999, height: 4 }}>
                          <div style={{ width: wr != null ? `${wr * 100}%` : "0%", height: "100%", borderRadius: 999, background: color, opacity: 0.8, transition: "width 0.6s ease" }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Duración del partido */}
              <div className="card">
                <div className="flex items-center gap-2 mb-5">
                  <span style={{ fontSize: 20 }}>⏱️</span>
                  <div>
                    <div className="fb font-semibold text-base">Duración del partido</div>
                    <div className="fb text-xs" style={{ color: "var(--muted)" }}>corto &lt;80 min · medio 80-150 · largo &gt;150</div>
                  </div>
                </div>
                {(["short","medium","long"] as const).map((cat) => {
                  const labels = { short: "Corto (<80 min)", medium: "Medio (80-150 min)", long: "Largo (>150 min)" };
                  const colors = { short: "#c8f135", medium: "#4a90d9", long: "#c97d47" };
                  const split: SplitStat | undefined = all?.durationSplits?.[cat];
                  const wr = split?.winRate;
                  const m  = split?.matches ?? 0;
                  return (
                    <div key={cat} className="flex items-center gap-3 mb-4">
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: colors[cat], flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="fb text-xs" style={{ color: "var(--muted)" }}>{labels[cat]}</span>
                          <span className="fm text-xs" style={{ color: wr != null ? "white" : "var(--muted)" }}>
                            {wr != null ? pct(wr) : "—"} {m > 0 ? `(${m}p)` : ""}
                          </span>
                        </div>
                        <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 999, height: 4 }}>
                          <div style={{ width: wr != null ? `${wr * 100}%` : "0%", height: "100%", borderRadius: 999, background: colors[cat], opacity: 0.75, transition: "width 0.6s ease" }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className="fb text-xs mt-1" style={{ color: "var(--muted)" }}>
                  Indica si el jugador rinde mejor en partidos rápidos o en maratones.
                </div>
              </div>

              {/* Hora del partido */}
              <div className="card">
                <div className="flex items-center gap-2 mb-5">
                  <span style={{ fontSize: 20 }}>🌙</span>
                  <div>
                    <div className="fb font-semibold text-base">Hora del partido</div>
                    <div className="fb text-xs" style={{ color: "var(--muted)" }}>día &lt;17h · tarde 17-21h · noche &gt;21h</div>
                  </div>
                </div>
                {(["day","evening","night"] as const).map((tod) => {
                  const labels = { day: "Día (<17:00)", evening: "Tarde (17-21h)", night: "Noche (>21h)" };
                  const colors = { day: "#f5c518", evening: "#e8834a", night: "#7b68ee" };
                  const split: SplitStat | undefined = all?.timeOfDaySplits?.[tod];
                  const wr = split?.winRate;
                  const m  = split?.matches ?? 0;
                  return (
                    <div key={tod} className="flex items-center gap-3 mb-4">
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: colors[tod], flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="fb text-xs" style={{ color: "var(--muted)" }}>{labels[tod]}</span>
                          <span className="fm text-xs" style={{ color: wr != null ? "white" : "var(--muted)" }}>
                            {wr != null ? pct(wr) : "—"} {m > 0 ? `(${m}p)` : ""}
                          </span>
                        </div>
                        <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 999, height: 4 }}>
                          <div style={{ width: wr != null ? `${wr * 100}%` : "0%", height: "100%", borderRadius: 999, background: colors[tod], opacity: 0.75, transition: "width 0.6s ease" }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className="fb text-xs mt-1" style={{ color: "var(--muted)" }}>
                  Disponible para partidos con hora registrada. Histórico Sackmann sin hora.
                </div>
              </div>

              {/* Estilo del rival */}
              <div className="card md:col-span-2">
                <div className="flex items-center gap-2 mb-5">
                  <span style={{ fontSize: 20 }}>🧠</span>
                  <div>
                    <div className="fb font-semibold text-base">Win rate por estilo de rival</div>
                    <div className="fb text-xs" style={{ color: "var(--muted)" }}>No es lo mismo ganar a Baez (defensor) que a Bublik (big server)</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {([
                    { key: "big-server",           label: "Big server",           color: "#e74c3c", icon: "💥" },
                    { key: "aggressive-baseliner", label: "Baseliner agresivo",   color: "#e67e22", icon: "🔥" },
                    { key: "all-court",            label: "All-court",            color: "#c8f135", icon: "⚡" },
                    { key: "counter-puncher",      label: "Defensor / retriever", color: "#3498db", icon: "🛡️" },
                    { key: "baseliner",            label: "Baseliner estándar",   color: "#95a5a6", icon: "🎾" },
                  ] as const).map(({ key, label, color, icon }) => {
                    const split: SplitStat | undefined = all?.opponentStyleSplits?.[key];
                    const wr = split?.winRate;
                    const m  = split?.matches ?? 0;
                    return (
                      <div key={key} style={{ background: "var(--bg3)", borderRadius: 12, padding: "14px 16px", border: "1px solid var(--border)" }}>
                        <div className="flex items-center gap-2 mb-2">
                          <span style={{ fontSize: 14 }}>{icon}</span>
                          <span className="fb text-xs font-semibold">{label}</span>
                        </div>
                        <div className="fd" style={{ fontSize: 28, color: wr != null ? color : "var(--muted)", lineHeight: 1 }}>
                          {wr != null ? pct(wr) : "—"}
                        </div>
                        <div className="fb text-xs mt-1" style={{ color: "var(--muted)" }}>
                          {m > 0 ? `${m} partidos` : "sin datos"}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="fb text-xs mt-4" style={{ color: "var(--muted)", lineHeight: 1.65 }}>
                  Clasificación basada en el estilo declarado de cada jugador. Se actualiza con cada nuevo partido registrado.
                </div>
              </div>

              {/* Presión y eficiencia */}
              <div className="card">
                <div className="flex items-center gap-2 mb-5">
                  <span style={{ fontSize: 20 }}>⚔️</span>
                  <div className="fb font-semibold text-base">Presión y eficiencia</div>
                </div>
                <StatBar label="Break points salvados %" value={all?.bpSavePct} max={1} format={(v) => pct(v)} />
                {all != null && all.avgWinners != null && all.avgUnforced != null && all.avgUnforced > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="fb text-xs" style={{ color: "var(--muted)" }}>Ratio winners/no forzados</span>
                      <span className="fm text-xs" style={{ color: "white" }}>
                        {num(all.avgWinners / all.avgUnforced, 2)}
                      </span>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 999, height: 5 }}>
                      <div style={{ width: `${Math.min(100, (all.avgWinners / all.avgUnforced) / 2 * 100)}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg,#c8f135,#9ab82a)" }} />
                    </div>
                  </div>
                )}
                <div className="fb text-xs mt-4 leading-relaxed" style={{ color: "var(--muted)" }}>
                  H2H directos disponibles próximamente cuando se acumulen suficientes partidos en DB.
                </div>
              </div>

            </div>
          )}
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
