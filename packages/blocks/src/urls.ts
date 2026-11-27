/**
 * URL safety rules for links (spec 08). Only http/https (and mailto where explicitly allowed) are
 * accepted; embedded credentials are rejected. The full URL including query and fragment is kept.
 */
export type UrlProblem = 'empty' | 'malformed' | 'scheme' | 'credentials' | 'tooLong';

export type UrlCheck =
  | { ok: true; href: string; host: string; scheme: 'http' | 'https' | 'mailto' }
  | { ok: false; problem: UrlProblem };

export const MAX_URL_LENGTH = 8192;

export function checkUrl(raw: string, options: { allowMailto?: boolean } = {}): UrlCheck {
  const input = raw.trim();
  if (input.length === 0) return { ok: false, problem: 'empty' };
  if (input.length > MAX_URL_LENGTH) return { ok: false, problem: 'tooLong' };
  // Control characters and whitespace inside the URL are a common obfuscation trick.
  // eslint-disable-next-line no-control-regex -- matching control characters is the point here
  if (/[\u0000-\u001f\u007f\s]/.test(input)) return { ok: false, problem: 'malformed' };

  let candidate = input;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) {
    // "example.com/path" → assume https, but only when it looks like a host.
    if (/^[^/?#:@]+\.[^/?#:@]+/.test(candidate)) candidate = `https://${candidate}`;
    else return { ok: false, problem: 'malformed' };
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, problem: 'malformed' };
  }
  const scheme = url.protocol.slice(0, -1).toLowerCase();
  if (scheme === 'mailto') {
    return options.allowMailto
      ? { ok: true, href: url.href, host: url.pathname, scheme: 'mailto' }
      : { ok: false, problem: 'scheme' };
  }
  if (scheme !== 'http' && scheme !== 'https') return { ok: false, problem: 'scheme' };
  if (url.username !== '' || url.password !== '') return { ok: false, problem: 'credentials' };
  if (url.hostname === '') return { ok: false, problem: 'malformed' };
  // Preserve the user's exact text when it was already absolute; URL normalisation may re-encode.
  const href = candidate === input ? input : url.href;
  return { ok: true, href, host: url.hostname, scheme };
}

export function isSafeUrl(raw: string, options?: { allowMailto?: boolean }): boolean {
  return checkUrl(raw, options).ok;
}

/** Human readable fallback title from a URL, e.g. "example.invalid". */
export function titleFromUrl(raw: string): string {
  const check = checkUrl(raw);
  return check.ok ? check.host.replace(/^www\./, '') : '';
}
