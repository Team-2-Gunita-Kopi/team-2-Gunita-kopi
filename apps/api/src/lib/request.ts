import { z } from "zod";
import { IdSchema, type Page, type PaginationQuery } from "@gunita/contracts";
import { AppError } from "./errors";

/** Parses and validates a JSON body. Malformed JSON is a 400, not a 500. */
export async function readJson<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new AppError("Request body must be valid JSON", 400, "INVALID_JSON");
  }
  return schema.parse(body);
}

/** Validates the query string. */
export function readQuery<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
): z.infer<T> {
  return schema.parse(Object.fromEntries(new URL(req.url).searchParams));
}

/** Reads the [id] path segment as a positive integer database id. */
export async function readId(ctx: {
  params: Promise<{ id: string }>;
}): Promise<number> {
  return IdSchema.parse((await ctx.params).id);
}

/** Makes \, % and _ match literally in a LIKE/ILIKE pattern (search is plain text). */
export const escapeLike = (s: string): string =>
  s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** PostgREST .range() bounds for a page (inclusive). */
export function pageRange(q: PaginationQuery): [number, number] {
  const from = (q.page - 1) * q.pageSize;
  return [from, from + q.pageSize - 1];
}

export function toPage<T>(
  items: T[],
  total: number | null,
  q: PaginationQuery,
): Page<T> {
  return {
    items,
    page: q.page,
    pageSize: q.pageSize,
    total: total ?? items.length,
  };
}
