import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { isDomainError } from '@panoya/domain';
import { en } from './en';
import { tr, type MessageKey } from './tr';

export type { MessageKey };
export type UiLocale = 'tr-TR' | 'en-US';

const dictionaries: Record<UiLocale, Record<MessageKey, string>> = { 'tr-TR': tr, 'en-US': en };

export type Params = Record<string, string | number>;

export interface I18n {
  locale: UiLocale;
  t(key: MessageKey, params?: Params): string;
  /** Message for an error, falling back to a generic text (never raw error strings). */
  errorText(error: unknown): string;
  formatDateTime(iso: string): string;
}

export function createI18n(locale: UiLocale): I18n {
  const dict = dictionaries[locale];
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const t = (key: MessageKey, params?: Params) => {
    const template = dict[key] ?? tr[key] ?? key;
    return params
      ? template.replace(/\{(\w+)\}/g, (m, name: string) => String(params[name] ?? m))
      : template;
  };
  return {
    locale,
    t,
    errorText(error) {
      if (isDomainError(error) && error.messageKey in dict) {
        return t(error.messageKey as MessageKey, error.details as Params);
      }
      if (error instanceof DOMException && error.name === 'QuotaExceededError')
        return t('error.quota');
      return t('error.generic');
    },
    formatDateTime: (iso) => dateFormat.format(new Date(iso)),
  };
}

export function detectLocale(languages: readonly string[] = navigator.languages): UiLocale {
  const first = languages[0]?.toLowerCase() ?? 'tr';
  return first.startsWith('en') ? 'en-US' : 'tr-TR';
}

const I18nContext = createContext<I18n>(createI18n('tr-TR'));

export function I18nProvider({ locale, children }: { locale: UiLocale; children: ReactNode }) {
  const value = useMemo(() => createI18n(locale), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}
