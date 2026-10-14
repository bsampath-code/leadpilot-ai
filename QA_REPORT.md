# QA report: local app is not connected to Supabase

**Triage:** Environment/configuration blocker; no confirmed application defect yet.
**Severity:** Conditional P1 if this environment is expected to support authentication; otherwise setup-only.
**Status:** Needs verification after configuration.

## Observed

Opening the local app at `http://127.0.0.1:5173/` displays the LeadPilot sign-up screen with a “Local setup mode — configure Supabase to sign in” notice and the message “Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to connect this app.” The local workspace has no `.env.local` file. Authentication and workspace creation therefore cannot be verified in this environment.

## Expected

If this environment is configured for an end-to-end auth test, the sign-up/sign-in flow should connect to the intended Supabase project and then open the user's workspace. If local setup mode is intentional until configuration, the observed screen is expected behavior rather than a product bug.

## Reproduction

1. Start the local Vite development server.
2. Open `http://127.0.0.1:5173/`.
3. Observe the local setup notice and required Supabase variable names on the auth screen.
4. Do not submit the form; no Supabase project is configured for this run.

## Environment and evidence

- Local Vite development build, served at `127.0.0.1:5173`.
- Codex in-app browser; screenshot viewport was approximately 714 × 682 pixels.
- Direct visual and accessibility-tree evidence show the setup notice and missing-variable message.
- `.env.local` is absent in the local workspace.
- No authenticated flow or database request was exercised; there is no network/API failure evidence.

## Likely layer

Local environment configuration, not yet attributable to the frontend, Supabase Auth, or database.

## Next decisive check

Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the local environment, restart Vite, and repeat sign-up/sign-in against the intended Supabase project. Then verify workspace provisioning and that a second account cannot access the first account's data. Do not use production credentials in a shared or committed environment file.

## Regression test

With Supabase configured in a test project, verify that a new account can sign up and reach its workspace, an existing account can sign in, and the app surfaces actionable feedback when the Supabase configuration is missing. Confirm that the missing-config case does not issue auth/database requests.
