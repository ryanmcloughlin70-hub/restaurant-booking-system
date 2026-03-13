import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export const rlAvailability = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "1 m"),
  prefix: "rl:availability",
});

export const rlBookings = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  prefix: "rl:bookings",
});

export const rlStaffAuth = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "1 m"),
  prefix: "rl:staffauth",
});
