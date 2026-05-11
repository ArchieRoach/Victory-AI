import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en/translation.json";
import es from "./locales/es/translation.json";
import fr from "./locales/fr/translation.json";
import ptBR from "./locales/pt-BR/translation.json";
import de from "./locales/de/translation.json";
import ar from "./locales/ar/translation.json";
import ru from "./locales/ru/translation.json";
import pl from "./locales/pl/translation.json";
import zhCN from "./locales/zh-CN/translation.json";
import ja from "./locales/ja/translation.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en:    { translation: en },
      es:    { translation: es },
      fr:    { translation: fr },
      "pt-BR": { translation: ptBR },
      de:    { translation: de },
      ar:    { translation: ar },
      ru:    { translation: ru },
      pl:    { translation: pl },
      "zh-CN": { translation: zhCN },
      ja:    { translation: ja },
    },
    fallbackLng: "en",
    supportedLngs: ["en", "es", "fr", "pt-BR", "de", "ar", "ru", "pl", "zh-CN", "ja"],
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
