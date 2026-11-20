import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { tx } from "@/i18n/tx";

const LANGUAGES = [
  { code: "en",    get label() { return tx("ui.languageSelector.english", "English"); },    flag: "🇬🇧" },
  { code: "es",    get label() { return tx("ui.languageSelector.espaOl", "Español"); },    flag: "🇪🇸" },
  { code: "fr",    get label() { return tx("ui.languageSelector.franAis", "Français"); },   flag: "🇫🇷" },
  { code: "pt-BR", get label() { return tx("ui.languageSelector.portuguS", "Português"); },  flag: "🇧🇷" },
  { code: "de",    get label() { return tx("ui.languageSelector.deutsch", "Deutsch"); },    flag: "🇩🇪" },
  { code: "ar",    label: "العربية",    flag: "🇸🇦" },
  { code: "ru",    label: "Русский",    flag: "🇷🇺" },
  { code: "pl",    get label() { return tx("ui.languageSelector.polski", "Polski"); },     flag: "🇵🇱" },
  { code: "zh-CN", label: "中文",        flag: "🇨🇳" },
  { code: "ja",    label: "日本語",      flag: "🇯🇵" },
];

export const LanguageSelector = () => {
  const { i18n, t } = useTranslation();
  const current = LANGUAGES.find((l) => l.code === i18n.resolvedLanguage) || LANGUAGES[0];

  const handleChange = (e) => {
    i18n.changeLanguage(e.target.value);
    document.documentElement.dir = e.target.value === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = e.target.value;
  };

  return (
    <div className="flex items-center gap-2">
      <Globe className="w-4 h-4 text-victory-muted flex-shrink-0" />
      <select
        value={i18n.resolvedLanguage}
        onChange={handleChange}
        className="victory-input py-1 px-2 text-sm cursor-pointer"
        aria-label={t("profile.language")}
      >
        {LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.flag} {lang.label}
          </option>
        ))}
      </select>
    </div>
  );
};
