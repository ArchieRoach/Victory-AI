import { SignIn } from "@clerk/clerk-react";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-victory-bg flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <img src="/victory-logo.png" alt="Victory AI" className="w-40 h-40 mx-auto mb-4 object-contain" />
          <h1 className="text-3xl font-heading font-extrabold text-victory-text">Victory AI</h1>
          <p className="text-victory-muted mt-2">Sign in to continue your training</p>
        </div>

        <SignIn
          routing="path"
          path="/login"
          afterSignInUrl="/home"
          afterSignUpUrl="/onboarding"
          appearance={{
            variables: {
              colorPrimary: "#E8FF47",
              colorBackground: "#12121A",
              colorText: "#F0F0F5",
              colorTextSecondary: "#8888A0",
              colorInputBackground: "#0A0A0F",
              colorInputText: "#F0F0F5",
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
