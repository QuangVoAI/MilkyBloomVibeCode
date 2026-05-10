# MilkyBloom Production Integrations

## Required environment
- Backend: copy `backend/.env.example` to a real env file in your deploy system and fill every required secret.
- Frontend: copy `frontend/.env.example` and point `VITE_API_URL` to the canonical backend `/api` URL for that environment.

## Provider checklist
- Core required: `MONGO_URI`, `JWT_SECRET`, `FRONTEND_URL`, `BACKEND_URL`.
- Required for email flows: SMTP variables and `SMTP_ENABLED=true`.
- Required for social login: Google/Facebook client IDs, secrets, and callback URLs.
- Required for image uploads: S3 variables and `S3_ENABLED=true`.
- Required for payments: MoMo or ZaloPay variables for the gateways you keep enabled.
- Optional graceful-degrade providers:
  - `GEMINI_ENABLED=false` keeps moderation/chat from crashing when Gemini is unavailable.
  - `WEATHER_ENABLED=false` disables weather-dependent shipping adjustments.
  - `VIETMAP_ENABLED=false` skips address suggestions/verification and relies on user input.

## Rotation workflow
1. Rotate secrets in provider consoles first.
2. Update deploy environment variables for staging.
3. Run smoke tests for health, auth, uploads, mail, maps, and payments.
4. Promote the same values to production after staging passes.

## Storage recommendation
- Keep production secrets in your host secret manager or CI/CD environment store.
- Do not commit real `.env` files.
- Record the owner of each provider account and the console URL in your team password manager.
