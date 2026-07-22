import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const Section = ({ title, children }) => (
  <div className="victory-card p-4 space-y-2">
    <h2 className="text-victory-text font-heading font-bold text-base">{title}</h2>
    <div className="text-victory-muted text-sm leading-relaxed space-y-2">{children}</div>
  </div>
);

export default function PrivacyPolicyPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-victory-bg">
      <div className="sticky top-0 z-10 bg-victory-bg/95 backdrop-blur-sm border-b border-victory-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} aria-label="Go back" className="w-11 h-11 flex items-center justify-center touch-target text-victory-muted hover:text-victory-text">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-victory-text font-heading font-extrabold text-base leading-tight">Privacy Policy</h1>
          <p className="text-victory-muted text-xs">Last updated 22 July 2026</p>
        </div>
      </div>

      <div className="px-4 pb-20 max-w-lg mx-auto space-y-4 pt-6">

        <Section title="Who we are">
          <p>
            Victory AI ("we", "us") provides an AI-powered boxing training app. For the purposes of
            data protection law we are the data controller for the personal data described below.
            Contact us at <span className="text-victory-text">privacy@victoryai.co.uk</span> for any
            privacy question or to exercise your rights.
          </p>
        </Section>

        <Section title="What we collect">
          <p><strong className="text-victory-text">Account data:</strong> email, name, and authentication identifiers (via Clerk).</p>
          <p><strong className="text-victory-text">Training data:</strong> session recordings, round videos, AI feedback scores, and your onboarding answers (including date of birth, to verify you meet our minimum age).</p>
          <p><strong className="text-victory-text">Content:</strong> posts, comments, live-stream chat messages, and gym/competition activity you choose to share.</p>
          <p><strong className="text-victory-text">Payment data:</strong> handled directly by Stripe — we never see or store your card details.</p>
          <p><strong className="text-victory-text">Device data:</strong> push-notification tokens and basic technical/log data (IP address, request metadata) for security and abuse prevention.</p>
        </Section>

        <Section title="Why we process it, and our legal basis">
          <p><strong className="text-victory-text">Contract (Art. 6(1)(b)):</strong> core app functionality — training sessions, AI feedback, social features, subscriptions.</p>
          <p><strong className="text-victory-text">Legitimate interests (Art. 6(1)(f)):</strong> content moderation, fraud/abuse prevention, and service security.</p>
          <p><strong className="text-victory-text">Consent (Art. 6(1)(a)):</strong> push notifications, which you can withdraw any time in Profile settings.</p>
        </Section>

        <Section title="Who we share it with">
          <p>We use the following processors to run the service. Each only receives the data it needs to perform its function:</p>
          <p>Clerk (authentication), Stripe (payments), Cloudinary (media storage), Livepeer (live streaming), ElevenLabs (voice/TTS feedback), OpenAI (AI training feedback and content moderation), Resend (transactional email), MongoDB Atlas (database hosting).</p>
          <p>Most of these providers are based in the United States. Transfers rely on the EU-US Data Privacy Framework and/or Standard Contractual Clauses as the transfer safeguard.</p>
          <p>We do not sell your personal data.</p>
        </Section>

        <Section title="How long we keep it">
          <p>Training history is kept for as long as your account is active — it's the record of your own progress. Ephemeral data is deleted automatically: live-stream chat after 90 days, notifications after 180 days, unconverted waitlist entries after 12 months, and moderation reports after 2 years. Deleting your account (below) removes your profile, content, and session history immediately.</p>
        </Section>

        <Section title="Your rights">
          <p>Under GDPR/UK GDPR Art. 15-22 you can:</p>
          <p>• <strong className="text-victory-text">Access &amp; export</strong> your data — use "Download my data" in Profile settings.</p>
          <p>• <strong className="text-victory-text">Correct</strong> your data — edit your profile directly in the app.</p>
          <p>• <strong className="text-victory-text">Delete</strong> your account and personal data — use "Delete Account" in Profile settings.</p>
          <p>• <strong className="text-victory-text">Object or withdraw consent</strong> — contact us using the details above.</p>
          <p>• <strong className="text-victory-text">Complain</strong> to your local data protection supervisory authority if you believe we've mishandled your data.</p>
        </Section>

        <Section title="Children">
          <p>Victory AI is not intended for anyone under 13. We verify this during onboarding.</p>
        </Section>

        <Section title="Changes">
          <p>We'll update this page if how we handle your data changes, and update the date at the top.</p>
        </Section>

      </div>
    </div>
  );
}
