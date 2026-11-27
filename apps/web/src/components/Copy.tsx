import { Check, Copy as CopyIcon } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useI18n } from '../i18n';
import { copyToClipboard, type CopyRequest } from '../services/clipboard';
import { Dialog } from './Dialog';
import { useToast } from './Toasts';

type CopyFn = (request: CopyRequest) => Promise<boolean>;

const CopyContext = createContext<CopyFn>(async () => false);

/**
 * Provides `copy()`: tries the async clipboard and, when the browser refuses, opens a dialog with
 * the text pre-selected so the user can copy with the OS. Success is announced only after the
 * browser confirmed the write.
 */
export function CopyProvider({ children }: { children: ReactNode }) {
  const [fallback, setFallback] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const { t } = useI18n();
  const toast = useToast();

  const copy = useCallback<CopyFn>(
    async (request) => {
      const result = await copyToClipboard(request);
      if (result.ok) {
        toast.announce(t('copy.done'));
        return true;
      }
      setFallback(request.plain);
      return false;
    },
    [t, toast],
  );

  useEffect(() => {
    if (fallback !== null) textRef.current?.select();
  }, [fallback]);

  return (
    <CopyContext.Provider value={copy}>
      {children}
      <Dialog
        open={fallback !== null}
        title={t('copy.failedTitle')}
        onClose={() => setFallback(null)}
        initialFocus={textRef}
      >
        <p>{t('copy.failedBody')}</p>
        <textarea
          ref={textRef}
          className="input copy-fallback"
          readOnly
          value={fallback ?? ''}
          rows={8}
          onFocus={(e) => e.currentTarget.select()}
        />
      </Dialog>
    </CopyContext.Provider>
  );
}

export function useCopy(): CopyFn {
  return useContext(CopyContext);
}

interface CopyButtonProps {
  /** Text computed at click time so it always reflects the latest draft. */
  getText: () => string;
  label: string;
  variant?: 'primary' | 'ghost' | 'icon';
  disabled?: boolean;
}

export function CopyButton({ getText, label, variant = 'ghost', disabled }: CopyButtonProps) {
  const copy = useCopy();
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(false), 1500);
    return () => clearTimeout(timer);
  }, [done]);

  const onClick = () => {
    // Called synchronously inside the gesture; the clipboard promise starts here.
    void copy({ plain: getText(), format: 'plain' }).then((ok) => setDone(ok));
  };
  const icon = done ? (
    <Check size={16} aria-hidden="true" />
  ) : (
    <CopyIcon size={16} aria-hidden="true" />
  );
  if (variant === 'icon') {
    return (
      <button
        type="button"
        className="icon-btn"
        aria-label={done ? t('copy.done') : label}
        title={label}
        onClick={onClick}
        disabled={disabled}
      >
        {icon}
      </button>
    );
  }
  return (
    <button
      type="button"
      className={`btn ${variant === 'primary' ? 'btn-primary' : 'btn-ghost'}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      <span>{done ? t('copy.done') : label}</span>
    </button>
  );
}
