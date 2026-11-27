/**
 * After navigating to a page, scroll a block into view and flash it (search results, backlinks).
 * Polls briefly because the page renders asynchronously after its blocks load.
 */
export function revealBlock(blockId: string, timeoutMs = 1500): void {
  const started = performance.now();
  const tick = () => {
    const el = document.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`);
    if (el) {
      el.scrollIntoView({ block: 'center' });
      el.classList.add('is-revealed');
      setTimeout(() => el.classList.remove('is-revealed'), 1600);
      return;
    }
    if (performance.now() - started < timeoutMs) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
