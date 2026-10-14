-- LeadPilot AI: authenticated, workspace-scoped data model.
create extension if not exists pgcrypto;

create type public.lead_status as enum ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost');
create type public.follow_up_channel as enum ('email', 'whatsapp', 'sms');
create type public.follow_up_tone as enum ('professional', 'friendly', 'concise');
create type public.follow_up_objective as enum ('ask_clarifying_question', 'arrange_call', 'offer_relevant_next_step', 'follow_up_previous_inquiry');

create table public.workspaces (
  id uuid primary key default gen_random_uuid(), name text not null check (char_length(name) between 1 and 120), industry text,
  created_by uuid not null references auth.users(id) on delete cascade, created_at timestamptz not null default now()
);
create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'member')), created_at timestamptz not null default now(), primary key (workspace_id, user_id)
);
create table public.leads (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160), email text, phone text, industry text, source text,
  budget numeric(12, 2) check (budget is null or budget >= 0), requirements text, previous_interaction text, status public.lead_status not null default 'new',
  ai_qualification_score smallint check (ai_qualification_score between 0 and 100),
  ai_qualification_category text check (ai_qualification_category in ('high', 'medium', 'low')),
  ai_qualification_reasons text[] not null default '{}', ai_qualification_explanation text,
  ai_missing_information text[] not null default '{}', ai_recommended_action text, ai_qualification_summary text, ai_qualified_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index leads_workspace_status_idx on public.leads(workspace_id, status);
create index leads_workspace_created_idx on public.leads(workspace_id, created_at desc);
create table public.follow_up_tasks (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade, title text not null check (char_length(trim(title)) between 1 and 240),
  due_at timestamptz not null, completed_at timestamptz, created_at timestamptz not null default now()
);
create index follow_up_tasks_workspace_due_idx on public.follow_up_tasks(workspace_id, due_at) where completed_at is null;
create table public.ai_follow_up_drafts (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade, channel public.follow_up_channel not null, tone public.follow_up_tone not null,
  objective public.follow_up_objective not null, subject text not null default '', message text not null check (char_length(trim(message)) between 1 and 5000),
  reason text not null check (char_length(trim(reason)) between 1 and 300), created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at() returns trigger language plpgsql security invoker set search_path = public as $$ begin new.updated_at = now(); return new; end; $$;
create trigger leads_set_updated_at before update on public.leads for each row execute procedure public.set_updated_at();
create trigger drafts_set_updated_at before update on public.ai_follow_up_drafts for each row execute procedure public.set_updated_at();

-- This trigger is the only provisioning path and executes in the trusted Auth context.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare workspace_id uuid;
begin
  insert into public.workspaces (name, created_by) values (coalesce(nullif(split_part(new.email, '@', 1), ''), 'My') || '''s workspace', new.id) returning id into workspace_id;
  insert into public.workspace_members (workspace_id, user_id, role) values (workspace_id, new.id, 'owner');
  return new;
end; $$;
revoke all on function public.handle_new_user() from public;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.leads enable row level security;
alter table public.follow_up_tasks enable row level security;
alter table public.ai_follow_up_drafts enable row level security;
revoke all on public.workspaces, public.workspace_members, public.leads, public.follow_up_tasks, public.ai_follow_up_drafts from anon;
grant select, update on public.workspaces to authenticated;
grant select on public.workspace_members to authenticated;
grant select, insert, update, delete on public.leads to authenticated;
grant select, insert, update, delete on public.follow_up_tasks to authenticated;
grant select, insert, update, delete on public.ai_follow_up_drafts to authenticated;

create policy "members view workspaces" on public.workspaces for select to authenticated using (exists (select 1 from public.workspace_members m where m.workspace_id = id and m.user_id = (select auth.uid())));
create policy "owners rename workspace" on public.workspaces for update to authenticated using (exists (select 1 from public.workspace_members m where m.workspace_id = id and m.user_id = (select auth.uid()) and m.role = 'owner')) with check (created_by = (select auth.uid()));
create policy "members view memberships" on public.workspace_members for select to authenticated using (user_id = (select auth.uid()));
create policy "members manage workspace leads" on public.leads for all to authenticated using (exists (select 1 from public.workspace_members m where m.workspace_id = leads.workspace_id and m.user_id = (select auth.uid()))) with check (exists (select 1 from public.workspace_members m where m.workspace_id = leads.workspace_id and m.user_id = (select auth.uid())));
create policy "members manage workspace tasks" on public.follow_up_tasks for all to authenticated using (exists (select 1 from public.workspace_members m where m.workspace_id = follow_up_tasks.workspace_id and m.user_id = (select auth.uid())) and exists (select 1 from public.leads l where l.id = follow_up_tasks.lead_id and l.workspace_id = follow_up_tasks.workspace_id)) with check (exists (select 1 from public.workspace_members m where m.workspace_id = follow_up_tasks.workspace_id and m.user_id = (select auth.uid())) and exists (select 1 from public.leads l where l.id = follow_up_tasks.lead_id and l.workspace_id = follow_up_tasks.workspace_id));
create policy "members manage workspace drafts" on public.ai_follow_up_drafts for all to authenticated using (exists (select 1 from public.workspace_members m where m.workspace_id = ai_follow_up_drafts.workspace_id and m.user_id = (select auth.uid())) and exists (select 1 from public.leads l where l.id = ai_follow_up_drafts.lead_id and l.workspace_id = ai_follow_up_drafts.workspace_id)) with check (created_by = (select auth.uid()) and exists (select 1 from public.workspace_members m where m.workspace_id = ai_follow_up_drafts.workspace_id and m.user_id = (select auth.uid())) and exists (select 1 from public.leads l where l.id = ai_follow_up_drafts.lead_id and l.workspace_id = ai_follow_up_drafts.workspace_id));
