import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";

const LANGUAGES = [
  { code: "en",    label: "English",    flag: "🇬🇧" },
  { code: "es",    label: "Español",    flag: "🇪🇸" },
  { code: "fr",    label: "Français",   flag: "🇫🇷" },
  { code: "pt-BR", label: "Português",  flag: "🇧🇷" },
  { code: "de",    label: "Deutsch",    flag: "🇩🇪" },
  { code: "ar",    label: "العربية",    flag: "🇸🇦" },
  { code: "ru",    label: "Русский",    flag: "🇷🇺" },
  { code: "pl",    label: "Polski",     flag: "🇵🇱" },
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
