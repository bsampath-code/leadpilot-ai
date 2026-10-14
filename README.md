# LeadPilot AI

LeadPilot AI is a React + TypeScript SaaS starter for workspace-scoped lead management and human-approved AI follow-ups.

## LeadPilot AI

LeadPilot AI is a responsive workspace-based lead CRM for small businesses. It includes email/password auth, workspace-scoped records, lead management, follow-up tasks, Gemini qualification, editable outreach drafts, and a fictional demo dataset.

## Features

- Vite, React, TypeScript, Tailwind CSS, and the Supabase browser client are configured.
- Email/password sign-up and sign-in UI validates inputs with Zod.
- A database trigger creates one personal workspace and owner membership for every new Auth user.
- RLS limits workspace, lead, task, and draft records to members of that workspace.
- `qualify-lead` verifies the caller, loads a lead through RLS, calls Gemini with the evidence-based qualification rubric, validates its JSON, and saves the result.
- `generate-follow-up` creates editable email, WhatsApp-style, or SMS drafts with a selected tone and objective. It uses workspace business context plus lead requirements, stated budget, and optional prior-interaction summary. Every draft includes a message and rationale; email drafts also include a subject. No sending integration exists.
- Overview metrics come from the signed-in workspace's records. Follow-up tasks show overdue and completion states.
- A one-time demo loader adds fictional hotel, real estate, and coaching records with `example.com` emails.
- No API secret or service-role key is used in browser code.

## File structure

```text
src/
  features/auth/       Supabase session provider and password auth screen
  features/ai/         AI qualification and editable draft workspace
  lib/supabase.ts      Browser client using public Vite environment values
  lib/demo-data.ts     Clearly fictional demo leads and tasks
  lib/types.ts         Application record types
supabase/migrations/   PostgreSQL schema, workspace trigger, RLS policies
supabase/functions/    Authenticated Gemini Edge Functions
.env.example           Public browser configuration names only
```

## Local setup

1. Create a Supabase project, enable Email authentication, and add your app URL to Auth redirect URLs.
2. In Supabase SQL Editor, run `supabase/migrations/20261013000100_initial_schema.sql` once. This creates the workspace tables, signup trigger, and RLS policies.
3. Copy `.env.example` to `.env.local`; set the Supabase URL and **publishable** key. Never put a Supabase secret/service-role key or Gemini key in a `VITE_` variable.
4. Rotate Gemini keys shared in chat or another public surface. Add the replacement in Supabase Dashboard → Edge Functions → Secrets as `GEMINI_API_KEY`. For local Supabase, add it to `supabase/functions/.env` (gitignored).
5. Deploy both functions: `supabase functions deploy qualify-lead` and `supabase functions deploy generate-follow-up`.
6. Install packages with `npm install`, then start Vite with `npm run dev` from a path without shell metacharacters.

The current Windows workspace path includes `&`, which breaks npm's generated script shim in this shell. From this checkout, run Vite and TypeScript directly:

```powershell
node 'C:\Users\Lenovo\Music\AI_Lead_recovery_&sales_assistant\node_modules\typescript\bin\tsc' -b
node 'C:\Users\Lenovo\Music\AI_Lead_recovery_&sales_assistant\node_modules\vite\bin\vite.js' build
```

## Testing checklist

- [x] TypeScript compilation succeeds.
- [x] Vite production build succeeds.
- [ ] Apply the migration to a Supabase project and inspect `workspaces`, `workspace_members`, `leads`, `follow_up_tasks`, and `ai_follow_up_drafts`.
- [ ] Sign up two accounts; confirm each gets one workspace and cannot read or mutate the other account's records.
- [ ] Test email confirmation, sign-in, sign-out, and expired-session handling.
- [ ] Create, edit, search, filter, inspect, and delete a lead; verify invalid budgets and emails are rejected.
- [ ] Confirm overview counts/value change when records are added, completed, or deleted.
- [ ] Create a due task, verify overdue styling, and toggle completion both ways.
- [ ] Qualify a lead with the Edge Function; verify score/category and saved reasons, missing information, summary, and next action.
- [ ] Try malformed lead IDs, unauthorized calls, missing Gemini secret, invalid model response, and provider rate limits.
- [ ] Set workspace business name/industry and generate each email/WhatsApp-style/SMS tone and objective; verify subject/message/reason, edit and save the message, and confirm no message is sent.
- [ ] Generate with missing prior-interaction/requirements context; confirm the draft asks a neutral question and does not invent a prior conversation, price, discount, urgency, availability, or commitment.
- [ ] Load demo data once; verify all records are fictional and labeled, and a second load is blocked.
- [ ] Confirm browser assets and source maps contain no Gemini or Supabase secret key.
