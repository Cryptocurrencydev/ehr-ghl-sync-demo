import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { runScenario } from "@/lib/sim/run";
import { pruneSimulatorData } from "@/lib/sync/store";

export const dynamic = "force-dynamic";

const WORKSPACE_COOKIE = "lumen_ws";
const UUID = /^[0-9a-f-]{36}$/;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { scenarioId?: unknown } | null;
  if (typeof body?.scenarioId !== "string") return NextResponse.json({ error: "scenarioId is required" }, { status: 400 });

  const jar = await cookies();
  const current = jar.get(WORKSPACE_COOKIE)?.value;
  const workspace = current && UUID.test(current) ? current : randomUUID();

  const result = await runScenario(body.scenarioId, workspace);
  if (!result) return NextResponse.json({ error: "Unknown scenario" }, { status: 404 });

  await pruneSimulatorData();
  const res = NextResponse.json(result);
  res.cookies.set(WORKSPACE_COOKIE, workspace, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && !process.env.PLAYWRIGHT_LOCAL, maxAge: 86_400, path: "/" });
  return res;
}
