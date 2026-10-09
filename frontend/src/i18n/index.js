import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en/translation.json";

// English ships with the app (it's also the fallback). Every other language is its own
// small file fetched only for people who use it, instead of all 10 downloading for everyone.
export const LANGUAGE_LOADERS = {
  es: () => import("./locales/es/translation.json"),
  fr: () => import("./locales/fr/translation.json"),
  "pt-BR": () => import("./locales/pt-BR/translation.json"),
  de: () => import("./locales/de/translation.json"),
  ar: () => import("./locales/ar/translation.json"),
  ru: () => import("./locales/ru/translation.json"),
  pl: () => import("./locales/pl/translation.json"),
  "zh-CN": () => import("./locales/zh-CN/translation.json"),
  ja: () => import("./locales/ja/translation.json"),
};

export async function ensureLanguage(lng, instance = i18n) {
  const code = Object.keys(LANGUAGE_LOADERS).find((k) => k === lng || k === String(lng).split("-")[0]);
  if (!code || instance.hasResourceBundle(code, "translation")) return;
  try {
    const mod = await LANGUAGE_LOADERS[code]();
    instance.addResourceBundle(code, "translation", mod.default || mod, true, true);
  } catch {
    // Offline or a stale build: the English fallback keeps every screen readable.
  }
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en } },
    partialBundledLanguages: true,
    fallbackLng: "en",
    supportedLngs: ["en", "es", "fr", "pt-BR", "de", "ar", "ru", "pl", "zh-CN", "ja"],
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
    interpolation: {
      escapeValue: false,
    },
    // Re-render when a language file arrives, not only when the language changes.
    react: { bindI18n: "languageChanged", bindI18nStore: "added" },
  });

i18n.on("languageChanged", (lng) => { ensureLanguage(lng); });
ensureLanguage(i18n.language);

export default i18n;
