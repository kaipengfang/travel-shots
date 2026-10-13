'use client';

import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from 'react';

export type Locale = 'zh' | 'en';

const STORAGE_KEY = 'photo_locale';
const DEFAULT_LOCALE: Locale = 'zh';

// 模块级 store：localStorage 持久化，跨页面导航保持，不会每次进入页面闪现默认语言
const listeners = new Set<() => void>();

function readStoredLocale(): Locale {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener('storage', callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener('storage', callback);
  };
}

function writeStoredLocale(locale: Locale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // localStorage 不可用时忽略，仅本次会话生效
  }
  listeners.forEach(cb => cb());
}

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  // 服务端 / 水合阶段使用默认语言，客户端随后同步到 localStorage 中的值
  const locale = useSyncExternalStore(subscribe, readStoredLocale, () => DEFAULT_LOCALE);
  const setLocale = useCallback((next: Locale) => writeStoredLocale(next), []);

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}
