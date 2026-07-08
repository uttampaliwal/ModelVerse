const COLORS: Record<string, string> = {
  error: '#ef4444',
  warn: '#f59e0b',
  info: '#3b82f6',
  debug: '#6b7280',
};

export function logError(context: string, err: unknown, extra?: Record<string, unknown>): void {
  const msg = err instanceof Error ? err.message : String(err);
  console.groupCollapsed(
    `%c[ERROR]%c ${context} %c${msg}`,
    `color:${COLORS.error};font-weight:bold`,
    'color:inherit',
    'color:#999',
  );
  console.error(err);
  if (extra) console.table(extra);
  console.groupEnd();
}

export function logWarn(context: string, msg: string, extra?: Record<string, unknown>): void {
  console.groupCollapsed(
    `%c[WARN]%c ${context} %c${msg}`,
    `color:${COLORS.warn};font-weight:bold`,
    'color:inherit',
    'color:#999',
  );
  if (extra) console.table(extra);
  console.groupEnd();
}

export function logInfo(context: string, msg: string, extra?: Record<string, unknown>): void {
  console.groupCollapsed(
    `%c[INFO]%c ${context} %c${msg}`,
    `color:${COLORS.info};font-weight:bold`,
    'color:inherit',
    'color:#999',
  );
  if (extra) console.table(extra);
  console.groupEnd();
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  { retries = 2, delayMs = 500, context = 'operation' }: { retries?: number; delayMs?: number; context?: string } = {},
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        logWarn(context, `Attempt ${attempt + 1} failed, retrying in ${delayMs}ms...`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr;
}
