import { useQuery, type UseQueryOptions, type QueryKey } from "@tanstack/react-query";
import { LIVE_QUERY_OPTIONS } from "./query";

/** `useQuery` with the live-refresh defaults (5 s polling + refetch on focus). */
export function useLiveQuery<T>(key: QueryKey, fn: () => Promise<T>, options?: Omit<UseQueryOptions<T>, "queryKey" | "queryFn">) {
  return useQuery<T>({ queryKey: key, queryFn: fn, ...LIVE_QUERY_OPTIONS, ...options });
}
