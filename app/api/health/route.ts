import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const configured = Boolean(process.env.ANTHROPIC_API_KEY && process.env.OPENAI_API_KEY);

  return NextResponse.json(
    {
      status: configured ? "ok" : "degraded",
      configured,
      timestamp: new Date().toISOString(),
    },
    { status: configured ? 200 : 503 },
  );
}
