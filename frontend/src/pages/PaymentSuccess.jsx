import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { toast } from "sonner";
import { CheckCircle, Loader2 } from "lucide-react";

export default function PaymentSuccess() {
  const navigate = useNavigate();
  const { checkAuth } = useAuth();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    if (sessionId) {
      pollPaymentStatus(sessionId);
    } else {
      navigate("/home", { replace: true });
    }
  }, [searchParams, navigate]);

  const pollPaymentStatus = async (sessionId, attempts = 0) => {
    const maxAttempts = 5;

    if (attempts >= maxAttempts) {
      setStatus("timeout");
      toast.error("Payment status check timed out. Please check your email for confirmation.");
      return;
    }

    try {
      const response = await axios.get(`${API}/payments/status/${sessionId}`, {
        withCredentials: true,
      });

      if (response.data.payment_status === "paid") {
        setStatus("success");
        await checkAuth(); // Refresh user data
        toast.success("Welcome to Victory AI Pro!");
        setTimeout(() => navigate("/home", { replace: true }), 2000);
        return;
      } else if (response.data.status === "expired") {
        setStatus("expired");
        return;
      }

      // Continue polling
      setTimeout(() => pollPaymentStatus(sessionId, attempts + 1), 2000);
    } catch (error) {
      console.error("Error checking payment status:", error);
      setTimeout(() => pollPaymentStatus(sessionId, attempts + 1), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-victory-bg flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        {status === "checking" && (
          <>
            <Loader2 className="w-16 h-16 text-victory-lime animate-spin mx-auto mb-4" />
            <h1 className="text-2xl font-heading font-bold text-victory-text mb-2">
              Processing your payment...
            </h1>
            <p className="text-victory-muted">Please wait while we confirm your subscription.</p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle className="w-16 h-16 text-victory-lime mx-auto mb-4" />
            <h1 className="text-2xl font-heading font-bold text-victory-text mb-2">
              Welcome to Victory AI Pro!
            </h1>
            <p className="text-victory-muted mb-4">
              Your free trial has started. Get ready to train with your fighter buddy!
            </p>
            <p className="text-victory-muted text-sm">Redirecting you to the app...</p>
          </>
        )}

        {status === "expired" && (
          <>
            <h1 className="text-2xl font-heading font-bold text-victory-text mb-2">
              Payment session expired
            </h1>
            <p className="text-victory-muted mb-4">Please try again.</p>
            <button
              onClick={() => navigate("/paywall")}
              className="victory-btn-primary"
            >
              Try Again
            </button>
          </>
        )}

        {status === "timeout" && (
          <>
            <h1 className="text-2xl font-heading font-bold text-victory-text mb-2">
              Couldn't confirm payment
            </h1>
            <p className="text-victory-muted mb-4">
              Please check your email for confirmation or contact support.
            </p>
            <button
              onClick={() => navigate("/home")}
              className="victory-btn-primary"
            >
              Go to App
            </button>
          </>
        )}
      </div>
    </div>
  );
}
