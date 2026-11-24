import type { Role } from "../roles";

export function checkUserChange(
  users: { id: string; role: Role; isActive: boolean }[],
  targetId: string,
  next: { role: Role; isActive: boolean },
  currentUserId: string,
): { ok: true } | { ok: false; message: string } {
  if (targetId === currentUserId && !next.isActive) {
    return { ok: false, message: "You can't deactivate your own account." };
  }
  const target = users.find((u) => u.id === targetId);
  const wasActiveOwner = !!target && target.role === "owner_admin" && target.isActive;
  const staysActiveOwner = next.role === "owner_admin" && next.isActive;
  if (wasActiveOwner && !staysActiveOwner) {
    const otherOwners = users.filter(
      (u) => u.id !== targetId && u.role === "owner_admin" && u.isActive,
    );
    if (otherOwners.length === 0) {
      return { ok: false, message: "At least one active Owner must remain." };
    }
  }
  return { ok: true };
}
