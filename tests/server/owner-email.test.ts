import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// In-memory fake of the parts of Supabase these flows use.
type UserRow = {
  user_id: number;
  auth_user_id: string;
  username: string;
  full_name: string;
  role: string;
  status: string;
  email: string | null;
  date_created: string;
};
type AuthUser = {
  id: string;
  email: string;
  password: string;
  confirmed: boolean;
};

const db = {
  users: [] as UserRow[],
  auth: [] as AuthUser[],
  // public.login_throttle rows by key
  throttle: new Map<
    string,
    { failures: number; lockedUntil: number; lockouts: number }
  >(),
  // Which throttle operation fails, to test fail-closed behavior.
  throttleDown: null as null | "blocked" | "fail" | "success",
  // public.owner_login_challenges
  challenges: [] as Challenge[],
  // The code Supabase "emailed" last, and whether it was used.
  otp: null as null | { email: string; code: string; used: boolean },
};
type Challenge = {
  token_hash: string;
  auth_user_id: string;
  sends: number;
  attempts: number;
  last_sent_at: number;
  expires_at: number;
  session_id: string | null;
  verified_at?: string;
};
const jwt = (claims: Record<string, unknown>) =>
  `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;

// Same rules as public.owner_otp_use (the SQL is tested against PostgreSQL).
function otpUse(hash: string, kind: string) {
  const c = db.challenges.find((x) => x.token_hash === hash);
  const raise = (message: string) => ({ data: null, error: { message } });
  if (!c || c.session_id || c.expires_at <= Date.now())
    return raise("OTP_EXPIRED: sign in again");
  if (kind === "send") {
    if (c.sends >= 3) return raise("OTP_LIMIT: too many codes");
    if (c.last_sent_at > Date.now() - 60_000)
      return raise("OTP_RESEND_WAIT: wait");
    c.sends += 1;
    c.last_sent_at = Date.now();
  } else {
    if (c.attempts >= 5) return raise("OTP_LIMIT: too many attempts");
    c.attempts += 1;
  }
  const u = db.users.find(
    (x) =>
      x.auth_user_id === c.auth_user_id &&
      x.role === "owner_admin" &&
      x.status === "active",
  );
  return { data: u ? [{ auth_user_id: u.auth_user_id, email: u.email }] : [], error: null };
}

// supabaseAdmin.from("owner_login_challenges"): insert, and delete/update with eq/is filters.
function challengesTable() {
  const filters: [keyof Challenge, unknown][] = [];
  let values: Partial<Challenge> | null = null;
  const run = () => {
    const hit = db.challenges.filter((r) =>
      filters.every(([c, v]) => (r[c] ?? null) === v),
    );
    if (values) hit.forEach((r) => Object.assign(r, values));
    else db.challenges = db.challenges.filter((r) => !hit.includes(r));
    return { data: hit.map((_, i) => ({ challenge_id: i + 1 })), error: null };
  };
  const q = {
    eq: (c: keyof Challenge, v: unknown) => (filters.push([c, v]), q),
    is: (c: keyof Challenge, v: unknown) => (filters.push([c, v]), q),
    select: async () => run(),
    then: (ok: (v: unknown) => unknown) => Promise.resolve(run()).then(ok),
  };
  return {
    insert: async (row: Pick<Challenge, "token_hash" | "auth_user_id">) => {
      db.challenges.push({
        ...row,
        sends: 0,
        attempts: 0,
        last_sent_at: 0,
        expires_at: Date.now() + 600_000,
        session_id: null,
      });
      return { error: null };
    },
    delete: () => q,
    update: (v: Partial<Challenge>) => ((values = v), q),
  };
}

// Same rules as the SQL functions (verified against real PostgreSQL in the migration tests).
function throttleFail(
  keys: string[],
  limits: number[],
  lockSeconds: number,
  maxLockSeconds: number,
) {
  keys.forEach((k, i) => {
    const row = db.throttle.get(k) ?? {
      failures: 0,
      lockedUntil: 0,
      lockouts: 0,
    };
    row.failures += 1;
    if (row.failures >= limits[i]!) {
      const secs = Math.min(maxLockSeconds, lockSeconds * 2 ** row.lockouts);
      row.lockedUntil = Date.now() + secs * 1000;
      row.lockouts += 1;
      row.failures = 0;
    }
    db.throttle.set(k, row);
  });
}
const lockedNow = (k: string) =>
  (db.throttle.get(k)?.lockedUntil ?? 0) > Date.now();
function throttleBlocked(a: Record<string, string>) {
  return (
    lockedNow(a.p_pair_key!) ||
    lockedNow(a.p_ip_key!) ||
    (lockedNow(a.p_account_key!) && !db.throttle.has(a.p_trusted_key!))
  );
}
function throttleSuccess(a: Record<string, string>) {
  db.throttle.delete(a.p_pair_key!);
  db.throttle.set(a.p_trusted_key!, {
    failures: 0,
    lockedUntil: 0,
    lockouts: 0,
  });
}
const calls = {
  createUser: [] as Record<string, unknown>[],
  deleteUser: [] as string[],
  resend: [] as Record<string, unknown>[],
  insert: [] as Record<string, unknown>[],
  signOut: [] as string[],
  sendOtp: [] as Record<string, unknown>[],
};

function addProfile(row: Omit<UserRow, "user_id" | "status" | "date_created">) {
  const full = {
    ...row,
    user_id: db.users.length + 1,
    status: "active",
    date_created: "2026-11-17T00:00:00Z",
  };
  db.users.push(full);
  return full;
}

vi.mock("@/server/lib/supabase-admin", () => ({
  supabaseAdmin: {
    from: (table: string) =>
      table === "owner_login_challenges" ? challengesTable() : ({
      select: () => ({
        eq: (col: keyof UserRow, val: unknown) => {
          const rows = db.users.filter((u) => u[col] === val);
          const result = { data: null, count: rows.length, error: null };
          return {
            then: (ok: (v: unknown) => unknown) =>
              Promise.resolve(result).then(ok),
            maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
          };
        },
      }),
      insert: (row: Record<string, unknown>) => {
        if (table !== "users") return Promise.resolve({ error: null });
        calls.insert.push(row);
        return {
          select: () => ({
            single: async () => ({
              data: addProfile(row as Parameters<typeof addProfile>[0]),
              error: null,
            }),
          }),
        };
      },
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === "owner_otp_use")
        return otpUse(args.p_token_hash as string, args.p_kind as string);
      if (fn.startsWith("login_throttle_")) {
        const op = fn.slice("login_throttle_".length);
        if (db.throttleDown === op) {
          return { data: null, error: { message: "connection refused" } };
        }
        if (op === "blocked") {
          return {
            data: throttleBlocked(args as Record<string, string>),
            error: null,
          };
        }
        if (op === "success") {
          throttleSuccess(args as Record<string, string>);
          return { data: null, error: null };
        }
        throttleFail(
          args.p_keys as string[],
          args.p_limits as number[],
          args.p_lock_seconds as number,
          args.p_max_lock_seconds as number,
        );
        return { data: null, error: null };
      }
      // Mirrors provision_initial_owner: serialized, refuses a second owner.
      const a = args as Record<string, string>;
      if (db.users.some((u) => u.role === "owner_admin")) {
        return {
          data: null,
          error: {
            code: "P0001",
            message: "OWNER_EXISTS: already provisioned",
          },
        };
      }
      return {
        data: addProfile({
          auth_user_id: a.p_auth_user_id!,
          username: a.p_username!,
          full_name: a.p_full_name!,
          role: "owner_admin",
          email: a.p_email!,
        }),
        error: null,
      };
    },
    auth: {
      admin: {
        createUser: async (p: {
          email: string;
          password: string;
          email_confirm: boolean;
        }) => {
          calls.createUser.push(p);
          if (db.auth.some((u) => u.email === p.email)) {
            return {
              data: { user: null },
              error: { code: "email_exists", message: "exists" },
            };
          }
          const user = {
            id: `auth-${db.auth.length + 1}`,
            email: p.email,
            password: p.password,
            confirmed: p.email_confirm,
          };
          db.auth.push(user);
          return { data: { user }, error: null };
        },
        getUserById: async (id: string) => {
          const u = db.auth.find((x) => x.id === id);
          return u
            ? { data: { user: { id: u.id, email: u.email } }, error: null }
            : { data: { user: null }, error: { status: 404, message: "User not found" } };
        },
        signOut: async (token: string) => {
          calls.signOut.push(token);
          return { error: null };
        },
        deleteUser: async (id: string) => {
          calls.deleteUser.push(id);
          db.auth = db.auth.filter((u) => u.id !== id);
          return { error: null };
        },
      },
      resend: async (p: Record<string, unknown>) => {
        calls.resend.push(p);
        return { error: null };
      },
    },
  },
}));

vi.mock("@/server/lib/supabase-user", () => ({
  createAuthClient: () => ({
    auth: {
      signInWithOtp: async (p: { email: string; options: unknown }) => {
        calls.sendOtp.push(p);
        db.otp = { email: p.email, code: String(100000 + calls.sendOtp.length), used: false };
        return { error: null };
      },
      verifyOtp: async (p: { email: string; token: string; type: string }) => {
        const ok =
          p.type === "email" &&
          db.otp?.email === p.email &&
          db.otp.code === p.token &&
          !db.otp.used;
        if (!ok)
          return {
            data: { session: null },
            error: { status: 403, code: "otp_expired", message: "Token has expired or is invalid" },
          };
        db.otp!.used = true;
        const user = db.auth.find((u) => u.email === p.email)!;
        return {
          data: {
            session: {
              access_token: jwt({ sub: user.id, session_id: `sess-${calls.sendOtp.length}` }),
              refresh_token: "rt-otp",
              expires_at: 2,
              user: { id: user.id },
            },
          },
          error: null,
        };
      },
      signInWithPassword: async ({
        email,
        password,
      }: Record<string, string>) => {
        const u = db.auth.find((x) => x.email === email);
        if (!u || u.password !== password) {
          return {
            data: { session: null },
            error: {
              code: "invalid_credentials",
              message: "Invalid login credentials",
            },
          };
        }
        if (!u.confirmed) {
          return {
            data: { session: null },
            error: {
              code: "email_not_confirmed",
              message: "Email not confirmed",
            },
          };
        }
        return {
          data: {
            session: {
              access_token: `at-${u.id}`,
              refresh_token: "rt",
              expires_at: 1,
            },
          },
          error: null,
        };
      },
    },
  }),
}));

const TOKEN = "t".repeat(32);
const IP = "203.0.113.7";
process.env.OWNER_SETUP_TOKEN = TOKEN;

const { provisionInitialOwner } = await import("@/server/modules/setup/service");
const { createEmployeeAccount } =
  await import("@/server/modules/employees/service");
const { loginWithUsername, ownerOtp } =
  await import("@/server/modules/session/service");
const {
  OwnerSetupRequestSchema,
  CreateEmployeeRequestSchema,
  LoginRequestSchema,
} = await import("@/contracts");
const { usernameToAuthEmail } = await import("@/auth");
type Owner = Parameters<typeof createEmployeeAccount>[0];

const ownerInput = (over: Record<string, unknown> = {}) =>
  OwnerSetupRequestSchema.parse({
    email: "  Eric.Owner@Example.com ",
    fullName: "Eric Owner",
    username: "Eric",
    password: "s3cret-pass",
    confirmPassword: "s3cret-pass",
    ...over,
  });
const ownerCaller = { id: "auth-1", userId: 1, role: "owner_admin" } as Owner;

beforeEach(() => {
  db.users = [];
  db.auth = [];
  db.throttle.clear();
  db.throttleDown = null;
  db.challenges = [];
  db.otp = null;
  for (const k of Object.keys(calls)) calls[k as keyof typeof calls].length = 0;
  process.env.OWNER_SETUP_TOKEN = TOKEN;
});

describe("Initial Owner registration", () => {
  it("creates the Owner with the real, normalized email and the owner_admin role", async () => {
    const res = await provisionInitialOwner(TOKEN, ownerInput());
    expect(res).toMatchObject({
      username: "eric",
      email: "eric.owner@example.com",
      role: "owner_admin",
    });
    // Confirmed at creation; every sign-in still proves the inbox with an emailed code.
    expect(calls.createUser[0]).toMatchObject({
      email: "eric.owner@example.com",
      email_confirm: true,
      app_metadata: { role: "owner_admin" },
    });
    expect(calls.resend).toHaveLength(0);
    expect(db.users[0]).toMatchObject({
      auth_user_id: res.authUserId,
      email: "eric.owner@example.com",
      role: "owner_admin",
    });
  });

  it("rejects a request without an email", () => {
    expect(() => ownerInput({ email: undefined })).toThrow();
    expect(() => ownerInput({ email: "" })).toThrow();
  });

  it("rejects mismatched passwords", () => {
    expect(() => ownerInput({ confirmPassword: "other-pass" })).toThrow(
      /Passwords do not match/,
    );
  });

  it("ignores a role sent by the client", () => {
    const parsed = ownerInput({ role: "barista" });
    expect("role" in parsed).toBe(false);
  });

  it("requires the setup code", async () => {
    await expect(
      provisionInitialOwner(null, ownerInput()),
    ).rejects.toMatchObject({
      statusCode: 401,
    });
    await expect(
      provisionInitialOwner("wrong".repeat(8), ownerInput()),
    ).rejects.toMatchObject({ statusCode: 401 });
    delete process.env.OWNER_SETUP_TOKEN;
    await expect(
      provisionInitialOwner(TOKEN, ownerInput()),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(calls.createUser).toHaveLength(0);
  });

  it("refuses a setup without the setup code", async () => {
    await expect(
      provisionInitialOwner(null, ownerInput()),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(calls.createUser).toHaveLength(0);
  });

  it("rejects the synthetic staff email domain", async () => {
    await expect(
      provisionInitialOwner(
        TOKEN,
        ownerInput({ email: usernameToAuthEmail("x") }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("is disabled once an Owner exists", async () => {
    await provisionInitialOwner(TOKEN, ownerInput());
    await expect(
      provisionInitialOwner(
        TOKEN,
        ownerInput({ email: "second@example.com", username: "second" }),
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: "SETUP_COMPLETE" });
    expect(db.users.filter((u) => u.role === "owner_admin")).toHaveLength(1);
  });

  it("lets only one of two concurrent registrations win and removes the loser's sign-in", async () => {
    const results = await Promise.allSettled([
      provisionInitialOwner(TOKEN, ownerInput()),
      provisionInitialOwner(
        TOKEN,
        ownerInput({ email: "other@example.com", username: "other" }),
      ),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = results.find(
      (r) => r.status === "rejected",
    ) as PromiseRejectedResult;
    expect(lost.reason).toMatchObject({
      statusCode: 409,
      code: "SETUP_COMPLETE",
    });
    expect(calls.deleteUser).toHaveLength(1);
    expect(db.auth).toHaveLength(1);
  });

  it("rejects an email already registered in Supabase Auth", async () => {
    db.auth.push({
      id: "x",
      email: "eric.owner@example.com",
      password: "p",
      confirmed: true,
    });
    await expect(
      provisionInitialOwner(TOKEN, ownerInput()),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Email address is already registered",
    });
    expect(db.users).toHaveLength(0);
  });

  it("rejects an email already stored on a profile", async () => {
    addProfile({
      auth_user_id: "a",
      username: "someone",
      full_name: "S",
      role: "barista",
      email: "eric.owner@example.com",
    });
    await expect(
      provisionInitialOwner(TOKEN, ownerInput()),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(calls.createUser).toHaveLength(0);
  });
});

describe("Barista account creation", () => {
  it("creates a barista with no email (users.email stays NULL)", async () => {
    const input = CreateEmployeeRequestSchema.parse({
      username: "Bea",
      password: "barista-pass",
      fullName: "Bea Santos",
      role: "barista",
    });
    const res = await createEmployeeAccount(ownerCaller, input);
    expect(res).toMatchObject({ username: "bea", role: "barista" });
    expect("email" in res).toBe(false);
    expect(calls.createUser[0]).toMatchObject({
      email: "bea@staff.gunitakopi.local",
      email_confirm: true,
    });
    expect(calls.insert[0]).not.toHaveProperty("email");
    expect(db.users[0]?.email ?? null).toBeNull();
  });

  it("rejects an owner_admin role and an email field is not accepted", () => {
    const base = { username: "bea", password: "barista-pass", fullName: "Bea" };
    expect(() =>
      CreateEmployeeRequestSchema.parse({ ...base, role: "owner_admin" }),
    ).toThrow(/Only barista accounts/);
    const parsed = CreateEmployeeRequestSchema.parse({
      ...base,
      role: "barista",
      email: "bea@example.com",
    });
    expect("email" in parsed).toBe(false);
  });
});

describe("Username sign-in", () => {
  beforeEach(async () => {
    await provisionInitialOwner(TOKEN, ownerInput());
    await createEmployeeAccount(
      ownerCaller,
      CreateEmployeeRequestSchema.parse({
        username: "bea",
        password: "barista-pass",
        fullName: "Bea",
        role: "barista",
      }),
    );
  });

  it("signs in a new Owner right away (email confirmed at setup)", () => {
    expect(db.auth[0]!.confirmed).toBe(true);
  });

  it("still refuses an Auth account whose email is unverified", async () => {
    db.auth[0]!.confirmed = false;
    await expect(
      loginWithUsername({ username: "eric", password: "s3cret-pass" }, IP),
    ).rejects.toMatchObject({ statusCode: 403, code: "EMAIL_NOT_CONFIRMED" });
  });

  it("gives the Owner no session after the password, only an emailed-code challenge", async () => {
    const res = await loginWithUsername(
      { username: "eric", password: "s3cret-pass" },
      IP,
    );
    expect(res).toEqual({ otpRequired: true, challenge: expect.any(String) });
    expect("accessToken" in res).toBe(false);
    // The password session is revoked; only the challenge hash is stored.
    expect(calls.signOut).toEqual([`at-${db.users[0]!.auth_user_id}`]);
    expect(db.challenges).toHaveLength(1);
    expect(JSON.stringify(db.challenges)).not.toContain(
      (res as { challenge: string }).challenge,
    );
  });

  it("accepts the Owner's email instead of the username", async () => {
    const res = await loginWithUsername(
      LoginRequestSchema.parse({ username: " Eric.Owner@Example.com ", password: "s3cret-pass" }),
      IP,
    );
    expect(res).toMatchObject({ otpRequired: true });
  });

  it("keeps the Owner's Auth identity on the real email, so Supabase recovery mail reaches it", () => {
    expect(db.auth[0]!.email).toBe("eric.owner@example.com");
    expect(db.users[0]!.email).toBe(db.auth[0]!.email);
  });

  it("signs a barista in by username through the unchanged internal mapping", async () => {
    const res = await loginWithUsername(
      {
        username: "bea",
        password: "barista-pass",
      },
      IP,
    );
    const bea = db.auth.find((u) => u.email === usernameToAuthEmail("bea"));
    expect(res).toMatchObject({ accessToken: `at-${bea!.id}` });
    expect(db.challenges).toHaveLength(0);
  });

  it("signs a renamed barista in to the same Auth account, by the new username only", async () => {
    // Regression: the profile username was edited after creation; the Auth email still carries
    // the old name. Sign-in must use the linked Auth account, not rebuild the email.
    db.users[1]!.username = "juan";
    const bea = db.auth.find((u) => u.email === usernameToAuthEmail("bea"));
    const res = await loginWithUsername({ username: "juan", password: "barista-pass" }, IP);
    expect(res).toMatchObject({ accessToken: `at-${bea!.id}` });
    await expect(
      loginWithUsername({ username: "bea", password: "barista-pass" }, IP),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("gives the same answer for a wrong password, an unknown user and an inactive user", async () => {
    const wrong = loginWithUsername({ username: "bea", password: "nope" }, IP);
    const unknown = loginWithUsername({ username: "ghost", password: "x" }, IP);
    db.users[1]!.status = "inactive";
    const inactive = loginWithUsername(
      {
        username: "bea",
        password: "barista-pass",
      },
      IP,
    );
    for (const p of [wrong, unknown, inactive]) {
      await expect(p).rejects.toMatchObject({
        statusCode: 401,
        message: "Invalid username or password",
      });
    }
  });
});

describe("Owner emailed sign-in code", () => {
  let challenge = "";
  beforeEach(async () => {
    await provisionInitialOwner(TOKEN, ownerInput());
    const res = await loginWithUsername({ username: "eric", password: "s3cret-pass" }, IP);
    challenge = (res as { challenge: string }).challenge;
    await ownerOtp({ action: "send", challenge });
  });
  const verify = (code = db.otp!.code) => ownerOtp({ action: "verify", challenge, code });

  it("sends the code through Supabase without creating users", () => {
    expect(calls.sendOtp).toEqual([
      { email: "eric.owner@example.com", options: { shouldCreateUser: false } },
    ]);
  });

  it("returns a session for the right code and approves only that session", async () => {
    const res = await verify();
    expect(res).toMatchObject({ refreshToken: "rt-otp" });
    expect(db.challenges[0]!.session_id).toBe("sess-1");
  });

  it("rejects a wrong code, and the challenge cannot be reused after success", async () => {
    await expect(verify("000000")).rejects.toMatchObject({ statusCode: 400, code: "INVALID_CODE" });
    await verify();
    await expect(verify()).rejects.toMatchObject({ statusCode: 401, code: "OTP_EXPIRED" });
  });

  it("rejects an expired challenge", async () => {
    db.challenges[0]!.expires_at = Date.now() - 1;
    await expect(verify()).rejects.toMatchObject({ code: "OTP_EXPIRED" });
  });

  it("rejects an expired or used Supabase code", async () => {
    db.otp!.used = true;
    await expect(verify()).rejects.toMatchObject({ code: "INVALID_CODE" });
  });

  it("locks the challenge after 5 wrong codes, even for the right one", async () => {
    for (let i = 0; i < 5; i++) await verify("000000").catch(() => undefined);
    await expect(verify()).rejects.toMatchObject({ statusCode: 429, code: "OTP_LIMIT" });
    expect(db.challenges[0]!.session_id).toBeNull();
  });

  it("limits resends: 60 s apart, at most 3 codes per sign-in", async () => {
    await expect(ownerOtp({ action: "send", challenge })).rejects.toMatchObject({
      code: "OTP_RESEND_WAIT",
    });
    db.challenges[0]!.last_sent_at = 0;
    await ownerOtp({ action: "send", challenge });
    db.challenges[0]!.last_sent_at = 0;
    await ownerOtp({ action: "send", challenge });
    db.challenges[0]!.last_sent_at = 0;
    await expect(ownerOtp({ action: "send", challenge })).rejects.toMatchObject({
      code: "OTP_LIMIT",
    });
  });

  it("refuses an unknown challenge", async () => {
    await expect(
      ownerOtp({ action: "verify", challenge: "x".repeat(43), code: "123456" }),
    ).rejects.toMatchObject({ code: "OTP_EXPIRED" });
  });

  it("a new password sign-in replaces the unfinished challenge", async () => {
    await loginWithUsername({ username: "eric", password: "s3cret-pass" }, IP);
    expect(db.challenges).toHaveLength(1);
    await expect(verify()).rejects.toMatchObject({ code: "OTP_EXPIRED" });
  });

  it("refuses the code once the Owner is deactivated", async () => {
    db.users[0]!.status = "inactive";
    await expect(verify()).rejects.toMatchObject({ code: "OTP_EXPIRED" });
  });
});

describe("Sign-in rate limiting", () => {
  beforeEach(async () => {
    await createEmployeeAccount(
      ownerCaller,
      CreateEmployeeRequestSchema.parse({
        username: "bea",
        password: "barista-pass",
        fullName: "Bea",
        role: "barista",
      }),
    );
  });
  // Through the route's schema, so usernames are normalized exactly as in production.
  const attempt = (username: string, password: string, ip = IP) =>
    loginWithUsername(LoginRequestSchema.parse({ username, password }), ip);
  const SHOP = "203.0.113.50";
  const attacker = (n: number) => `198.51.100.${n}`;

  it("locks a username+IP pair after 5 failures with a generic 429, even for the right password", async () => {
    for (let i = 0; i < 5; i++) {
      await expect(attempt("bea", "wrong")).rejects.toMatchObject({
        statusCode: 401,
      });
    }
    await expect(attempt("bea", "barista-pass")).rejects.toMatchObject({
      statusCode: 429,
      code: "TOO_MANY_ATTEMPTS",
      message: "Too many sign-in attempts. Try again later.",
    });
  });

  it("does not lock the real user out when someone else fails from another IP", async () => {
    for (let i = 0; i < 5; i++) {
      await expect(attempt("bea", "wrong", attacker(1))).rejects.toMatchObject({
        statusCode: 401,
      });
    }
    await expect(
      attempt("bea", "barista-pass", attacker(1)),
    ).rejects.toMatchObject({ statusCode: 429 });
    const ok = await attempt("bea", "barista-pass", SHOP);
    expect(ok).toHaveProperty("accessToken");
  });

  it("lets staff sign in from a trusted IP during a distributed attack on their username", async () => {
    await attempt("bea", "barista-pass", SHOP); // the shop terminal becomes trusted
    for (let n = 1; n <= 10; n++) {
      await expect(attempt("bea", "wrong", attacker(n))).rejects.toMatchObject({
        statusCode: 401,
      });
    }
    // The account-wide lock now applies to untrusted IPs (a new attacker IP, or a new device).
    await expect(
      attempt("bea", "barista-pass", attacker(11)),
    ).rejects.toMatchObject({ statusCode: 429 });
    // The trusted shop IP still signs in.
    const ok = await attempt("bea", "barista-pass", SHOP);
    expect(ok).toHaveProperty("accessToken");
  });

  it("locks an IP that sprays many usernames, without affecting other IPs", async () => {
    for (let i = 0; i < 20; i++) {
      await expect(attempt(`user${i}`, "x")).rejects.toMatchObject({
        statusCode: 401,
      });
    }
    await expect(attempt("bea", "barista-pass")).rejects.toMatchObject({
      statusCode: 429,
    });
    const ok = await attempt("bea", "barista-pass", SHOP);
    expect(ok).toHaveProperty("accessToken");
  });

  it("treats unknown usernames exactly like real ones, so lockouts reveal nothing", async () => {
    const results: number[] = [];
    for (const u of ["ghost", "bea"]) {
      for (let i = 0; i < 6; i++) {
        results.push(
          await attempt(u, "wrong", attacker(u.length)).then(
            () => 200,
            (e: { statusCode: number }) => e.statusCode,
          ),
        );
      }
    }
    expect(results).toEqual([
      401, 401, 401, 401, 401, 429, 401, 401, 401, 401, 401, 429,
    ]);
  });

  it("doubles the lock time on each repeated lockout (progressive)", async () => {
    const pair = () =>
      [...db.throttle.entries()].find(([k]) => k.startsWith("pair:"))![1];
    for (let i = 0; i < 5; i++)
      await attempt("bea", "wrong").catch(() => undefined);
    const first = pair().lockedUntil - Date.now();
    pair().lockedUntil = 0; // the first lock has expired
    for (let i = 0; i < 5; i++)
      await attempt("bea", "wrong").catch(() => undefined);
    const second = pair().lockedUntil - Date.now();
    expect(first).toBeGreaterThan(14 * 60_000);
    expect(first).toBeLessThanOrEqual(15 * 60_000);
    expect(second).toBeGreaterThan(29 * 60_000);
    expect(pair().lockouts).toBe(2);
  });

  it("a successful sign-in clears that pair's counter", async () => {
    for (let i = 0; i < 4; i++) {
      await expect(attempt("bea", "wrong")).rejects.toMatchObject({
        statusCode: 401,
      });
    }
    await attempt("bea", "barista-pass");
    await expect(attempt("bea", "wrong")).rejects.toMatchObject({
      statusCode: 401,
    });
    await expect(attempt("bea", "barista-pass")).resolves.toBeTruthy();
  });

  it("counts case and space variants of a username as one account", async () => {
    for (const u of ["bea", "BEA", " Bea ", "bEa", "bea "]) {
      await expect(attempt(u, "wrong")).rejects.toMatchObject({
        statusCode: 401,
      });
    }
    await expect(attempt("Bea", "barista-pass")).rejects.toMatchObject({
      statusCode: 429,
    });
  });

  it("counts concurrent failures without losing any", async () => {
    const settled = await Promise.allSettled(
      Array.from({ length: 8 }, () => attempt("bea", "wrong")),
    );
    expect(settled.every((r) => r.status === "rejected")).toBe(true);
    const pair = [...db.throttle.entries()].find(([k]) =>
      k.startsWith("pair:"),
    )![1];
    expect(pair.lockouts * 5 + pair.failures).toBe(8);
  });

  it.each(["blocked", "fail", "success"] as const)(
    "fails closed with 503 when the throttle %s operation fails",
    async (op) => {
      db.throttleDown = op;
      const password = op === "success" ? "barista-pass" : "wrong";
      await expect(attempt("bea", password)).rejects.toMatchObject({
        statusCode: 503,
        code: "SERVICE_UNAVAILABLE",
      });
    },
  );

  it("stores only hashed keys, never the username or IP", async () => {
    await expect(attempt("bea", "wrong")).rejects.toBeTruthy();
    const keys = [...db.throttle.keys()].sort().join(" ");
    expect(keys).not.toContain("bea");
    expect(keys).not.toContain(IP);
    expect(keys).toMatch(
      /^acct:[0-9a-f]{64} ip:[0-9a-f]{64} pair:[0-9a-f]{64}$/,
    );
  });
});

describe("clientIp", () => {
  const SECRET = "s".repeat(40);
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });
  const ipOf = async (headers: Record<string, string>) => {
    const { clientIp } = await import("@/server/lib/login-throttle");
    return clientIp(new Request("http://x", { headers }));
  };

  it("trusts the forwarded IP only with the shared proxy secret", async () => {
    process.env.INTERNAL_PROXY_SECRET = SECRET;
    expect(
      await ipOf({
        "x-gunita-client-ip": "203.0.113.9",
        "x-gunita-proxy-secret": SECRET,
      }),
    ).toBe("203.0.113.9");
    expect(
      await ipOf({
        "x-gunita-client-ip": "203.0.113.9",
        "x-gunita-proxy-secret": "nope",
      }),
    ).toBeNull();
    expect(
      await ipOf({
        "x-gunita-client-ip": "not-an-ip",
        "x-gunita-proxy-secret": SECRET,
      }),
    ).toBeNull();
    delete process.env.INTERNAL_PROXY_SECRET;
    expect(
      await ipOf({
        "x-gunita-client-ip": "203.0.113.9",
        "x-gunita-proxy-secret": "",
      }),
    ).toBeNull();
  });

  it("on Vercel uses x-real-ip and ignores a client-sent x-forwarded-for", async () => {
    process.env.VERCEL = "1";
    expect(
      await ipOf({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "6.6.6.6" }),
    ).toBe("1.1.1.1");
    expect(await ipOf({ "x-forwarded-for": "6.6.6.6" })).toBeNull();
  });

  it("in production without a trusted source returns null instead of a shared bucket", async () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    delete process.env.VERCEL;
    delete process.env.TRUSTED_CLIENT_IP_HEADER;
    expect(await ipOf({ "x-forwarded-for": "6.6.6.6" })).toBeNull();
    process.env.TRUSTED_CLIENT_IP_HEADER = "x-forwarded-for";
    expect(await ipOf({ "x-forwarded-for": "6.6.6.6, 10.0.0.7" })).toBe(
      "10.0.0.7",
    );
  });

  it("uses 127.0.0.1 in local development", async () => {
    delete process.env.VERCEL;
    delete process.env.TRUSTED_CLIENT_IP_HEADER;
    expect(await ipOf({})).toBe("127.0.0.1");
  });
});

describe("Error responses", () => {
  it("hides database details on 5xx", async () => {
    const { errorResponse } = await import("@/server/lib/response");
    const { AppError } = await import("@/server/lib/errors");
    const res = errorResponse(
      new AppError(
        'duplicate key value violates "users_pkey" (password=x)',
        500,
        "DATABASE_ERROR",
      ),
    );
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error.message).toBe("An unexpected error occurred");
    expect(JSON.stringify(body)).not.toContain("users_pkey");
  });

  it("hides raw messages of unexpected errors", async () => {
    const { errorResponse } = await import("@/server/lib/response");
    const body = await errorResponse(
      new Error("connect ECONNREFUSED db:5432"),
    ).json();
    expect(body.error.message).toBe("An unexpected error occurred");
  });

  it("returns validation errors as 400 with field paths", async () => {
    const { errorResponse } = await import("@/server/lib/response");
    const parsed = LoginRequestSchema.safeParse({
      username: "x",
      password: "",
    });
    const res = errorResponse(parsed.error);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(
      body.error.details.map((d: { path: string[] }) => d.path[0]),
    ).toEqual(["username", "password"]);
  });
});

describe("POST /api/auth/otp route", () => {
  // Why: the route must validate before any code is sent or checked; a bad body is a 400.
  it("refuses a body without a valid action and challenge", async () => {
    const { POST } = await import("@/server/routes/auth/otp/route");
    const res = await POST(new Request("http://localhost:3002/api/auth/otp", { method: "POST", body: "{}" }) as never);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });
});
