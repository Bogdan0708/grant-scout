export type LimitReason = "ip" | "daily";

export type LimitResult = {
  allowed: boolean;
  reason?: LimitReason;
  remaining: number;
  retryAfterSeconds: number;
};

type Bucket = { count: number; resetAt: number };
type LimiterState = { perIp: Map<string, Bucket>; day: string; dailyCount: number };

export function createRateLimiter(
  config = {
    requests: Number(process.env.RATE_LIMIT_REQUESTS ?? 8),
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
    dailyRequests: Number(process.env.DAILY_REQUEST_LIMIT ?? 250),
  },
) {
  const state: LimiterState = { perIp: new Map(), day: "", dailyCount: 0 };

  return (ip: string, now = Date.now()): LimitResult => {
    const day = new Date(now).toISOString().slice(0, 10);
    if (state.day !== day) {
      state.day = day;
      state.dailyCount = 0;
    }

    if (state.dailyCount >= config.dailyRequests) {
      const nextDay = Date.parse(`${day}T00:00:00.000Z`) + 86_400_000;
      return {
        allowed: false,
        reason: "daily",
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((nextDay - now) / 1000)),
      };
    }

    const existing = state.perIp.get(ip);
    const bucket = !existing || existing.resetAt <= now
      ? { count: 0, resetAt: now + config.windowMs }
      : existing;

    if (bucket.count >= config.requests) {
      return {
        allowed: false,
        reason: "ip",
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      };
    }

    bucket.count += 1;
    state.perIp.set(ip, bucket);
    state.dailyCount += 1;

    if (state.perIp.size > 2_000) {
      for (const [key, value] of state.perIp) {
        if (value.resetAt <= now) state.perIp.delete(key);
      }
    }

    return {
      allowed: true,
      remaining: Math.max(0, config.requests - bucket.count),
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  };
}

const globalForLimiter = globalThis as typeof globalThis & {
  grantScoutLimiter?: ReturnType<typeof createRateLimiter>;
};

export const checkRateLimit = globalForLimiter.grantScoutLimiter ?? createRateLimiter();
if (process.env.NODE_ENV !== "production") globalForLimiter.grantScoutLimiter = checkRateLimit;
