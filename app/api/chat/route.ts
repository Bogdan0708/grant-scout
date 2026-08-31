import { convertToModelMessages, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { streamFundingAnswer } from "@/lib/agent";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BODY_BYTES = 24_000;
const requestSchema = z.object({
  messages: z.array(z.object({
    id: z.string(),
    role: z.enum(["user", "assistant", "system"]),
    parts: z.array(z.unknown()),
  }).passthrough()).min(1).max(20),
});

function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? "unknown";
}

function safeProviderError(error: unknown) {
  const status = typeof error === "object" && error && "statusCode" in error
    ? Number((error as { statusCode?: unknown }).statusCode)
    : undefined;

  console.error("Grant Scout provider failure", {
    name: error instanceof Error ? error.name : "UnknownError",
    status,
  });

  if (status === 429) return "The model provider is at capacity or its budget limit was reached. Please try again later.";
  return "The model is temporarily unavailable. Please try again in a moment.";
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY || !process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: { code: "not_configured", message: "The demo model is not configured." } },
      { status: 503 },
    );
  }

  const limit = checkRateLimit(clientIp(request));
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: {
          code: limit.reason === "daily" ? "demo_budget_reached" : "rate_limited",
          message: limit.reason === "daily"
            ? "The public demo has used today's request budget. Please try again tomorrow."
            : "Too many requests from this connection. Please wait and try again.",
          retryAfterSeconds: limit.retryAfterSeconds,
        },
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(limit.retryAfterSeconds),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: { code: "payload_too_large", message: "The conversation is too large for this public demo." } },
      { status: 413 },
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: { code: "invalid_json", message: "Invalid request body." } }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_messages", message: "The conversation format is invalid." } },
      { status: 400 },
    );
  }

  try {
    const messages = await convertToModelMessages(parsed.data.messages as UIMessage[]);
    const result = streamFundingAnswer(messages, request.signal);
    return result.toUIMessageStreamResponse({
      headers: {
        "Cache-Control": "no-store",
        "X-RateLimit-Remaining": String(limit.remaining),
      },
      onError: safeProviderError,
    });
  } catch (error) {
    safeProviderError(error);
    return NextResponse.json(
      { error: { code: "provider_unavailable", message: "The model is temporarily unavailable. Please try again." } },
      { status: 503 },
    );
  }
}
