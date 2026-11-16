import { checkUserChange } from "@gunita/contracts";
import type { CreateEmployeeRequest, CreateSupplierRequest, Role, Supplier, UserProfile } from "@gunita/contracts";
import { slug, uniqueId } from "./catalog";
import { MockError, ownerData, type MockState } from "./state";

// ---- Suppliers ----

export function listSuppliers(state: MockState): Supplier[] {
  return ownerData(state).suppliers.map((s) => ({ ...s }));
}

function findSupplier(state: MockState, id: string): Supplier {
  const s = ownerData(state).suppliers.find((x) => x.id === id);
  if (!s) throw new MockError("NOT_FOUND", "Supplier not found.");
  return s;
}

export function createSupplier(state: MockState, req: CreateSupplierRequest, now: Date): Supplier {
  if (!req.name.trim()) throw new MockError("VALIDATION", "Supplier name is required.");
  const { suppliers } = ownerData(state);
  const base = `sup-${slug(req.name)}`;
  const id = uniqueId((x) => suppliers.some((s) => s.id === x), base);
  const s: Supplier = { ...req, id, name: req.name.trim(), isActive: true, createdAt: now.toISOString() };
  suppliers.push(s);
  return { ...s };
}

export function updateSupplier(state: MockState, id: string, patch: Partial<CreateSupplierRequest>): Supplier {
  const s = findSupplier(state, id);
  if (patch.name !== undefined && !patch.name.trim()) throw new MockError("VALIDATION", "Supplier name is required.");
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) (s as Record<string, unknown>)[k] = v;
  if (patch.name !== undefined) s.name = patch.name.trim();
  return { ...s };
}

export function setSupplierActive(state: MockState, id: string, isActive: boolean): Supplier {
  const s = findSupplier(state, id);
  s.isActive = isActive;
  return { ...s };
}

// ---- Users ----

function strip(u: UserProfile & { password?: string }): UserProfile {
  const { password: _password, ...profile } = u;
  return profile;
}

export function listUsers(state: MockState): UserProfile[] {
  return ownerData(state).users.map(strip);
}

const MIN_PASSWORD = "Password must be at least 8 characters";

export function createUser(
  state: MockState,
  req: CreateEmployeeRequest & { username: string },
  now: Date,
): UserProfile {
  const { users } = ownerData(state);
  const username = req.username.trim();
  const email = req.email.trim();
  if (!username) throw new MockError("VALIDATION", "Username is required.");
  if (!email) throw new MockError("VALIDATION", "Email is required.");
  if (req.fullName.trim().length < 2) throw new MockError("VALIDATION", "Full name is required");
  if (req.password.length < 8) throw new MockError("VALIDATION", MIN_PASSWORD);
  if (users.some((u) => u.username?.toLowerCase() === username.toLowerCase())) {
    throw new MockError("VALIDATION", "That username is already taken.");
  }
  if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    throw new MockError("VALIDATION", "That email is already in use.");
  }
  const base = `u-${username.toLowerCase()}`;
  const id = uniqueId((x) => users.some((u) => u.id === x), base);
  const user = {
    id,
    authUserId: id,
    email,
    fullName: req.fullName.trim(),
    username,
    role: req.role,
    isActive: true,
    createdAt: now.toISOString(),
    password: req.password,
    ...(req.phone !== undefined ? { phone: req.phone } : {}),
  };
  users.push(user);
  return strip(user);
}

export function updateUser(
  state: MockState,
  id: string,
  patch: { fullName?: string; role?: Role; isActive?: boolean; password?: string },
  currentUserId: string,
): UserProfile {
  const { users } = ownerData(state);
  const u = users.find((x) => x.id === id);
  if (!u) throw new MockError("NOT_FOUND", "User not found.");
  const next = { role: patch.role ?? u.role, isActive: patch.isActive ?? u.isActive };
  const check = checkUserChange(users, id, next, currentUserId);
  if (!check.ok) throw new MockError("FORBIDDEN", check.message);
  if (patch.fullName !== undefined && patch.fullName.trim().length < 2) {
    throw new MockError("VALIDATION", "Full name is required");
  }
  if (patch.password !== undefined && patch.password.length < 8) throw new MockError("VALIDATION", MIN_PASSWORD);
  if (patch.fullName !== undefined) u.fullName = patch.fullName.trim();
  if (patch.password !== undefined) u.password = patch.password;
  u.role = next.role;
  u.isActive = next.isActive;
  return strip(u);
}
