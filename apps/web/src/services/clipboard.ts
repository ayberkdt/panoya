/**
 * Clipboard service (spec 08). Must be called synchronously from a user gesture handler. Success is
 * reported only when the browser confirmed the write; otherwise the caller shows a manual-copy
 * fallback. Nothing is ever read from the clipboard and nothing is transmitted.
 */
export type CopyFormat = 'plain' | 'rich' | 'markdown' | 'csv' | 'json' | 'latex';

export interface CopyRequest {
  plain: string;
  /** Sanitized HTML for rich copy; only used when ClipboardItem is supported. */
  html?: string;
  format: CopyFormat;
}

export type CopyResult = { ok: true } | { ok: false; reason: 'unavailable' | 'denied' | 'failed' };

export interface ClipboardEnv {
  clipboard?: Pick<Clipboard, 'writeText' | 'write'> | undefined;
  ClipboardItem?: typeof ClipboardItem | undefined;
  isSecureContext: boolean;
}

function browserEnv(): ClipboardEnv {
  return {
    clipboard: typeof navigator !== 'undefined' ? navigator.clipboard : undefined,
    ClipboardItem: typeof ClipboardItem !== 'undefined' ? ClipboardItem : undefined,
    isSecureContext: typeof window !== 'undefined' && window.isSecureContext,
  };
}

export async function copyToClipboard(
  request: CopyRequest,
  env: ClipboardEnv = browserEnv(),
): Promise<CopyResult> {
  const { clipboard } = env;
  if (!env.isSecureContext || !clipboard) return { ok: false, reason: 'unavailable' };
  try {
    if (request.html && env.ClipboardItem && typeof clipboard.write === 'function') {
      const item = new env.ClipboardItem({
        'text/plain': new Blob([request.plain], { type: 'text/plain' }),
        'text/html': new Blob([request.html], { type: 'text/html' }),
      });
      await clipboard.write([item]);
    } else {
      await clipboard.writeText(request.plain);
    }
    return { ok: true };
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    return { ok: false, reason: name === 'NotAllowedError' ? 'denied' : 'failed' };
  }
}
