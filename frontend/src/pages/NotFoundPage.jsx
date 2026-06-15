import { useNavigate } from "react-router-dom";

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-victory-bg flex flex-col items-center justify-center p-6 text-center">
      <img src="/victory-logo.png" alt="Victory AI" className="w-20 h-20 object-contain mb-6 opacity-60" />
      <p className="font-mono text-6xl font-bold text-victory-lime mb-2">404</p>
      <h1 className="font-heading font-extrabold text-2xl text-victory-text mb-2">Page not found</h1>
      <p className="text-victory-muted mb-8">This page doesn't exist. Let's get you back to training.</p>
      <button
        onClick={() => navigate("/home", { replace: true })}
        className="victory-btn-primary px-8"
      >
        Go Home
      </button>
    </div>
  );
}
