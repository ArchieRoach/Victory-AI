import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import i18n, { ensureLanguage } from "@/i18n";
import App from "@/App";
import { installTheme } from "@/theme/theme";

// Colours come from the one theme file, installed before anything paints.
installTheme();

// Wait (briefly) for the reader's language file so the first screen isn't English, then a swap.
const ready = Promise.race([ensureLanguage(i18n.language), new Promise((r) => setTimeout(r, 1500))]);
ready.then(() => {
  const root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
