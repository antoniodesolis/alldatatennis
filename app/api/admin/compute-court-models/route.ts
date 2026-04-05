import { computeAndSaveTournamentModels } from "../../../../lib/analytics/court-speed";

export async function POST() {
  try {
    const { computed, models } = await computeAndSaveTournamentModels();
    const summary = models.slice(0, 10).map((m) => ({
      name: m.tourney_name,
      surface: m.surface,
      speed: m.court_speed,
      profile: m.court_profile,
    }));
    return Response.json({ ok: true, computed, topBySpeed: summary });
  } catch (err) {
    console.error("[compute-court-models]", err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
