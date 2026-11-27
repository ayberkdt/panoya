import { X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useI18n } from '../i18n';

export interface ToastInput {
  message: string;
  tone?: 'info' | 'error';
  action?: { label: string; run: () => void };
  /** ms; errors stay until dismissed. */
  duration?: number;
}

interface ToastItem extends ToastInput {
  id: number;
}

interface ToastApi {
  show(toast: ToastInput): void;
  /** Screen-reader only announcement (e.g. "Kopyalandı"). */
  announce(message: string): void;
}

const ToastContext = createContext<ToastApi>({ show: () => undefined, announce: () => undefined });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const nextId = useRef(1);
  const { t } = useI18n();

  const dismiss = useCallback(
    (id: number) => setItems((list) => list.filter((i) => i.id !== id)),
    [],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show(toast) {
        const id = nextId.current++;
        setItems((list) => [...list.slice(-2), { ...toast, id }]);
        const duration =
          toast.duration ?? (toast.tone === 'error' ? 0 : toast.action ? 6000 : 3000);
        if (duration > 0) setTimeout(() => dismiss(id), duration);
      },
      announce(message) {
        // Re-setting the same text would not be re-announced; clear first.
        setAnnouncement('');
        requestAnimationFrame(() => setAnnouncement(message));
      },
    }),
    [dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <div className="toasts" role="status" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className={`toast${item.tone === 'error' ? ' toast-error' : ''}`}>
            <span className="toast-message">{item.message}</span>
            {item.action && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  item.action?.run();
                  dismiss(item.id);
                }}
              >
                {item.action.label}
              </button>
            )}
            <button
              type="button"
              className="icon-btn"
              aria-label={t('toast.dismiss')}
              onClick={() => dismiss(item.id)}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}
