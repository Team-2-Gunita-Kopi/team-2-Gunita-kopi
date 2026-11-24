import { createHash } from "node:crypto";
import { isIpAddress, trustedClientIp } from "@gunita/auth/client-ip";
import { AppError } from "./errors";
import { logger } from "./logger";
import { hasValidInternalProxySecret } from "./proxy-secret";
import { supabaseAdmin } from "./supabase-admin";

// Failures allowed per 15-minute window before a lock. Locks start at 15 minutes and double on
// each further lockout of the same key, up to 24 hours (progressive).
const PAIR_LIMIT = 5; // one username from one IP
const IP_LIMIT = 20; // one IP, any username (a shop's staff share one public IP)
const ACCOUNT_LIMIT = 10; // one username, any IP; the lock skips IPs trusted for that username
const WINDOW_SECONDS = 15 * 60;
const LOCK_SECONDS = 15 * 60;
const MAX_LOCK_SECONDS = 24 * 60 * 60;

export interface ThrottleKeys {
  pair: string;
  ip: string;
  account: string;
  trusted: string;
}

const hash = (v: string) => createHash("sha256").update(v).digest("hex");

/**
 * Counters live in Postgres (public.login_throttle), shared by every serverless instance.
 * Keys are hashed: no usernames or IP addresses are stored. `username` must already be
 * normalized by UsernameSchema (trim + lowercase), the same value used for the user lookup.
 */
export function throttleKeys(username: string, ip: string): ThrottleKeys {
  const pair = hash(`${username}\n${ip}`);
  return {
    pair: `pair:${pair}`,
    ip: `ip:${hash(ip)}`,
    account: `acct:${hash(username)}`,
    trusted: `trusted:${pair}`,
  };
}

/** Short, non-reversible label for logs. */
export const logKey = (key: string) => key.slice(0, key.indexOf(":") + 13);

/**
 * Client IP for throttling. The Admin/POS servers sign users in on their behalf and forward the
 * browser's IP in x-gunita-client-ip, trusted only with the shared INTERNAL_PROXY_SECRET.
 * Direct callers fall back to the hosting platform's header (see trustedClientIp).
 * Returns null when no trustworthy IP exists; the caller fails closed.
 */
export function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-gunita-client-ip");
  if (forwarded !== null) {
    if (!hasValidInternalProxySecret(req.headers)) {
      logger.error("auth.proxy_secret_rejected");
      return null;
    }
    return isIpAddress(forwarded) ? forwarded : null;
  }
  return trustedClientIp(req.headers);
}

export const tooManyAttempts = () =>
  new AppError(
    "Too many sign-in attempts. Try again later.",
    429,
    "TOO_MANY_ATTEMPTS",
  );

export const signInUnavailable = () =>
  new AppError(
    "Sign-in is temporarily unavailable",
    503,
    "SERVICE_UNAVAILABLE",
  );

/** Throws 429 while this pair or IP is locked, or the account is locked for this untrusted IP. */
export async function assertNotLocked(keys: ThrottleKeys): Promise<void> {
  const { data, error } = await supabaseAdmin.rpc("login_throttle_blocked", {
    p_pair_key: keys.pair,
    p_ip_key: keys.ip,
    p_account_key: keys.account,
    p_trusted_key: keys.trusted,
  });
  if (error) {
    logger.error("auth.throttle_unavailable", {
      op: "check",
      error: error.message,
    });
    throw signInUnavailable();
  }
  if (data === true) {
    logger.warn("auth.login_blocked", {
      account: logKey(keys.account),
      ip: logKey(keys.ip),
    });
    throw tooManyAttempts();
  }
}

/**
 * Counts one failure on the pair, IP and account keys (atomic in Postgres).
 * Fails closed: an uncounted failure would let brute force run past the limit.
 */
export async function recordFailure(keys: ThrottleKeys): Promise<void> {
  const { data, error } = await supabaseAdmin.rpc("login_throttle_fail", {
    p_keys: [keys.pair, keys.ip, keys.account],
    p_limits: [PAIR_LIMIT, IP_LIMIT, ACCOUNT_LIMIT],
    p_window_seconds: WINDOW_SECONDS,
    p_lock_seconds: LOCK_SECONDS,
    p_max_lock_seconds: MAX_LOCK_SECONDS,
  });
  if (error) {
    logger.error("auth.throttle_unavailable", {
      op: "fail",
      error: error.message,
    });
    throw signInUnavailable();
  }
  if (data) {
    logger.warn("auth.lockout", {
      account: logKey(keys.account),
      ip: logKey(keys.ip),
      lockedUntil: data,
    });
  }
}

/** Correct password: clears this pair's counter and marks the IP trusted for the username. */
export async function recordSuccess(keys: ThrottleKeys): Promise<void> {
  const { error } = await supabaseAdmin.rpc("login_throttle_success", {
    p_pair_key: keys.pair,
    p_trusted_key: keys.trusted,
  });
  if (error) {
    logger.error("auth.throttle_unavailable", {
      op: "success",
      error: error.message,
    });
    throw signInUnavailable();
  }
}
