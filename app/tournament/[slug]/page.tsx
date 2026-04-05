"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TournamentMatchSummary } from "@/app/api/tournament/[slug]/route";
import type { TournamentEditionStats } from "@/lib/analytics/tournament-stats";
import type { CourtModel } from "@/lib/analytics/court-speed";

// ── Tipos ──────────────────────────────────────────────────

interface TournamentPageData {
  ok: boolean;
  slug: string;
  tourneyName: string | null;
  surface: string | null;
  model: CourtModel | null;
  edition: TournamentEditionStats | null;
  recentMatches: TournamentMatchSummary[];
}

// ── Helpers ────────────────────────────────────────────────

const SURFACE_COLOR: Record<string, string> = {
  clay: "#c17d3c",
  grass: "#4caf50",
  hard: "#2196f3",
  "indoor hard": "#7c4dff",
};

const SURFACE_LABEL: Record<string, string> = {
  clay: "Tierra",
  grass: "Hierba",
  hard: "Dura",
  "indoor hard": "Indoor",
};

const PATTERN_LABEL: Record<string, string> = {
  straight_sets_dominant: "Sets directos dominante",
  straight_sets: "Sets directos",
  comeback_from_set_down: "Remontada",
  three_sets_close: "3 sets igualados",
  three_sets: "3 sets",
  tiebreak_decider: "Tiebreak decisivo",
  bagel: "Bagel (6-0)",
  unknown: "Otros",
};

const STYLE_LABEL: Record<string, string> = {
  "big-server": "Sacadores dominantes",
  "aggressive-baseliner": "Fondistas agresivos",
  "all-court": "Juego completo",
  "counter-puncher": "Contrapunchistas",
  "baseliner": "Fondistas de base",
};

function pctBar(value: number | null | undefined, color = "var(--acid)") {
  if (value == null) return null;
  const pct = Math.round(value * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 999, transition: "width 0.6s" }} />
      </div>
      <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 18, color, minWidth: 40, textAlign: "right" }}>{pct}%</span>
    </div>
  );
}

function speedBar(csi: number) {
  // CSI 0–100, verde = lento (0), rojo = rápido (100)
  const pos = Math.round(csi);
  const color = csi < 35 ? "#c17d3c" : csi < 55 ? "#c8f135" : "#2196f3";
  return (
    <div style={{ position: "relative", height: 8, background: "rgba(255,255,255,0.08)", borderRadius: 999, overflow: "hidden", marginBottom: 6 }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: `${pos}%`, height: "100%", background: `linear-gradient(90deg, #c17d3c, ${color})`, borderRadius: 999, transition: "width 0.6s" }} />
    </div>
  );
}

// ── Component ──────────────────────────────────────────────

export default function TournamentPage({ params }: { params: Promise<{ slug: string }> }) {
  const [slug, setSlug] = useState<string | null>(null);
  const [data, setData] = useState<TournamentPageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    params.then(({ slug: s }) => setSlug(s));
  }, [params]);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetch(`/api/tournament/${slug}`)
      .then((r) => r.json())
      .then((d: TournamentPageData) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [slug]);

  const surfaceKey = (data?.surface ?? "").toLowerCase();
  const surfaceColor = SURFACE_COLOR[surfaceKey] ?? "var(--acid)";
  const surfaceLabel = SURFACE_LABEL[surfaceKey] ?? data?.surface ?? "";
  const year = new Date().getFullYear();

  return (
    <>
      <style>{`
        :root {
          --acid: #c8f135;
          --acid-dim: rgba(200,241,53,0.08);
          --bg: #0a0a0a;
          --card: #111111;
          --border: rgba(255,255,255,0.07);
          --muted: rgba(255,255,255,0.38);
          --text: rgba(255,255,255,0.87);
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; }
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Space+Mono:wght@400;700&display=swap');

        .page-wrap { max-width: 860px; margin: 0 auto; padding: 24px 16px 80px; }
        .back-link { font-family: 'Space Mono', monospace; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); text-decoration: none; display: inline-flex; align-items: center; gap: 6px; margin-bottom: 28px; }
        .back-link:hover { color: var(--text); }

        .hero { margin-bottom: 32px; }
        .hero-label { font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; }
        .hero-name { font-family: 'Bebas Neue', cursive; font-size: clamp(40px, 8vw, 72px); line-height: 1; color: var(--text); margin-bottom: 12px; }
        .hero-meta { display: flex; align-items: center; gap: 10px; }
        .surface-pill { font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; padding: 3px 10px; border-radius: 999px; border: 1px solid; }

        .section { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; margin-bottom: 16px; }
        .section-title { font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); margin-bottom: 20px; }

        .stat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; }
        .stat-card { background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; }
        .stat-label { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; }
        .stat-value { font-family: 'Bebas Neue', cursive; font-size: 32px; line-height: 1; color: var(--acid); }
        .stat-value.neutral { color: var(--text); }
        .stat-sub { font-size: 11px; color: var(--muted); margin-top: 4px; }

        .surface-reading { font-family: 'Playfair Display', serif; font-size: 15px; line-height: 1.75; color: var(--text); margin-bottom: 16px; }

        .narrative-line { font-family: 'Playfair Display', serif; font-size: 13.5px; line-height: 1.7; color: rgba(255,255,255,0.7); padding-left: 14px; border-left: 2px solid var(--acid-dim); margin-bottom: 10px; }

        .style-row { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
        .style-label { font-size: 12px; color: var(--text); min-width: 180px; }
        .style-wins { font-family: 'Bebas Neue', cursive; font-size: 22px; color: var(--acid); min-width: 28px; }

        .match-row { display: flex; flex-direction: column; gap: 4px; padding: 14px 0; border-bottom: 1px solid var(--border); }
        .match-row:last-child { border-bottom: none; }
        .match-players { display: flex; align-items: center; gap: 8px; font-size: 13px; }
        .match-winner { font-weight: 700; color: var(--text); }
        .match-loser { color: var(--muted); }
        .match-score { font-family: 'Space Mono', monospace; font-size: 11px; color: var(--acid); }
        .match-pattern { font-size: 10px; letter-spacing: 0.07em; text-transform: uppercase; color: var(--muted); }
        .match-hint { font-size: 11px; color: rgba(255,255,255,0.45); font-style: italic; }

        .pattern-bar-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
        .pattern-bar-label { font-size: 11px; color: var(--text); min-width: 190px; }
        .pattern-bar-track { flex: 1; height: 4px; background: rgba(255,255,255,0.06); border-radius: 999px; overflow: hidden; }
        .pattern-bar-fill { height: 100%; border-radius: 999px; background: var(--acid); }
        .pattern-bar-count { font-family: 'Bebas Neue', cursive; font-size: 16px; color: var(--muted); min-width: 24px; text-align: right; }

        .empty-state { text-align: center; padding: 40px 24px; color: var(--muted); font-family: 'Playfair Display', serif; font-style: italic; }

        @media (max-width: 600px) {
          .stat-grid { grid-template-columns: repeat(2, 1fr); }
          .style-label { min-width: 130px; font-size: 11px; }
        }
      `}</style>

      <div className="page-wrap">
        <Link href="/" className="back-link">← Volver al inicio</Link>

        {loading && (
          <div className="empty-state">Cargando datos del torneo…</div>
        )}

        {!loading && !data?.tourneyName && !data?.model && (
          <div className="empty-state">No se encontraron datos para este torneo.</div>
        )}

        {!loading && (data?.tourneyName || data?.model) && (() => {
          const d = data!;
          const m = d.model;
          const e = d.edition;
          const patternTotal = e
            ? Object.values(e.patternCounts).reduce((a, b) => a + (b ?? 0), 0)
            : 0;
          const sortedStyles = e
            ? Object.entries(e.styleWins).sort((a, b) => b[1] - a[1])
            : [];

          return (
            <>
              {/* Hero */}
              <div className="hero">
                <div className="hero-label">Torneo ATP · {year}</div>
                <div className="hero-name">{d.tourneyName ?? slug}</div>
                <div className="hero-meta">
                  {surfaceKey && (
                    <span className="surface-pill" style={{ color: surfaceColor, borderColor: surfaceColor }}>
                      {surfaceLabel}
                    </span>
                  )}
                  {m && (
                    <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)" }}>
                      {m.matches} partidos históricos · {m.years?.length ?? 0} ediciones
                    </span>
                  )}
                </div>
              </div>

              {/* Velocidad de pista (modelo histórico) */}
              {m && (
                <div className="section">
                  <div className="section-title">Perfil histórico de la pista</div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "'Space Mono', monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        Lenta
                      </span>
                      <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 22, color: surfaceColor }}>
                        CSI {m.court_speed?.toFixed(0) ?? "—"}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "'Space Mono', monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        Rápida
                      </span>
                    </div>
                    {speedBar(m.court_speed ?? 50)}
                    <div style={{ textAlign: "center" }}>
                      <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: surfaceColor }}>
                        {m.court_profile ?? ""}
                      </span>
                    </div>
                  </div>

                  <div className="stat-grid" style={{ marginTop: 20 }}>
                    <div className="stat-card">
                      <div className="stat-label">Hold %</div>
                      {pctBar(m.hold_pct, surfaceColor)}
                      <div className="stat-sub">% de juegos con hold de saque</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-label">Tiebreak %</div>
                      {pctBar(m.tiebreak_rate, surfaceColor)}
                      <div className="stat-sub">Partidos con tiebreak</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-label">1.ª entrada</div>
                      {pctBar(m.first_in_pct, surfaceColor)}
                      <div className="stat-sub">% 1.ª en juego (media)</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-label">Aces / servicio</div>
                      <div className="stat-value">{m.ace_rate != null ? (m.ace_rate * 100).toFixed(1) : "—"}</div>
                      <div className="stat-sub">% de servicios que son ace</div>
                    </div>
                  </div>

                  {/* Afinidad de estilos histórica */}
                  {m.style_affinity && (
                    <div style={{ marginTop: 20 }}>
                      <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 12 }}>
                        Afinidad histórica por estilo
                      </div>
                      {Object.entries(m.style_affinity)
                        .sort((a, b) => b[1] - a[1])
                        .map(([style, score]) => (
                          <div key={style} style={{ marginBottom: 10 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                              <span style={{ fontSize: 12 }}>{STYLE_LABEL[style] ?? style}</span>
                              <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 18, color: surfaceColor }}>{score.toFixed(2)}</span>
                            </div>
                            <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 999, overflow: "hidden" }}>
                              <div style={{ width: `${Math.min(score * 100, 100)}%`, height: "100%", background: surfaceColor, borderRadius: 999 }} />
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}

              {/* Edición actual */}
              {e && e.matchesAnalyzed > 0 ? (
                <div className="section">
                  <div className="section-title">Edición {year} · {e.matchesAnalyzed} partidos analizados</div>

                  {/* Lectura de pista */}
                  <p className="surface-reading">{e.surfaceReading}</p>

                  {/* Narrativa */}
                  {e.narrativeLines.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                      {e.narrativeLines.map((line, i) => (
                        <div key={i} className="narrative-line">{line}</div>
                      ))}
                    </div>
                  )}

                  {/* Stats de edición */}
                  <div className="stat-grid" style={{ marginBottom: 24 }}>
                    {e.threeSetRate != null && (
                      <div className="stat-card">
                        <div className="stat-label">Partidos a 3 sets</div>
                        {pctBar(e.threeSetRate)}
                        <div className="stat-sub">Alta = pista lenta / muchos breaks</div>
                      </div>
                    )}
                    {e.tiebreakRate != null && (
                      <div className="stat-card">
                        <div className="stat-label">Tiebreaks</div>
                        {pctBar(e.tiebreakRate)}
                        <div className="stat-sub">Alta = saque dominante</div>
                      </div>
                    )}
                    {e.comebackRate != null && (
                      <div className="stat-card">
                        <div className="stat-label">Remontadas</div>
                        {pctBar(e.comebackRate, "#9fd420")}
                        <div className="stat-sub">Ganó perdiendo el 1.er set</div>
                      </div>
                    )}
                    {e.closeSetRate != null && (
                      <div className="stat-card">
                        <div className="stat-label">Sets igualados</div>
                        {pctBar(e.closeSetRate, "rgba(255,255,255,0.6)")}
                        <div className="stat-sub">Margen ≤ 2 juegos</div>
                      </div>
                    )}
                    {e.dominantSetRate != null && (
                      <div className="stat-card">
                        <div className="stat-label">Sets dominantes</div>
                        {pctBar(e.dominantSetRate, "#c17d3c")}
                        <div className="stat-sub">Margen ≥ 4 juegos (6-1, 6-2)</div>
                      </div>
                    )}
                    {e.bagelRate != null && e.bagelRate > 0 && (
                      <div className="stat-card">
                        <div className="stat-label">Bagels (6-0)</div>
                        {pctBar(e.bagelRate, "#c17d3c")}
                        <div className="stat-sub">% partidos con al menos un 6-0</div>
                      </div>
                    )}
                  </div>

                  {/* Estilos ganadores */}
                  {sortedStyles.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                      <div className="section-title" style={{ marginBottom: 14 }}>Estilos que están rindiendo</div>
                      {sortedStyles.map(([style, wins]) => (
                        <div key={style} className="style-row">
                          <span className="style-label">{STYLE_LABEL[style] ?? style}</span>
                          <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 999, overflow: "hidden" }}>
                            <div style={{ width: `${(wins / e.matchesAnalyzed) * 100}%`, height: "100%", background: surfaceColor, borderRadius: 999 }} />
                          </div>
                          <span className="style-wins">{wins}V</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Distribución de patrones */}
                  {patternTotal > 0 && (
                    <div>
                      <div className="section-title" style={{ marginBottom: 14 }}>Patrones de partido</div>
                      {Object.entries(e.patternCounts)
                        .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
                        .map(([pat, count]) => {
                          if (!count) return null;
                          return (
                            <div key={pat} className="pattern-bar-row">
                              <span className="pattern-bar-label">{PATTERN_LABEL[pat] ?? pat}</span>
                              <div className="pattern-bar-track">
                                <div className="pattern-bar-fill" style={{ width: `${(count / patternTotal) * 100}%` }} />
                              </div>
                              <span className="pattern-bar-count">{count}</span>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="section">
                  <div className="section-title">Edición {year}</div>
                  <div className="empty-state" style={{ padding: "20px 0" }}>
                    Aún no hay partidos analizados esta edición.<br />
                    Los datos se actualizan tras el job diario de análisis.
                  </div>
                </div>
              )}

              {/* Partidos recientes */}
              {d.recentMatches.length > 0 && (
                <div className="section">
                  <div className="section-title">Partidos analizados esta edición</div>
                  {d.recentMatches.map((match) => {
                    const wName = match.winnerSlug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
                    const lName = match.loserSlug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
                    return (
                      <div key={match.matchId} className="match-row">
                        <div className="match-players">
                          <span className="match-winner">{wName}</span>
                          <span style={{ color: "var(--muted)", fontSize: 11 }}>def.</span>
                          <span className="match-loser">{lName}</span>
                          <span className="match-score">{match.score}</span>
                        </div>
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          {match.pattern && (
                            <span className="match-pattern">{PATTERN_LABEL[match.pattern] ?? match.pattern}</span>
                          )}
                          <span style={{ color: "var(--muted)", fontSize: 10 }}>{match.date}</span>
                        </div>
                        {match.hints.slice(0, 2).map((h, i) => (
                          <div key={i} className="match-hint">· {h}</div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          );
        })()}
      </div>
    </>
  );
}
