import { NextResponse } from "next/server";
import { HttpGhlClient } from "@/lib/ghl/http";
import { MockGhl } from "@/lib/ghl/mock";
import { seedState } from "@/lib/sim/seed";
import { defaultConfig, type LocationConfig } from "@/lib/sync/config";
import { SyncStore } from "@/lib/sync/store";
import { receiveWebhook } from "@/lib/sync/webhook";

export const dynamic = "force-dynamic";

function ghlFor(location: LocationConfig) {
  if (process.env.GHL_MODE !== "live") return new MockGhl(seedState());
  const token = process.env[location.tokenEnv];
  if (!token) throw new Error(`${location.tokenEnv} is not set`);
  return new HttpGhlClient({ token, version: process.env.GHL_API_VERSION });
}

// OptiMantra's setup guide defaults outbound webhooks to PUT, so both methods are accepted.
async function handle(req: Request, ctx: { params: Promise<{ secret: string }> }) {
  const { secret } = await ctx.params;
  const result = await receiveWebhook(
    { config: defaultConfig, store: new SyncStore({ workspace: "webhook", runId: "live" }), ghlFor },
    { secret: process.env.WEBHOOK_SECRET, ipAllowlist: process.env.WEBHOOK_IP_ALLOWLIST },
    { pathSecret: secret, ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, rawBody: await req.text() },
  );
  // The reply says what happened to the event and repeats no patient data.
  return NextResponse.json({ outcome: result.ledger?.outcome ?? "refused" }, { status: result.httpStatus });
}

export { handle as POST, handle as PUT };
