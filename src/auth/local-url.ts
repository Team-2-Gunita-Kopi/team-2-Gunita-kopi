const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function isLoopbackHost(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname.toLowerCase().replace(/^\[|\]$/g, ""));
}

export function isLoopbackUrl(value: string): boolean {
  try {
    return isLoopbackHost(new URL(value).hostname);
  } catch {
    return false;
  }
}
