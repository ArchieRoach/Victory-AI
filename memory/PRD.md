# Victory AI - Product Requirements Document

## Original Problem Statement
Build a mobile-first web app called Victory AI — an AI-assisted boxing technique tracker where amateur boxers self-score their shadowboxing sessions across 16 dimensions, track progress over time, and get targeted drill recommendations.

## User Personas
1. **Amateur Boxer** - Films themselves training, wants to systematically improve technique
2. **Boxing Enthusiast** - Casual training, wants structured self-assessment
3. **Coach/Trainer** - Uses app to track student progress (future enhancement)

## Core Requirements (Static)
- Mobile-first responsive design
- Dark athletic dashboard aesthetic (Whoop/Strava style)
- 16 boxing technique dimensions for scoring
- Radar chart visualization
- Progress tracking over time
- Drill recommendations for weakest areas
- Round timer with bell sounds
- Legend technique library
- Both JWT and Google OAuth authentication

## Technical Architecture
- **Frontend**: React 19, Tailwind CSS, Recharts, Shadcn/UI components
- **Backend**: FastAPI (Python), MongoDB
- **Authentication**: JWT + Emergent Google OAuth
- **Styling**: Custom Victory AI theme (#0A0A0F bg, #E8FF47 accent)

## What's Been Implemented (v1.0 - March 2, 2026)

### Authentication
- [x] Email/password registration and login
- [x] Google OAuth via Emergent Auth
- [x] Session management with cookies
- [x] Protected routes

### Pages
- [x] /welcome - Onboarding with profile setup form
- [x] /login - Dual auth options (Google + email)
- [x] /home - Dashboard with radar chart, progress, drills, session history
- [x] /score - 16-dimension scorecard with collapsible groups
- [x] /score/results - Session results with comparison and drill recommendations
- [x] /timer - Round timer with configuration (1-5 min rounds, 30s-3min rest)
- [x] /library - 8 boxing legends with technique breakdowns
- [x] /sessions/:id - Session detail view
- [x] /profile - Profile settings, stats summary, logout

### Features
- [x] Radar chart visualization (current + previous session ghost)
- [x] Progress line chart over time
- [x] Auto-save form inputs (localStorage)
- [x] Drill recommendations based on lowest scores
- [x] Shareable scorecard image generation (HTML Canvas)
- [x] Filter pills for legend library
- [x] Bottom tab navigation
- [x] Mobile-first touch targets (48px minimum)

### API Endpoints
- POST /api/auth/register, /api/auth/login, /api/auth/session, /api/auth/logout
- GET /api/auth/me
- PUT /api/users/me
- GET /api/users/stats
- POST /api/sessions
- GET /api/sessions, /api/sessions/:id
- PUT /api/sessions/:id
- GET /api/dimensions, /api/drills, /api/drills/:dimension, /api/legends

## Prioritized Backlog

### P0 (Critical)
- All core features implemented ✅

### P1 (High Priority)
- [ ] Weekly progress reminder notifications
- [ ] Session video playback integration
- [ ] Export progress report (PDF)
- [ ] Dark/light mode toggle

### P2 (Medium Priority)
- [ ] Social sharing with customizable templates
- [ ] Coach mode for multiple trainees
- [ ] Training plan generator based on weaknesses
- [ ] Integration with fitness wearables

### P3 (Nice to Have)
- [ ] AI-powered video analysis suggestions
- [ ] Community leaderboard
- [ ] Badge/achievement system
- [ ] Voice-guided timer

## Next Action Items
1. Test full user flow from registration to session completion
2. Add push notification support for weekly reminders
3. Implement session comparison view
4. Add onboarding tutorial tooltips
5. Performance optimization for radar chart rendering
