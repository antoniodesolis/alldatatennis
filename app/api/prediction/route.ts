import { NextRequest, NextResponse } from "next/server";
import { predict } from "../../../lib/prediction/engine";
import type { PredictionInput } from "../../../lib/prediction/engine";
import { logPrediction } from "../../../lib/learning/feedback";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Partial<PredictionInput> & { matchId?: string };

    if (!body.player1 || !body.player2 || !body.tournament) {
      return NextResponse.json({ error: "Faltan campos requeridos: player1, player2, tournament" }, { status: 400 });
    }

    const input: PredictionInput = {
      player1: body.player1,
      player2: body.player2,
      player1Name: body.player1Name ?? body.player1,
      player2Name: body.player2Name ?? body.player2,
      tournament: body.tournament,
      tourneyLevel: body.tourneyLevel ?? "atp-250",
      surface: body.surface ?? "hard",
      round: body.round,
      timeOfDay: body.timeOfDay,
      date: body.date ?? new Date().toISOString().slice(0, 10),
      lat: body.lat,
      lon: body.lon,
      indoor: body.indoor ?? false,
    };

    const result = await predict(input);

    // Log prediction for learning feedback (non-blocking)
    if (body.matchId) {
      try {
        logPrediction(body.matchId, input, result);
      } catch (e) {
        console.warn("[prediction] log failed:", (e as Error).message);
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    const e = err as Error;
    console.error("[prediction/route] ERROR:", e.message);
    console.error("[prediction/route] STACK:", e.stack?.slice(0, 800));
    return NextResponse.json({ error: "Error interno al calcular predicción", detail: e.message }, { status: 500 });
  }
}
