# Third-Party Processors (GDPR Art. 28)

Tracks every processor with access to Victory AI user personal data. For each: confirm a
Data Processing Agreement (DPA) is executed (most SaaS vendors offer a standard one via
their legal/trust page) and note the transfer mechanism relied on if the processor is
outside the EU/UK.

| Processor | Purpose | Data shared | Region | DPA status | Transfer mechanism |
|---|---|---|---|---|---|
| Clerk | Authentication | Email, name, auth identifiers | US | [ ] Confirm | EU-US DPF / SCCs |
| Stripe | Payments | Payment tokens, billing email | US | [ ] Confirm | EU-US DPF / SCCs |
| Cloudinary | Media storage (video/image) | Uploaded videos, images | US | [ ] Confirm | EU-US DPF / SCCs |
| Livepeer | Live-stream transcoding | Stream video | US | [ ] Confirm | EU-US DPF / SCCs |
| ElevenLabs | Text-to-speech AI feedback | Feedback text (no direct identifiers) | US | [ ] Confirm | EU-US DPF / SCCs |
| OpenAI | AI training feedback, content moderation | Session data, user-generated text | US | [ ] Confirm | EU-US DPF / SCCs |
| Resend | Transactional email | Email, name | US | [ ] Confirm | EU-US DPF / SCCs |
| MongoDB Atlas | Primary database | All personal data at rest | Confirm hosting region | [ ] Confirm | EU-US DPF / SCCs if US-hosted |

## Action items
- [ ] For each processor above, locate and archive their DPA (a link or PDF is enough) —
  most are self-serve at `<vendor>.com/legal/dpa` or via the account/billing dashboard.
- [ ] Confirm MongoDB Atlas cluster region — if it's in the EU/UK, no transfer mechanism
  needed for that hop.
- [ ] Re-check this list whenever a new processor is added to the stack.

> Not legal advice — a qualified DPO or lawyer should sign off on the final set of DPAs,
> especially for OpenAI given the EDPB Opinion 28/2024 guidance on AI model training data.
