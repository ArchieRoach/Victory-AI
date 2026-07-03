import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { toast } from "sonner";
import { CheckCircle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function PaymentSuccess() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    if (!sessionId) {
      navigate("/live", { replace: true });
      return;
    }

    let cancelled = false;
    let pollTimer, redirectTimer;
    const maxAttempts = 5;

    const poll = async (attempts = 0) => {
      if (cancelled) return;
      if (attempts >= maxAttempts) {
        setStatus("timeout");
        toast.error(t("payment.timeoutToast"));
        return;
      }
      try {
        const response = await axios.get(`${API}/payments/status/${sessionId}`);
        if (cancelled) return;
        if (response.data.payment_status === "paid") {
          await refreshUser(); // refresh without unmounting this page
          if (cancelled) return;
          setStatus("success");
          toast.success(t("payment.successToast"));
          redirectTimer = setTimeout(() => navigate("/home", { replace: true }), 2000);
          return;
        } else if (response.data.status === "expired") {
          setStatus("expired");
          return;
        }
      } catch (error) {
        console.error("Error checking payment status:", error);
      }
      pollTimer = setTimeout(() => poll(attempts + 1), 2000);
    };

    poll();
    return () => {
      cancelled = true;
      clearTimeout(pollTimer);
      clearTimeout(redirectTimer);
    };
  }, [searchParams, navigate, refreshUser, t]);

  return (
    <div className="min-h-screen bg-victory-bg flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        {status === "checking" && (
          <>
            <Loader2 className="w-16 h-16 text-victory-lime animate-spin mx-auto mb-4" />
            <h1 className="text-2xl font-heading font-bold text-victory-text mb-2">
              {t("payment.processing")}
            </h1>
            <p className="text-victory-muted">{t("payment.pleaseWait")}</p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle className="w-16 h-16 text-victory-lime mx-auto mb-4" />
            <h1 className="text-2xl font-heading font-bold text-victory-text mb-2">
              {t("payment.successTitle")}
            </h1>
            <p className="text-victory-muted mb-4">
              {t("payment.trialStarted")}
            </p>
            <p className="text-victory-muted text-sm">{t("payment.redirecting")}</p>
          </>
        )}

        {status === "expired" && (
          <>
            <h1 className="text-2xl font-heading font-bold text-victory-text mb-2">
              {t("payment.expiredTitle")}
            </h1>
            <p className="text-victory-muted mb-4">{t("payment.expiredDesc")}</p>
            <button
              onClick={() => navigate("/paywall")}
              className="victory-btn-primary"
            >
              {t("payment.tryAgainBtn")}
            </button>
          </>
        )}

        {status === "timeout" && (
          <>
            <h1 className="text-2xl font-heading font-bold text-victory-text mb-2">
              {t("payment.timeoutTitle")}
            </h1>
            <p className="text-victory-muted mb-4">
              {t("payment.timeoutDesc")}
            </p>
            <button
              onClick={() => navigate("/live")}
              className="victory-btn-primary"
            >
              {t("payment.goToApp")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
