import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const Section = ({ title, children }) => (
  <div className="victory-card p-4 space-y-2">
    <h2 className="text-victory-text font-heading font-bold text-base">{title}</h2>
    <div className="text-victory-muted text-sm leading-relaxed space-y-2">{children}</div>
  </div>
);

export default function TermsOfServicePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-victory-bg">
      <div className="sticky top-0 z-10 bg-victory-bg/95 backdrop-blur-sm border-b border-victory-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} aria-label="Go back" className="w-11 h-11 flex items-center justify-center touch-target text-victory-muted hover:text-victory-text">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-victory-text font-heading font-extrabold text-base leading-tight">Terms of Service</h1>
          <p className="text-victory-muted text-xs">Last updated 11 September 2026</p>
        </div>
      </div>

      <div className="px-4 pb-20 max-w-lg mx-auto space-y-4 pt-6">

        <Section title="1. Agreement">
          <p>
            These Terms of Service ("Terms") are a binding agreement between you and Victory AI
            ("we", "us") governing your use of the Victory AI app and website (the "Service"). By
            creating an account or using the Service you accept these Terms and our{" "}
            <button onClick={() => navigate("/privacy")} className="text-victory-lime underline">Privacy Policy</button>.
            If you do not agree, do not use the Service.
          </p>
        </Section>

        <Section title="2. Who can use Victory AI">
          <p>
            You must be at least 13 years old. If you are under 18, you may only use the Service
            with the knowledge and consent of a parent or legal guardian, who agrees to these
            Terms on your behalf. You are responsible for keeping your login credentials secure
            and for all activity on your account.
          </p>
        </Section>

        <Section title="3. What the Service does">
          <p>
            Victory AI provides AI-generated feedback on boxing technique from videos you record,
            training tools, progress tracking, and optional social features (feed, gyms, squads,
            competitions, live streaming and chat). AI feedback is for training guidance only —
            it is not coaching, medical, or safety advice. Train within your ability and stop if
            you feel unwell or in pain.
          </p>
        </Section>

        <Section title="4. Subscriptions, trials and billing">
          <p>
            Core features are free. Optional paid plans ("Pro") are billed through our payment
            processor, Stripe. Paid plans start with a 14-day free trial; unless you cancel
            before the trial ends, the plan renews automatically at the price shown at checkout
            ($5/month or $25/year) and continues to renew each period until cancelled.
          </p>
          <p>
            You can cancel any time from Profile settings or your Stripe billing portal;
            cancellation takes effect at the end of the current period. Except where required by
            law, payments are non-refundable. If you purchased through a platform app store, that
            store's billing, cancellation and refund rules apply instead.
          </p>
        </Section>

        <Section title="5. Virtual tokens">
          <p>
            The Service may let you buy tokens to support live streamers. Tokens have no cash
            value, cannot be exchanged for money, are non-transferable, and are non-refundable
            except where required by law. We may change token pricing or discontinue tokens at
            any time. Buying tokens is restricted to users aged 18 or over.
          </p>
        </Section>

        <Section title="6. Your content and acceptable use">
          <p>
            You keep ownership of the videos, posts, comments, messages and other content you
            submit ("Your Content"). You grant us a worldwide, non-exclusive licence to host,
            store, process and display Your Content solely to operate and improve the Service.
          </p>
          <p>There is zero tolerance for objectionable content or abusive behaviour. You must not:</p>
          <p>
            • post content that is harassing, threatening, hateful, sexually explicit, or that
            sexualises or endangers minors; • bully, stalk, impersonate or dox anyone; • share
            content that is illegal, promotes self-harm or violence, or infringes others' rights;
            • spam, scrape, or attempt to break, overload or reverse-engineer the Service;
            • use the Service to sell goods or services or to solicit money from other users.
          </p>
          <p>
            You can report content or block another user from within the app. We review reports
            and act on violations — typically within 24 hours — by removing content and warning,
            suspending or permanently removing the accounts responsible. We may remove content or
            limit accounts at our discretion to keep the community safe.
          </p>
        </Section>

        <Section title="7. Live streaming">
          <p>
            Live streams and their chat are public and are subject to Section 6. Do not stream
            content you would not want publicly associated with you, and do not stream other
            people without their consent. We may end a stream or revoke streaming access for any
            violation.
          </p>
        </Section>

        <Section title="8. Our intellectual property">
          <p>
            The Service, including its software, models, branding and design, belongs to us or
            our licensors. We grant you a personal, non-transferable, revocable licence to use
            the app for its intended purpose. You may not copy, resell or create derivative
            works from it.
          </p>
        </Section>

        <Section title="9. Suspension and termination">
          <p>
            You can stop using the Service and delete your account at any time from Profile
            settings. We may suspend or terminate your access if you breach these Terms, create
            risk or legal exposure for us or other users, or if we stop offering the Service.
            Sections that by their nature should survive termination (e.g. 6, 8, 10, 11) will do so.
          </p>
        </Section>

        <Section title="10. Disclaimers and limitation of liability">
          <p>
            The Service is provided "as is" without warranties of any kind. We do not warrant
            that AI feedback is accurate or that the Service will be uninterrupted or error-free.
            To the fullest extent permitted by law, our total liability for any claim relating to
            the Service is limited to the greater of the amount you paid us in the 12 months
            before the claim or USD 50. Nothing in these Terms excludes liability that cannot be
            excluded by law.
          </p>
        </Section>

        <Section title="11. Governing law">
          <p>
            These Terms are governed by the laws of England and Wales, and the courts of England
            and Wales have exclusive jurisdiction, except where your local consumer-protection
            law gives you a mandatory right to bring proceedings elsewhere.
          </p>
        </Section>

        <Section title="12. Changes and contact">
          <p>
            We may update these Terms; if a change is material we will notify you in the app or
            by email and update the date above. Continuing to use the Service after a change
            means you accept the updated Terms. Questions:{" "}
            <a href="mailto:support@victoryai.co.uk" className="text-victory-lime underline">support@victoryai.co.uk</a>.
          </p>
        </Section>

      </div>
    </div>
  );
}
