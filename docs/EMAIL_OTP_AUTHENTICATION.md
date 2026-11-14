# Email OTP authentication

DEBS AI requires a verified Supabase Auth account before any application route or AI chat use. Both account creation and returning-user login use email one-time passwords (OTP), not password-only authentication.

## Runtime flow

1. The user enters an email address on `/connexion` and chooses account creation or login.
2. The client calls `signInWithOtp`. Account creation sets `shouldCreateUser: true`; login sets it to `false`.
3. The email address and flow type are kept only in the browser's session storage while the user completes `/verifier-email`.
4. The user enters the numeric code and the client calls `verifyOtp({ email, token, type: "email" })`.
5. The resulting Supabase session is used by the app. A missing session is redirected to `/connexion`.
6. The `/api/chat-stream` server handler independently validates the bearer JWT with Supabase Auth and rejects missing, invalid, or unverified sessions. Client-side route guards are usability controls, not the security boundary.

## Required Supabase Auth configuration

Apply these settings to the intended Supabase project before enabling the flow for real users:

- Enable email sign-in.
- Require email confirmation.
- Set the email OTP template to visibly include the numeric token placeholder `{{ .Token }}`. Do not rely only on a magic-link template containing `{{ .ConfirmationURL }}`.
- Configure an appropriate OTP expiry (recommended: 10 minutes or less).
- Keep the Auth email rate limits enabled and configure SMTP for production delivery and adequate throughput.
- Set the allowed site URL and redirect URLs to the actual DEBS AI deployment domains.
- Test signup, existing-user login, expired codes, wrong codes, resend cooldown/rate limits, and unverified-session rejection in the isolated development project.

The repository code does not change hosted Auth email templates, SMTP credentials, or project-level Auth settings. Those are Supabase dashboard settings and must be verified separately. Do not place SMTP credentials in the repository or browser environment.

## Security notes

- The OTP itself is not stored by the application. Supabase Auth validates and expires it.
- The browser stores only the pending email and flow type in session storage.
- Server authorization derives identity from the verified JWT, never from a user ID supplied in the request body.
- The app must not treat hiding navigation or redirecting in React as sufficient authorization.
- Keep checkout and wallet debit activation disabled until authenticated owner-isolation tests and the remaining billing checks pass.
