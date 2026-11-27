import { describe, expect, it, vi } from 'vitest';
import { copyToClipboard, type ClipboardEnv } from './clipboard';

const text = 'Hocam merhaba,\n\nİkinci paragraf ğüşıöç\n    girintili satır';

function env(
  overrides: Partial<ClipboardEnv> = {},
): ClipboardEnv & { writeText: ReturnType<typeof vi.fn> } {
  const writeText = vi.fn(async () => undefined);
  return {
    clipboard: { writeText, write: vi.fn() },
    isSecureContext: true,
    ...overrides,
    writeText,
  } as never;
}

describe('copyToClipboard', () => {
  it('writes the exact text (line breaks, indentation, Turkish letters)', async () => {
    const e = env();
    await expect(copyToClipboard({ plain: text, format: 'plain' }, e)).resolves.toEqual({
      ok: true,
    });
    expect(e.writeText).toHaveBeenCalledWith(text);
  });

  it('reports unavailable outside a secure context instead of pretending success', async () => {
    await expect(
      copyToClipboard({ plain: text, format: 'plain' }, env({ isSecureContext: false })),
    ).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });

  it('reports denied permission', async () => {
    const denied = {
      writeText: vi.fn(async () => Promise.reject(new DOMException('no', 'NotAllowedError'))),
      write: vi.fn(),
    };
    await expect(
      copyToClipboard({ plain: text, format: 'plain' }, env({ clipboard: denied as never })),
    ).resolves.toEqual({
      ok: false,
      reason: 'denied',
    });
  });

  it('uses ClipboardItem with plain fallback for rich copy', async () => {
    const write = vi.fn(async () => undefined);
    class FakeItem {
      constructor(readonly items: Record<string, Blob>) {}
    }
    const e = env({
      clipboard: { writeText: vi.fn(), write } as never,
      ClipboardItem: FakeItem as never,
    });
    await copyToClipboard({ plain: 'a', html: '<b>a</b>', format: 'rich' }, e);
    const item = (write.mock.calls[0] as unknown as [FakeItem[]])[0][0]!;
    expect(Object.keys(item.items)).toEqual(['text/plain', 'text/html']);
  });
});
