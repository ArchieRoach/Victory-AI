# Victory AI - Product Requirements Document (v2.0)

## Original Problem Statement
Rebuild Victory AI as a Cal AI-style mobile-first web app where amateur boxers get instant AI feedback from their personalized fighter buddy during training rounds.

## User Personas
1. **Amateur Boxer** - Wants AI-powered feedback without needing a coach present
2. **Home Trainer** - Films themselves training, needs structured self-assessment
3. **Boxing Enthusiast** - Casual training, wants gamified progress tracking

## Core Requirements (Static)
- Cal AI-level simplicity: one button to start training
- Quiz funnel onboarding + Fighter Buddy creation (Character AI style)
- Hard paywall with free trial ($2.99/month, $19.99/year)
- Unified "Train" flow with auto-recording and AI feedback during rest
- 16 boxing technique dimensions for scoring
- Radar chart visualization with progress tracking

## Technical Architecture
- **Frontend**: React 19, Tailwind CSS, Recharts, Shadcn/UI
- **Backend**: FastAPI (Python), MongoDB
- **Authentication**: JWT + Emergent Google OAuth
- **Payments**: Stripe (subscriptions with free trial)
- **AI Feedback**: Gemini 3 Flash via Emergent LLM key
- **Avatar Generation**: Gemini Nano Banana via Emergent LLM key
- **Video Recording**: Browser MediaRecorder API

## What's Been Implemented (v2.0 - March 4, 2026)

### New Onboarding Flow
- [x] 5-question quiz funnel (training goal, frequency, location, frustration, favorite fighters)
- [x] Fighter Buddy Creator (name, weight class, stance, favorite punch, archetype)
- [x] 10 fighter archetypes inspired by real boxers (Usyk, Tyson, Mayweather, Ali, etc.)
- [x] AI avatar generation for fighter buddies
- [x] Hard paywall with $2.99/month and $19.99/year plans

### Unified Train Flow
- [x] Merged Timer + Score into single "Train" tab
- [x] Auto-record video during rounds (MediaRecorder API)
- [x] AI fighter buddy feedback during rest periods
- [x] Large timer display readable from 2 meters
- [x] Camera preview in corner during active rounds
- [x] 10-second warning banner before round ends
- [x] Auto-generated scores based on AI analysis

### Payment Integration
- [x] Stripe checkout with free trial
- [x] Subscription status tracking
- [x] Hard paywall enforcing trial before app access
- [x] Payment success confirmation flow

### API Endpoints Added
- POST /api/quiz/submit - Save quiz answers
- GET /api/fighter-buddy/archetypes - Get archetype options
- POST /api/fighter-buddy/create - Create fighter buddy
- POST /api/fighter-buddy/generate-avatar - Generate AI avatar
- POST /api/payments/checkout - Create Stripe checkout
- GET /api/payments/status/:session_id - Check payment status
- GET /api/subscription/status - Get user subscription
- POST /api/ai/generate-feedback - Generate round feedback
- POST /api/training/start - Start training session
- POST /api/training/:id/round - Save round data
- POST /api/training/:id/complete - Complete session

### UI Updates
- [x] Bottom nav: Home, Train (dumbbell icon), Timer, Library
- [x] Welcome page with fighter buddy messaging
- [x] Quiz pages with progress bar
- [x] Fighter Buddy Creator with archetype selection
- [x] Paywall with plan comparison

## Prioritized Backlog

### P0 (Critical) - DONE
- All core features implemented ✅

### P1 (High Priority)
- [ ] Real video analysis for more accurate scoring
- [ ] Cloud video storage (currently local only)
- [ ] Push notifications for trial expiring
- [ ] Weekly progress reminder notifications

### P2 (Medium Priority)
- [ ] Fighter buddy voice messages (TTS)
- [ ] Session replay with AI commentary
- [ ] Social sharing with custom templates
- [ ] Training plan generator

### P3 (Nice to Have)
- [ ] Community leaderboard
- [ ] Badge/achievement system
- [ ] Coach mode for multiple trainees
- [ ] Integration with fitness wearables

## Next Action Items
1. Implement cloud video storage for recorded rounds
2. Add real video analysis model integration
3. Set up push notification infrastructure
4. A/B test paywall copy variations
5. Add trial expiration warning emails
