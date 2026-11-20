import i18n from "@/i18n";

// Translate without a hook, so any screen line can be wrapped. The app re-draws when the
// language (or its file) changes, so these always show the current language.
export const tx = (key, english, vars) => i18n.t(key, { defaultValue: english, ...vars });
