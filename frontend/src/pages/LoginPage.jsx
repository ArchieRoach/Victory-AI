import { SignIn } from "@clerk/clerk-react";
import { useTranslation } from "react-i18next";
import { usePalette } from "@/hooks/useSystemTheme";

export default function LoginPage() {
  const { t } = useTranslation();
  const p = usePalette();
  return (
    <div className="min-h-screen bg-victory-bg flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <img src="/victory-logo.png" alt="Victory AI" className="w-40 h-40 mx-auto mb-4 object-contain" />
          <h1 className="text-3xl font-heading font-extrabold text-victory-text">Victory AI</h1>
          <p className="text-victory-muted mt-2">{t("login.subtitle")}</p>
        </div>

        <SignIn
          routing="path"
          path="/login"
          afterSignInUrl="/home"
          afterSignUpUrl="/onboarding"
          appearance={{
            variables: {
              colorPrimary: p.lime,
              colorBackground: p.card,
              colorText: p.text,
              colorTextSecondary: p.muted,
              colorInputBackground: p.bg,
              colorInputText: p.text,
              borderRadius: "0.5rem",
            },
            elements: {
              card: "shadow-none",
              headerTitle: "hidden",
              headerSubtitle: "hidden",
              socialButtonsBlockButton: "border border-victory-border text-victory-text",
              formButtonPrimary: "bg-victory-lime text-victory-bg hover:opacity-90",
              footerActionLink: "text-victory-lime",
              formFieldInput: "bg-victory-bg border-victory-border text-victory-text",
              dividerLine: "bg-victory-border",
              dividerText: "text-victory-muted",
            },
          }}
        />
      </div>
    </div>
  );
}
