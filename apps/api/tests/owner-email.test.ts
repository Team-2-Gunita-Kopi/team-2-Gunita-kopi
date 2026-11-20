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
};

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

vi.mock("../src/lib/supabase-admin", () => ({
  supabaseAdmin: {
    from: (table: string) => ({
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

vi.mock("../src/lib/supabase-user", () => ({
  createAuthClient: () => ({
    auth: {
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

const { provisionInitialOwner } = await import("../src/modules/setup/service");
const { createEmployeeAccount } =
  await import("../src/modules/employees/service");
const { loginWithUsername } = await import("../src/modules/session/service");
const {
  OwnerSetupRequestSchema,
  CreateEmployeeRequestSchema,
  LoginRequestSchema,
} = await import("@gunita/contracts");
const { usernameToAuthEmail } = await import("@gunita/auth");
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
    // Confirmed at creation so the Owner can sign in and set up MFA right away.
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

  it("allows a tokenless setup only when the local route authorizes it", async () => {
    const res = await provisionInitialOwner(null, ownerInput(), {
      allowLocalNoToken: true,
    });
    expect(res.role).toBe("owner_admin");
    expect(calls.createUser[0]).toMatchObject({
      app_metadata: { role: "owner_admin" },
    });
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

  it("signs the Owner in by username through the real email", async () => {
    db.auth[0]!.confirmed = true;
    const res = await loginWithUsername(
      {
        username: "eric",
        password: "s3cret-pass",
      },
      IP,
    );
    expect(res.accessToken).toBe(`at-${db.users[0]!.auth_user_id}`);
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
    expect(res.accessToken).toBe(`at-${bea!.id}`);
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
    expect(ok.accessToken).toBeTruthy();
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
    expect(ok.accessToken).toBeTruthy();
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
    expect(ok.accessToken).toBeTruthy();
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
    const { clientIp } = await import("../src/lib/login-throttle");
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
    const { errorResponse } = await import("../src/lib/response");
    const { AppError } = await import("../src/lib/errors");
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
    const { errorResponse } = await import("../src/lib/response");
    const body = await errorResponse(
      new Error("connect ECONNREFUSED db:5432"),
    ).json();
    expect(body.error.message).toBe("An unexpected error occurred");
  });

  it("returns validation errors as 400 with field paths", async () => {
    const { errorResponse } = await import("../src/lib/response");
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
