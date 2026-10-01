import { NextResponse } from "next/server";
import { getProviderStatuses } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reports which providers have a key and which models that key can reach. Never returns the keys. */
export async function GET() {
  const providers = await getProviderStatuses();
  return NextResponse.json({ providers });
}
