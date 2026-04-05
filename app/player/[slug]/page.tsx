"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type {
  PlayerPatterns, SplitStat, TbStats, DecidingSetStats,
  OpponentRankSplits, Streaks,
} from "../../../lib/analytics/patterns";
import type { CourtProfile } from "../../../lib/analytics/court-speed";

// ── Utils ─────────────────────────────────────────────────

/** Strip TE hash suffix (e.g. "-d58ed") before displaying or fetching */
function canonicalizeSlug(slug: string): string {
  return slug.replace(/-[0-9a-f]{5}$/i, "");
}

function formatName(slug: string): string {
  // Strip hash suffix before formatting for display
  return canonicalizeSlug(slug).split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
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
  if (v == null) return "—";
  return `${(v * 100).toFixed(decimals)}%`;
}

function num(v: number | null | undefined, decimals = 1): string {
  if (v == null) return "—";
  return v.toFixed(decimals);
}

// ── Sub-components ────────────────────────────────────────

function StatBar({ label, value, max, format }: {
  label: string; value: number | null | undefined;
  max: number; format?: (v: number) => string;
}) {
  const v = value ?? 0;
  const pctWidth = Math.min(100, (v / max) * 100);
  const display = format ? (value != null ? format(v) : "—") : num(value);
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="flex items-center justify-between mb-1">
        <span className="fb text-xs" style={{ color: "var(--muted)" }}>{label}</span>
        <span className="fm text-xs" style={{ color: value != null ? "white" : "var(--muted)" }}>{display}</span>
      </div>
      <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 999, height: 5 }}>
        <div style={{
          width: `${pctWidth}%`, height: "100%", borderRadius: 999,
          background: value != null
            ? "linear-gradient(90deg,#c8f135,#9ab82a)"
            : "rgba(255,255,255,0.15)",
          transition: "width 0.6s ease",
        }} />
      </div>
    </div>
  );
}

function SplitRow({ label, split, color = "#c8f135" }: { label: string; split: SplitStat | undefined; color?: string }) {
  const wr = split?.winRate;
  const m = split?.matches ?? 0;
  return (
    <div className="flex items-center gap-3 mb-3">
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div className="flex items-center justify-between mb-1">
          <span className="fb text-xs" style={{ color: "var(--muted)" }}>{label}</span>
          <span className="fm text-xs" style={{ color: wr != null ? "white" : "var(--muted)" }}>
            {wr != null ? pct(wr) : "—"}{m > 0 ? ` (${m}p)` : ""}
          </span>
        </div>
        <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 999, height: 4 }}>
          <div style={{ width: wr != null ? `${wr * 100}%` : "0%", height: "100%", borderRadius: 999, background: color, opacity: 0.8, transition: "width 0.6s ease" }} />
        </div>
      </div>
    </div>
  );
}

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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "var(--bg3)", borderRadius: 10, padding: "12px 14px", border: "1px solid var(--border)" }}>
      <div className="fb text-xs mb-1" style={{ color: "var(--muted)" }}>{label}</div>
      <div className="fd" style={{ fontSize: 26, color: "var(--acid)", lineHeight: 1 }}>{value}</div>
    </div>
  );
}

// ── Tab types ─────────────────────────────────────────────

const TABS = ["Resumen", "Superficie", "Ronda & Torneo", "Servicio", "Presión", "Rivales"] as const;
type Tab = typeof TABS[number];

// ── Main component ────────────────────────────────────────

export default function PlayerPage() {
  const params = useParams();
  const rawSlug = params.slug as string;
  // Strip TE hash suffix (e.g. "griekspoor-d58ed" → "griekspoor")
  const slug = canonicalizeSlug(rawSlug);
  const displayName = formatName(slug);

  const [photo, setPhoto]     = useState<string>("");
  const [atpCode, setAtpCode] = useState<string>("");
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

  const [activeTab, setActiveTab] = useState<Tab>("Resumen");

  useEffect(() => {
    fetch(`/api/player-photo/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.photo) setPhoto(d.photo);
        if (d?.atpCode) setAtpCode(d.atpCode);
      })
      .catch(() => {})
      .finally(() => setPhotoLoading(false));

    fetch(`/api/player/${encodeURIComponent(slug)}/stats?limit=1`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.total !== undefined) setTotalMatches(d.total); })
      .catch(() => {});

    fetch(`/api/player/${encodeURIComponent(slug)}/patterns?window=30`)
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

  const surfaceBlocks = [
    { label: "Tierra",     surface: "clay",  data: patterns?.clay  ?? null, color: "#c97d47" },
    { label: "Pista dura", surface: "hard",  data: patterns?.hard  ?? null, color: "#4a90d9" },
    { label: "Hierba",     surface: "grass", data: patterns?.grass ?? null, color: "#5cb85c" },
  ];

  const streaks: Streaks | undefined = all?.streaks;
  const currentStreak = streaks?.current ?? 0;
  const streakLabel = currentStreak > 0
    ? `+${currentStreak} victorias`
    : currentStreak < 0
    ? `${Math.abs(currentStreak)} derrotas`
    : "—";
  const streakColor = currentStreak > 0 ? "#c8f135" : currentStreak < 0 ? "#ff6060" : "var(--muted)";

  return (
    <main className="min-h-screen bg-[#080c10] text-white">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=Space+Mono:wght@400;700&display=swap');
        :root {
          --acid:#c8f135;--acid-dim:rgba(200,241,53,0.11);
          --bg:#080c10;--bg2:#0d1318;--bg3:#131a22;
          --border:rgba(255,255,255,0.07);--muted:rgba(255,255,255,0.38);
        }
        .fd{font-family:'Bebas Neue',cursive;}
        .fm{font-family:'Space Mono',monospace;}
        .fb{font-family:'DM Sans',sans-serif;}
        .glow{text-shadow:0 0 60px rgba(200,241,53,0.45);}
        .slabel{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:0.25em;text-transform:uppercase;color:var(--acid);}
        nav{border-bottom:1px solid var(--border);background:rgba(8,12,16,0.95);backdrop-filter:blur(16px);position:sticky;top:0;z-index:50;}
        .card{background:var(--bg2);border:1px solid var(--border);border-radius:16px;padding:24px;}
        .skeleton{border-radius:6px;background:linear-gradient(90deg,var(--bg2) 25%,var(--bg3) 50%,var(--bg2) 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;}
        @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
        .noise{background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.025'/%3E%3C/svg%3E");pointer-events:none;position:fixed;inset:0;z-index:999;}
        .big-stat{font-family:'Bebas Neue',cursive;font-size:36px;line-height:1;color:var(--acid);}
        .tag{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;padding:3px 8px;border-radius:5px;background:var(--acid-dim);color:var(--acid);border:1px solid rgba(200,241,53,0.18);}
        .tab-btn{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;padding:7px 14px;border-radius:8px;border:1px solid transparent;cursor:pointer;transition:all .2s;white-space:nowrap;}
        .tab-btn.active{background:var(--acid-dim);color:var(--acid);border-color:rgba(200,241,53,0.25);}
        .tab-btn:not(.active){color:var(--muted);background:transparent;}
        .tab-btn:not(.active):hover{color:rgba(255,255,255,0.7);border-color:var(--border);}
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
                <img src={photo || fallback} alt={displayName} width={140} height={170}
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
              <div className="flex flex-wrap items-center gap-3 mb-5">
                {atpCode && (
                  <span className="fm text-xs" style={{ color: "var(--muted)", letterSpacing: "0.1em" }}>
                    ATP · <span style={{ color: "var(--acid)" }}>{atpCode.toUpperCase()}</span>
                  </span>
                )}
                {totalMatches !== null && <span className="tag">{totalMatches} partidos en DB</span>}
                {atpCode && (
                  <a href={`https://www.atptour.com/en/players/${slug}/${atpCode}/overview`}
                    target="_blank" rel="noopener noreferrer" className="fm"
                    style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", textDecoration: "none", padding: "3px 10px", border: "1px solid var(--border)", borderRadius: 5 }}>
                    ATP Tour ↗
                  </a>
                )}
                <a href={`https://www.tennisexplorer.com/player/${slug}/`}
                  target="_blank" rel="noopener noreferrer" className="fm"
                  style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", textDecoration: "none", padding: "3px 10px", border: "1px solid var(--border)", borderRadius: 5 }}>
                  TennisExplorer ↗
                </a>
              </div>

              {/* KPIs principales */}
              {all && (
                <div className="flex flex-wrap gap-6">
                  <div>
                    <div className="slabel mb-1">Win rate</div>
                    <div className="big-stat">{pct(all.winRate)}</div>
                    <div className="fb text-xs mt-1" style={{ color: "var(--muted)" }}>{all.wins}V · {all.losses}D · {all.matchesUsed}p · últ. 24 meses</div>
                  </div>
                  {all.firstServePct != null && (
                    <div>
                      <div className="slabel mb-1">1er saque</div>
                      <div className="big-stat">{pct(all.firstServePct)}</div>
                    </div>
                  )}
                  {all.avgAces != null && (
                    <div>
                      <div className="slabel mb-1">Aces/partido</div>
                      <div className="big-stat">{num(all.avgAces)}</div>
                    </div>
                  )}
                  {all.avgDuration != null && (
                    <div>
                      <div className="slabel mb-1">Duración media</div>
                      <div className="big-stat">{Math.round(all.avgDuration)}<span className="fb" style={{ fontSize: 14, marginLeft: 3 }}>min</span></div>
                    </div>
                  )}
                  {currentStreak !== 0 && (
                    <div>
                      <div className="slabel mb-1">Racha actual</div>
                      <div className="fd" style={{ fontSize: 32, lineHeight: 1, color: streakColor }}>{streakLabel}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Tabs + contenido */}
      <section className="px-6 py-10 border-t" style={{ borderColor: "var(--border)" }}>
        <div className="max-w-6xl mx-auto">

          {/* Tab bar */}
          {!noData && !patternsLoading && all && (
            <div className="flex gap-2 flex-wrap mb-8" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
              {TABS.map((tab) => (
                <button key={tab} className={`tab-btn ${activeTab === tab ? "active" : ""}`}
                  onClick={() => setActiveTab(tab)}>
                  {tab}
                </button>
              ))}
            </div>
          )}

          {patternsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1,2,3,4].map((i) => <div key={i} className="skeleton" style={{ height: 200, borderRadius: 16 }} />)}
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
            <>
              {/* ── TAB: Resumen ── */}
              {activeTab === "Resumen" && all && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  {/* Forma reciente */}
                  <div className="card">
                    <div className="fb font-semibold text-base mb-4">Forma reciente · últimos {all.recentForm?.length ?? 10} partidos</div>
                    {all.recentForm && (
                      <div className="flex gap-1.5 flex-wrap mb-5">
                        {all.recentForm.map((r, i) => <FormBadge key={i} result={r} />)}
                      </div>
                    )}
                    <StatBar label="Win rate general" value={all.winRate} max={1} format={(v) => pct(v)} />
                    <div className="grid grid-cols-2 gap-3 mt-4">
                      <MiniStat label="Victorias" value={String(all.wins)} />
                      <MiniStat label="Derrotas" value={String(all.losses)} />
                      {all.streaks && <MiniStat label="Racha ganadora más larga" value={`${all.streaks.longestWin}p`} />}
                      {all.streaks && <MiniStat label="Racha perdedora más larga" value={`${all.streaks.longestLoss}p`} />}
                    </div>
                  </div>

                  {/* Servicio resumen */}
                  <div className="card">
                    <div className="fb font-semibold text-base mb-4">Servicio · resumen</div>
                    <StatBar label="1er saque %" value={all.firstServePct} max={1} format={(v) => pct(v)} />
                    <StatBar label="Pts ganados con 1er saque" value={all.firstServeWonPct} max={1} format={(v) => pct(v)} />
                    <StatBar label="Pts ganados con 2do saque" value={all.secondServeWonPct} max={1} format={(v) => pct(v)} />
                    <div className="grid grid-cols-2 gap-3 mt-4">
                      <MiniStat label="Aces / partido" value={num(all.avgAces)} />
                      <MiniStat label="Dobles faltas / p." value={num(all.avgDoubleFaults)} />
                    </div>
                  </div>

                  {/* Surface mini */}
                  <div className="card">
                    <div className="fb font-semibold text-base mb-4">Rendimiento por superficie</div>
                    {surfaceBlocks.map(({ label, surface, data, color }) => {
                      const split: SplitStat | undefined = data
                        ? { matches: data.matchesUsed, winRate: data.winRate, wins: data.wins, losses: data.losses }
                        : undefined;
                      return <SplitRow key={surface} label={label} split={split} color={color} />;
                    })}
                  </div>

                  {/* TB + sets decisivos */}
                  <div className="card">
                    <div className="fb font-semibold text-base mb-4">Momentos decisivos</div>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {all.tbStats && <MiniStat label="Tiebreaks ganados" value={all.tbStats.played > 0 ? `${all.tbStats.won}/${all.tbStats.played}` : "—"} />}
                      {all.tbStats && <MiniStat label="Win rate en TB" value={pct(all.tbStats.winRate)} />}
                      {all.thirdSetStats && <MiniStat label="3er set jugado/ganado" value={all.thirdSetStats.played > 0 ? `${all.thirdSetStats.won}/${all.thirdSetStats.played}` : "—"} />}
                      {all.thirdSetStats && <MiniStat label="Win rate 3er set" value={pct(all.thirdSetStats.winRate)} />}
                      {all.fifthSetStats && all.fifthSetStats.played > 0 && <MiniStat label="5to set jugado/ganado" value={`${all.fifthSetStats.won}/${all.fifthSetStats.played}`} />}
                      {all.fifthSetStats && all.fifthSetStats.played > 0 && <MiniStat label="Win rate 5to set" value={pct(all.fifthSetStats.winRate)} />}
                    </div>
                  </div>
                </div>
              )}

              {/* ── TAB: Superficie ── */}
              {activeTab === "Superficie" && all && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  {/* Por superficie (detalle) */}
                  <div className="card md:col-span-2">
                    <div className="fb font-semibold text-base mb-5">Win rate por superficie</div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {surfaceBlocks.map(({ label, surface, data, color }) => {
                        const wr = data?.winRate;
                        return (
                          <div key={surface} style={{ background: "var(--bg3)", borderRadius: 12, padding: "16px 18px", border: "1px solid var(--border)" }}>
                            <div className="flex items-center gap-2 mb-3">
                              <div style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
                              <span className="fb font-semibold text-sm">{label}</span>
                            </div>
                            <div className="fd" style={{ fontSize: 40, color: wr != null ? color : "var(--muted)", lineHeight: 1 }}>{pct(wr)}</div>
                            <div className="fb text-xs mt-1" style={{ color: "var(--muted)" }}>
                              {data?.wins ?? 0}V · {data?.losses ?? 0}D · {data?.matchesUsed ?? 0}p
                            </div>
                            {data && <div className="mt-3">
                              <StatBar label="1er saque %" value={data.firstServePct} max={1} format={(v) => pct(v)} />
                              <StatBar label="BP salvados" value={data.bpSavePct} max={1} format={(v) => pct(v)} />
                            </div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Indoor vs outdoor */}
                  <div className="card">
                    <div className="fb font-semibold text-base mb-4">Indoor vs Outdoor</div>
                    <SplitRow label="Indoor" split={all.indoorSplits?.indoor} color="#8e44ad" />
                    <SplitRow label="Outdoor" split={all.indoorSplits?.outdoor} color="#c8f135" />
                  </div>

                  {/* Hora del partido */}
                  <div className="card">
                    <div className="fb font-semibold text-base mb-1">Hora del partido</div>
                    <div className="fb text-xs mb-4" style={{ color: "var(--muted)" }}>día &lt;17h · tarde 17-21h · noche &gt;21h</div>
                    <SplitRow label="Día (<17:00)" split={all.timeOfDaySplits?.day} color="#f5c518" />
                    <SplitRow label="Tarde (17-21h)" split={all.timeOfDaySplits?.evening} color="#e8834a" />
                    <SplitRow label="Noche (>21h)" split={all.timeOfDaySplits?.night} color="#7b68ee" />
                  </div>

                  {/* Duración */}
                  <div className="card">
                    <div className="fb font-semibold text-base mb-1">Duración del partido</div>
                    <div className="fb text-xs mb-4" style={{ color: "var(--muted)" }}>corto &lt;80 min · medio 80-150 · largo &gt;150</div>
                    <SplitRow label="Corto (<80 min)" split={all.durationSplits?.short} color="#c8f135" />
                    <SplitRow label="Medio (80-150 min)" split={all.durationSplits?.medium} color="#4a90d9" />
                    <SplitRow label="Largo (>150 min)" split={all.durationSplits?.long} color="#c97d47" />
                    {all.avgDuration != null && (
                      <div className="mt-3 grid grid-cols-1 gap-2">
                        <MiniStat label="Duración media" value={`${Math.round(all.avgDuration)} min`} />
                      </div>
                    )}
                  </div>
                  {/* Court speed splits */}
                  {all.courtSpeedSplits && (
                    <div className="card md:col-span-2">
                      <div className="fb font-semibold text-base mb-1">Rendimiento por velocidad de pista</div>
                      <div className="fb text-xs mb-4" style={{ color: "var(--muted)" }}>
                        Basado en el Court Speed Index calculado por torneo (2022-2024). No toda la arcilla es igual — Madrid 42/100, Monte Carlo 21/100, Barcelona 11/100.
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        {([
                          { key: "fast",       label: "Rápida",       sub: "≥65",  color: "#e74c3c" },
                          { key: "mediumFast", label: "Media-rápida", sub: "45-64", color: "#e67e22" },
                          { key: "medium",     label: "Media",        sub: "25-44", color: "#f5c518" },
                          { key: "slow",       label: "Lenta",        sub: "<25",   color: "#4a90d9" },
                        ] as const).map(({ key, label, sub, color }) => {
                          const split = all.courtSpeedSplits![key];
                          const wr = split?.winRate;
                          return (
                            <div key={key} style={{ background: "var(--bg3)", borderRadius: 12, padding: "14px 16px", border: "1px solid var(--border)" }}>
                              <div className="flex items-center gap-2 mb-1">
                                <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                                <span className="fb text-xs font-semibold">{label}</span>
                                <span className="fm" style={{ fontSize: 9, color: "var(--muted)" }}>{sub}</span>
                              </div>
                              <div className="fd" style={{ fontSize: 32, color: wr != null ? color : "var(--muted)", lineHeight: 1 }}>{pct(wr)}</div>
                              <div className="fb text-xs mt-1" style={{ color: "var(--muted)" }}>
                                {split?.matches > 0 ? `${split.wins}V ${split.losses}D (${split.matches}p)` : "sin datos"}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Per-tournament stats */}
                  {all.courtStats && Object.keys(all.courtStats).length > 0 && (
                    <div className="card md:col-span-2">
                      <div className="fb font-semibold text-base mb-1">Win rate por torneo</div>
                      <div className="fb text-xs mb-4" style={{ color: "var(--muted)" }}>Solo torneos con ≥5 partidos registrados en el período</div>
                      <div className="grid grid-cols-1 gap-2">
                        {Object.entries(all.courtStats)
                          .sort((a, b) => b[1].split.matches - a[1].split.matches)
                          .map(([name, { speed, profile, split }]) => {
                            const PROFILE_COLOR: Record<string, string> = {
                              fast: "#e74c3c", "medium-fast": "#e67e22",
                              medium: "#f5c518", "medium-slow": "#c8f135", slow: "#4a90d9",
                            };
                            const color = PROFILE_COLOR[profile] ?? "#95a5a6";
                            return (
                              <div key={name} className="flex items-center gap-3" style={{ background: "var(--bg3)", borderRadius: 8, padding: "10px 14px" }}>
                                <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <span className="fb text-sm">{name}</span>
                                  {speed >= 0 && <span className="fm ml-2" style={{ fontSize: 9, color: "var(--muted)" }}>CSI {speed}</span>}
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="fb text-xs" style={{ color: "var(--muted)" }}>{split.wins}V-{split.losses}D</span>
                                  <div className="fd" style={{ fontSize: 20, color: split.winRate != null ? color : "var(--muted)", minWidth: 42, textAlign: "right" }}>
                                    {pct(split.winRate)}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB: Ronda & Torneo ── */}
              {activeTab === "Ronda & Torneo" && all && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  {/* Por ronda */}
                  <div className="card">
                    <div className="fb font-semibold text-base mb-4">Win rate por ronda</div>
                    {all.roundSplits && Object.entries(all.roundSplits).map(([rnd, split]) => {
                      const labels: Record<string, string> = {
                        R128: "1ª ronda (R128)", R64: "2ª ronda (R64)", R32: "3ª ronda (R32)",
                        R16: "Octavos (R16)", QF: "Cuartos de final", SF: "Semifinal", F: "Final",
                        RR: "Round Robin", BR: "Bronce",
                      };
                      return (
                        <SplitRow key={rnd} label={labels[rnd] ?? rnd} split={split} color="#c8f135" />
                      );
                    })}
                    {(!all.roundSplits || Object.keys(all.roundSplits).length === 0) && (
                      <div className="fb text-sm" style={{ color: "var(--muted)" }}>Sin datos de ronda disponibles.</div>
                    )}
                  </div>

                  {/* Por nivel */}
                  <div className="card">
                    <div className="fb font-semibold text-base mb-4">Win rate por nivel de torneo</div>
                    {(["grand-slam", "masters-1000", "atp-500", "atp-250", "atp-finals", "other"] as const).map((lvl) => {
                      const split = all.levelSplits?.[lvl];
                      if (!split || split.matches === 0) return null;
                      const labels: Record<string, string> = {
                        "grand-slam": "Grand Slam", "masters-1000": "Masters 1000",
                        "atp-500": "ATP 500", "atp-250": "ATP 250",
                        "atp-finals": "ATP Finals", "other": "Otros",
                      };
                      const colors: Record<string, string> = {
                        "grand-slam": "#f5c518", "masters-1000": "#e74c3c",
                        "atp-500": "#4a90d9", "atp-250": "#5cb85c",
                        "atp-finals": "#c8f135", "other": "#95a5a6",
                      };
                      return (
                        <SplitRow key={lvl} label={labels[lvl]} split={split} color={colors[lvl]} />
                      );
                    })}
                    {(!all.levelSplits || Object.keys(all.levelSplits).length === 0) && (
                      <div className="fb text-sm" style={{ color: "var(--muted)" }}>Sin datos de nivel de torneo disponibles.</div>
                    )}
                  </div>
                </div>
              )}

              {/* ── TAB: Servicio ── */}
              {activeTab === "Servicio" && all && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  <div className="card">
                    <div className="fb font-semibold text-base mb-4">Estadísticas de saque</div>
                    <StatBar label="1er saque %" value={all.firstServePct} max={1} format={(v) => pct(v)} />
                    <StatBar label="Pts ganados con 1er saque" value={all.firstServeWonPct} max={1} format={(v) => pct(v)} />
                    <StatBar label="Pts ganados con 2do saque" value={all.secondServeWonPct} max={1} format={(v) => pct(v)} />
                    <div className="grid grid-cols-2 gap-3 mt-5">
                      <MiniStat label="Aces / partido" value={num(all.avgAces)} />
                      <MiniStat label="Dobles faltas / p." value={num(all.avgDoubleFaults)} />
                    </div>
                  </div>

                  <div className="card">
                    <div className="fb font-semibold text-base mb-4">Break points</div>
                    <StatBar label="BP salvados (al servicio)" value={all.bpSavePct} max={1} format={(v) => pct(v)} />
                    <StatBar label="BP convertidos (al resto)" value={all.bpConversionPct} max={1} format={(v) => pct(v)} />
                    <div className="fb text-xs mt-4" style={{ color: "var(--muted)", lineHeight: 1.65 }}>
                      BP salvados: porcentaje de break points en contra que el jugador salva.<br />
                      BP convertidos: porcentaje de oportunidades de break que el jugador aprovecha como restador.
                    </div>
                  </div>

                  {/* Golpes */}
                  {(all.avgWinners != null || all.avgUnforced != null) && (
                    <div className="card">
                      <div className="fb font-semibold text-base mb-4">Golpes (Charting data)</div>
                      <StatBar label="Winners / partido" value={all.avgWinners} max={40} format={(v) => v.toFixed(1)} />
                      <StatBar label="Errores no forzados / partido" value={all.avgUnforced} max={40} format={(v) => v.toFixed(1)} />
                      {all.avgWinners != null && all.avgUnforced != null && all.avgUnforced > 0 && (
                        <div className="grid grid-cols-1 gap-3 mt-4">
                          <MiniStat label="Ratio winners / no forzados" value={num(all.avgWinners / all.avgUnforced, 2)} />
                        </div>
                      )}
                      <div className="fb text-xs mt-3" style={{ color: "var(--muted)" }}>Disponible solo cuando hay datos de Match Charting.</div>
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB: Presión ── */}
              {activeTab === "Presión" && all && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  {/* Tiebreaks */}
                  <div className="card">
                    <div className="fb font-semibold text-base mb-4">Tiebreaks</div>
                    {all.tbStats && all.tbStats.played > 0 ? (
                      <>
                        <div className="grid grid-cols-3 gap-3 mb-4">
                          <MiniStat label="Jugados" value={String(all.tbStats.played)} />
                          <MiniStat label="Ganados" value={String(all.tbStats.won)} />
                          <MiniStat label="Win rate TB" value={pct(all.tbStats.winRate)} />
                        </div>
                        <StatBar label="Win rate tiebreaks" value={all.tbStats.winRate} max={1} format={(v) => pct(v)} />
                      </>
                    ) : (
                      <div className="fb text-sm" style={{ color: "var(--muted)" }}>Sin tiebreaks registrados en el período.</div>
                    )}
                  </div>

                  {/* Sets decisivos */}
                  <div className="card">
                    <div className="fb font-semibold text-base mb-4">Sets decisivos</div>
                    <div className="mb-4">
                      <div className="fb text-xs font-semibold mb-2" style={{ color: "var(--acid)" }}>3er set (Best of 3)</div>
                      {all.thirdSetStats && all.thirdSetStats.played > 0 ? (
                        <>
                          <div className="grid grid-cols-3 gap-2 mb-3">
                            <MiniStat label="Jugados" value={String(all.thirdSetStats.played)} />
                            <MiniStat label="Ganados" value={String(all.thirdSetStats.won)} />
                            <MiniStat label="Win rate" value={pct(all.thirdSetStats.winRate)} />
                          </div>
                          <StatBar label="Win rate 3er set" value={all.thirdSetStats.winRate} max={1} format={(v) => pct(v)} />
                        </>
                      ) : (
                        <div className="fb text-sm mb-4" style={{ color: "var(--muted)" }}>Sin datos de 3er set.</div>
                      )}
                    </div>
                    {all.fifthSetStats && all.fifthSetStats.played > 0 && (
                      <div>
                        <div className="fb text-xs font-semibold mb-2" style={{ color: "var(--acid)" }}>5to set (Best of 5)</div>
                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <MiniStat label="Jugados" value={String(all.fifthSetStats.played)} />
                          <MiniStat label="Ganados" value={String(all.fifthSetStats.won)} />
                          <MiniStat label="Win rate" value={pct(all.fifthSetStats.winRate)} />
                        </div>
                        <StatBar label="Win rate 5to set" value={all.fifthSetStats.winRate} max={1} format={(v) => pct(v)} />
                      </div>
                    )}
                  </div>

                  {/* Rachas */}
                  {all.streaks && (
                    <div className="card">
                      <div className="fb font-semibold text-base mb-4">Rachas</div>
                      <div className="grid grid-cols-2 gap-3">
                        <MiniStat label="Racha actual" value={streakLabel} />
                        <MiniStat label="Racha ganadora más larga" value={`${all.streaks.longestWin}p`} />
                        <MiniStat label="Racha perdedora más larga" value={`${all.streaks.longestLoss}p`} />
                        {all.avgDuration != null && <MiniStat label="Duración media" value={`${Math.round(all.avgDuration)} min`} />}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB: Rivales ── */}
              {activeTab === "Rivales" && all && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  {/* Por ranking rival */}
                  <div className="card">
                    <div className="fb font-semibold text-base mb-4">Win rate vs ranking del rival</div>
                    {all.opponentRankSplits ? (
                      <>
                        <SplitRow label="vs Top 10"  split={all.opponentRankSplits.top10}  color="#e74c3c" />
                        <SplitRow label="vs Top 20"  split={all.opponentRankSplits.top20}  color="#e67e22" />
                        <SplitRow label="vs Top 50"  split={all.opponentRankSplits.top50}  color="#f5c518" />
                        <SplitRow label="vs Top 100" split={all.opponentRankSplits.top100} color="#c8f135" />
                        <SplitRow label="vs Fuera del Top 100" split={all.opponentRankSplits.rest} color="#95a5a6" />
                      </>
                    ) : (
                      <div className="fb text-sm" style={{ color: "var(--muted)" }}>Sin datos de ranking del rival disponibles.</div>
                    )}
                  </div>

                  {/* Por estilo rival */}
                  <div className="card">
                    <div className="fb font-semibold text-base mb-4">Win rate por estilo de rival</div>
                    {all.opponentStyleSplits ? (
                      <div className="grid grid-cols-1 gap-3">
                        {([
                          { key: "big-server",           label: "Big server",           color: "#e74c3c", icon: "💥" },
                          { key: "aggressive-baseliner", label: "Baseliner agresivo",   color: "#e67e22", icon: "🔥" },
                          { key: "all-court",            label: "All-court",            color: "#c8f135", icon: "⚡" },
                          { key: "counter-puncher",      label: "Defensor / retriever", color: "#3498db", icon: "🛡️" },
                          { key: "baseliner",            label: "Baseliner estándar",   color: "#95a5a6", icon: "🎾" },
                        ] as const).map(({ key, label, color, icon }) => {
                          const split = all.opponentStyleSplits?.[key];
                          const wr = split?.winRate;
                          const m  = split?.matches ?? 0;
                          return (
                            <div key={key} className="flex items-center justify-between" style={{ background: "var(--bg3)", borderRadius: 10, padding: "10px 14px", border: "1px solid var(--border)" }}>
                              <div className="flex items-center gap-2">
                                <span style={{ fontSize: 14 }}>{icon}</span>
                                <span className="fb text-sm">{label}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="fb text-xs" style={{ color: "var(--muted)" }}>{m > 0 ? `${m}p` : "—"}</span>
                                <div className="fd" style={{ fontSize: 22, color: wr != null ? color : "var(--muted)", lineHeight: 1, minWidth: 50, textAlign: "right" }}>
                                  {wr != null ? pct(wr) : "—"}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="fb text-sm" style={{ color: "var(--muted)" }}>Sin datos de estilo de rival disponibles.</div>
                    )}
                    <div className="fb text-xs mt-4" style={{ color: "var(--muted)", lineHeight: 1.65 }}>
                      Clasificación basada en el estilo declarado de cada jugador. Disponible para partidos con origen TennisExplorer.
                    </div>
                  </div>
                </div>
              )}
            </>
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
