import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export interface MenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  /** Why the item is disabled (shown as its description). */
  disabledReason?: string;
  destructive?: boolean;
}

interface MenuButtonProps {
  label: string;
  items: MenuItem[];
  children: ReactNode;
  className?: string;
  align?: 'start' | 'end';
}

/**
 * Accessible menu button (WAI-ARIA menu pattern): arrow keys, Home/End, Esc, type-ahead free.
 * On small screens the CSS renders the menu as a bottom sheet.
 */
export function MenuButton({
  label,
  items,
  children,
  className = 'icon-btn',
  align = 'end',
}: MenuButtonProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const first = menuRef.current?.querySelector<HTMLElement>(
      '[role="menuitem"]:not([aria-disabled="true"])',
    );
    first?.focus();
    const onPointer = (e: PointerEvent) => {
      if (
        !menuRef.current?.contains(e.target as Node) &&
        !buttonRef.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const nodes = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const index = nodes.indexOf(document.activeElement as HTMLElement);
    const focusAt = (i: number) => nodes[(i + nodes.length) % nodes.length]?.focus();
    if (e.key === 'ArrowDown') focusAt(index + 1);
    else if (e.key === 'ArrowUp') focusAt(index - 1);
    else if (e.key === 'Home') focusAt(0);
    else if (e.key === 'End') focusAt(nodes.length - 1);
    else if (e.key === 'Escape' || e.key === 'Tab') close(e.key === 'Escape');
    else return;
    e.preventDefault();
  };

  return (
    <div className="menu-anchor">
      <button
        ref={buttonRef}
        type="button"
        className={className}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {children}
      </button>
      {open && (
        <>
          <div className="menu-scrim" aria-hidden="true" onClick={() => close(false)} />
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            className={`menu menu-${align}`}
            onKeyDown={onKeyDown}
          >
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={`menu-item${item.destructive ? ' menu-item-danger' : ''}`}
                aria-disabled={item.disabled || undefined}
                title={item.disabled ? item.disabledReason : undefined}
                onClick={() => {
                  if (item.disabled) return;
                  close(true);
                  item.onSelect();
                }}
              >
                {item.icon && (
                  <span className="menu-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                )}
                <span>{item.label}</span>
                {item.disabled && item.disabledReason && (
                  <span className="menu-reason">{item.disabledReason}</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
