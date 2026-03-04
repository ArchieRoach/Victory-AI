# Victory AI - Product Requirements Document (v3.0)

## Original Problem Statement
Build Victory AI as a Cal AI-style mobile-first web app where amateur boxers get instant AI feedback from their personalized AI training partner during training rounds.

## User Personas
1. **Amateur Boxer** - Wants AI-powered feedback without needing a coach present
2. **Home Trainer** - Films themselves training, needs structured self-assessment
3. **Boxing Enthusiast** - Casual training, wants gamified progress tracking

## Core Requirements (Static)
- Cal AI-level simplicity: one button to start training
- 4-phase psychological onboarding + AI Training Partner creation
- Hard paywall with free trial ($2.99/month, $19.99/year)
- Unified "Train" flow with auto-recording and AI feedback during rest
- 16 boxing technique dimensions for scoring
- Radar chart visualization with progress tracking

## Technical Architecture
- **Frontend**: React 19, Tailwind CSS, Recharts, Shadcn/UI
- **Backend**: FastAPI (Python), MongoDB
- **Authentication**: JWT + Emergent Google OAuth
- **Payments**: Stripe (subscriptions with free trial)
- **AI Feedback**: OpenAI GPT-4o via Emergent LLM key
- **Avatar Generation**: Gemini Nano Banana via Emergent LLM key
- **Video Storage**: Cloudinary (pending credentials)
- **Video Analysis**: GPT-4 Vision (simulated until Cloudinary configured)

## What's Been Implemented (v3.0 - March 4, 2026)

### Branding Updates
- [x] New Victory AI logo (explicit text branding)
- [x] Changed "fighter buddy" → "AI training partner" throughout app
- [x] Updated all frontend copy and messaging

### 4-Phase Psychological Onboarding Flow
- [x] Phase 1: Affirmation - Social proof stats, testimonials
- [x] Phase 2: Why Hook - 6 motivation questions
- [x] Phase 3: Personalized Affirmation - Tailored messaging based on answers
- [x] Phase 4: Partner Creation - Style, accountability level, focus areas
- [x] Performative "Generating..." screen with progress animation
- [x] Partner naming with suggested names

### Training Partner Styles
- Tough Love Coach
- Supportive Mentor
- Technical Analyst
- Hype Man
- Old School Trainer

### Video Recording & Analysis Infrastructure
- [x] Browser MediaRecorder API for video capture
- [x] Cloudinary signature endpoint for secure uploads
- [x] Video registration endpoint
- [x] GPT-4 Vision analysis endpoint (graceful fallback to simulation)
- [x] AI feedback generation with video analysis integration

### Payment Integration
- [x] Stripe checkout with free trial (working)
- [x] Subscription status tracking
- [x] Hard paywall enforcing trial before app access
- [x] Payment success confirmation flow

### API Endpoints
- POST /api/onboarding/submit - Save onboarding answers
- POST /api/onboarding/create-partner - Create AI training partner
- POST /api/onboarding/generate-avatar - Generate AI avatar
- GET /api/onboarding/social-proof - Get stats and testimonials
- GET /api/onboarding/partner-styles - Get training partner styles
- GET /api/cloudinary/signature - Get upload signature
- POST /api/videos/register - Register uploaded video
- POST /api/ai/analyze-video - Analyze video with GPT-4 Vision
- POST /api/ai/generate-feedback - Generate round feedback
- POST /api/payments/checkout - Create Stripe checkout
- GET /api/payments/status/:session_id - Check payment status
- GET /api/subscription/status - Get user subscription
- POST /api/training/start - Start training session
- POST /api/training/:id/complete - Complete session

## Prioritized Backlog

### P0 (Critical) - COMPLETED
- [x] Logo and branding updates ✅
- [x] "Fighter buddy" → "AI training partner" terminology ✅
- [x] Cloudinary integration ✅ (credentials configured)

### P1 (High Priority)
- [x] All backend endpoints tested and working ✅
- [x] Full onboarding → training flow verified ✅
- [ ] Real GPT-4 Vision video analysis (ready, needs camera in browser)
- [ ] Push notifications for trial expiring
- [ ] Weekly progress reminder notifications

### P2 (Medium Priority)
- [ ] AI training partner voice messages (TTS with ElevenLabs)
- [ ] Session replay with AI commentary
- [ ] Social sharing with custom radar chart images
- [ ] Training plan generator

### P3 (Nice to Have)
- [ ] Community leaderboard
- [ ] Badge/achievement system
- [ ] Coach mode for multiple trainees
- [ ] Integration with fitness wearables

## Next Action Items
1. **Get Cloudinary credentials from user** (Cloud Name, API Key, API Secret)
2. Test complete onboarding → paywall → training flow
3. Add Cloudinary credentials to backend/.env
4. Test video upload and real AI analysis
5. Set up push notification infrastructure

## Known Limitations
- Video upload/analysis uses simulated data until Cloudinary is configured
- GPT-4 Vision analysis is URL-based (not frame extraction) for MVP
