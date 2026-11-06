import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { listLedger } from "@/lib/sync/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const workspace = (await cookies()).get("lumen_ws")?.value;
  if (!workspace || !/^[0-9a-f-]{36}$/.test(workspace)) return NextResponse.json({ rows: [] });
  return NextResponse.json({ rows: await listLedger(workspace) });
}
