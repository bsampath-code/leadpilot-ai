import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, Bell, Bot, BriefcaseBusiness, CalendarClock, Check, Command, LayoutDashboard, LogOut, Menu, Plus, Search, Settings, Sparkles, Users, X } from 'lucide-react'
import { AuthProvider } from './features/auth/AuthProvider'
import { AuthScreen } from './features/auth/AuthScreen'
import { AssistantPage as AIAssistantPage } from './features/ai/AssistantPage'
import { useAuth } from './features/auth/useAuth'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { insertFictionalDemoData } from './lib/demo-data'
import { getCurrentWorkspace } from './lib/workspace'
import { leadStatuses, type AiDraft, type FollowUpTask, type Lead, type LeadInput, type LeadStatus, type Workspace } from './lib/types'

type Page = 'Overview' | 'Leads' | 'Follow-ups' | 'AI Assistant' | 'Settings'
const navItems: { label: Page; icon: typeof LayoutDashboard }[] = [
  { label: 'Overview', icon: LayoutDashboard }, { label: 'Leads', icon: Users }, { label: 'Follow-ups', icon: CalendarClock }, { label: 'AI Assistant', icon: Bot }, { label: 'Settings', icon: Settings },
]
const statusLabel: Record<LeadStatus, string> = { new: 'New', contacted: 'Contacted', qualified: 'Qualified', proposal: 'Proposal', won: 'Won', lost: 'Lost' }
const statusStyle: Record<LeadStatus, string> = { new: 'bg-blue-50 text-blue-700', contacted: 'bg-violet-50 text-violet-700', qualified: 'bg-emerald-50 text-emerald-700', proposal: 'bg-amber-50 text-amber-700', won: 'bg-green-50 text-green-700', lost: 'bg-slate-100 text-slate-500' }

function AppContent() {
  const { loading: authLoading, user } = useAuth()
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [workspaceError, setWorkspaceError] = useState('')
  const [page, setPage] = useState<Page>('Overview')
  const [leads, setLeads] = useState<Lead[]>([])
  const [tasks, setTasks] = useState<FollowUpTask[]>([])
  const [drafts, setDrafts] = useState<AiDraft[]>([])
  const [loadingData, setLoadingData] = useState(false)
  const [dataError, setDataError] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | LeadStatus>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingLead, setEditingLead] = useState<Lead | null>(null)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionMessage, setActionMessage] = useState('')
  const [mobileNav, setMobileNav] = useState(false)

  const loadData = useCallback(async (knownWorkspace?: Workspace) => {
    if (!supabase) return
    setLoadingData(true); setDataError('')
    try {
      const activeWorkspace = knownWorkspace ?? await getCurrentWorkspace()
      const [leadResult, taskResult, draftResult] = await Promise.all([
        supabase.from('leads').select('*').eq('workspace_id', activeWorkspace.id).order('created_at', { ascending: false }),
        supabase.from('follow_up_tasks').select('*, lead:leads(name)').eq('workspace_id', activeWorkspace.id).order('due_at', { ascending: true }),
        supabase.from('ai_follow_up_drafts').select('*, lead:leads(name)').eq('workspace_id', activeWorkspace.id).order('created_at', { ascending: false }),
      ])
      if (leadResult.error) throw leadResult.error
      if (taskResult.error) throw taskResult.error
      if (draftResult.error) throw draftResult.error
      setWorkspace(activeWorkspace); setLeads((leadResult.data ?? []) as Lead[]); setTasks((taskResult.data ?? []) as FollowUpTask[]); setDrafts((draftResult.data ?? []) as AiDraft[])
    } catch (error) { setDataError(error instanceof Error ? error.message : 'Could not load workspace data.') }
    finally { setLoadingData(false) }
  }, [])

  useEffect(() => {
    if (!user || !supabase) return
    let active = true
    void getCurrentWorkspace().then((next) => { if (active) { setWorkspace(next); void loadData(next) } }).catch((error: unknown) => { if (active) setWorkspaceError(error instanceof Error ? error.message : 'Could not load workspace.') })
    return () => { active = false }
  }, [user, loadData])

  const filteredLeads = useMemo(() => leads.filter((lead) => {
    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter
    const searchable = [lead.name, lead.email, lead.phone, lead.industry, lead.source].filter(Boolean).join(' ').toLowerCase()
    return matchesStatus && searchable.includes(query.toLowerCase().trim())
  }), [leads, query, statusFilter])

  if (authLoading) return <main className="grid min-h-screen place-items-center text-sm text-slate-500">Loading LeadPilot AI…</main>
  if (!user) return <AuthScreen />

  async function saveLead(values: LeadInput) {
    if (!supabase || !workspace) return
    setActionBusy(true); setDataError('')
    const payload = { ...values, workspace_id: workspace.id, email: values.email || null, phone: values.phone || null, industry: values.industry || null, source: values.source || null, requirements: values.requirements || null, previous_interaction: values.previous_interaction || null }
    const result = editingLead ? await supabase.from('leads').update(payload).eq('id', editingLead.id) : await supabase.from('leads').insert(payload)
    setActionBusy(false)
    if (result.error) { setDataError(result.error.message); return }
    setModalOpen(false); setEditingLead(null); await loadData()
  }

  async function deleteLead(lead: Lead) {
    if (!supabase || !window.confirm(`Delete ${lead.name} and their follow-up tasks?`)) return
    const { error } = await supabase.from('leads').delete().eq('id', lead.id)
    if (error) setDataError(error.message)
    else { setSelectedLead(null); await loadData() }
  }

  async function qualifyLead(lead: Lead) {
    if (!supabase) return
    setActionBusy(true); setActionMessage(''); setDataError('')
    const { data, error } = await supabase.functions.invoke('qualify-lead', { body: { lead_id: lead.id } })
    setActionBusy(false)
    if (error) { setDataError(error.message); return }
    const result = data as { score?: number; category?: string; summary?: string; error?: string }
    if (result.error) { setDataError(result.error); return }
    setActionMessage(`Lead qualified: ${result.score}/100 · ${result.category}`)
    await loadData()
  }

  async function toggleTask(task: FollowUpTask) {
    if (!supabase) return
    const { error } = await supabase.from('follow_up_tasks').update({ completed_at: task.completed_at ? null : new Date().toISOString() }).eq('id', task.id)
    if (error) setDataError(error.message); else await loadData()
  }

  const overdueCount = tasks.filter((task) => !task.completed_at && new Date(task.due_at) < new Date()).length
  const newLeads = leads.filter((lead) => lead.status === 'new').length
  const qualifiedLeads = leads.filter((lead) => lead.ai_qualification_score !== null).length
  const pipelineValue = leads.filter((lead) => !['won', 'lost'].includes(lead.status)).reduce((sum, lead) => sum + (Number(lead.budget) || 0), 0)

  return <div className="min-h-screen bg-[#f6f7fb] text-slate-900">
    {mobileNav && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-slate-950/30 md:hidden" onClick={() => setMobileNav(false)} />}
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-slate-200 bg-white transition-transform md:translate-x-0 ${mobileNav ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-[72px] items-center gap-3 border-b border-slate-100 px-6"><div className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-white"><Command size={19} /></div><div><p className="text-[15px] font-bold tracking-tight">LeadPilot <span className="text-indigo-600">AI</span></p><p className="text-[10px] tracking-[.13em] text-slate-400">LEAD INTELLIGENCE</p></div><button className="ml-auto md:hidden" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={18} /></button></div>
      <div className="px-4 pt-6"><p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.15em] text-slate-400">Workspace</p>{navItems.map(({ label, icon: Icon }) => <button key={label} onClick={() => { setPage(label); setMobileNav(false) }} className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] font-medium transition ${page === label ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}><Icon size={17} strokeWidth={1.8} />{label}{label === 'Follow-ups' && overdueCount > 0 && <span className="ml-auto rounded-full bg-rose-100 px-2 py-0.5 text-[10px] text-rose-700">{overdueCount}</span>}</button>)}</div>
      <div className="mt-auto p-4"><div className="mb-3 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3.5"><div className="mb-2 flex items-center gap-2 text-indigo-700"><Sparkles size={15} /><span className="text-xs font-semibold">AI insights</span></div><p className="text-[11px] leading-relaxed text-slate-600">Your lead qualification assistant is ready to review records.</p><button onClick={() => setPage('AI Assistant')} className="mt-2.5 text-[11px] font-semibold text-indigo-700 hover:text-indigo-900">Open assistant →</button></div><div className="flex items-center gap-3 border-t border-slate-100 pt-4"><div className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{user.email?.slice(0, 1).toUpperCase() ?? 'U'}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{user.email}</p><p className="text-[10px] text-slate-400">Workspace owner</p></div><button title="Sign out" onClick={() => void supabase?.auth.signOut()} className="text-slate-400 hover:text-slate-700"><LogOut size={16} /></button></div></div>
    </aside>
    <main className="min-h-screen md:pl-[248px]">
      <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-5 backdrop-blur md:px-8"><div className="flex items-center gap-3"><button className="text-slate-500 md:hidden" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={20} /></button><div><p className="text-[11px] text-slate-400">{workspace?.name ?? 'Your workspace'}</p><h1 className="text-[15px] font-semibold">{page}</h1></div></div><div className="flex items-center gap-2"><button onClick={() => setPage('Leads')} className="hidden h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs text-slate-500 hover:bg-slate-50 sm:flex"><Search size={14} /> Browse leads</button><button className="relative grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" title="Follow-up notifications" onClick={() => setPage('Follow-ups')}><Bell size={16} />{overdueCount > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />}</button><div className="mx-1 hidden h-6 border-l sm:block" /><button onClick={() => setPage('Settings')} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" title="Settings"><Settings size={17} /></button></div></header>
      <div className="mx-auto max-w-[1440px] px-5 py-7 md:px-8 lg:px-10">
        {workspaceError && <Notice tone="error" text={workspaceError} />}{dataError && <Notice tone="error" text={dataError} onClose={() => setDataError('')} />}{actionMessage && <Notice tone="success" text={actionMessage} onClose={() => setActionMessage('')} />}
        {!isSupabaseConfigured && <Notice tone="warn" text="Connect a Supabase project with .env.local to load real workspace data." />}
        {page === 'Overview' && <Overview workspace={workspace} leads={leads} tasks={tasks} newLeads={newLeads} qualifiedLeads={qualifiedLeads} overdueCount={overdueCount} pipelineValue={pipelineValue} loading={loadingData} onNavigate={setPage} onSelectLead={setSelectedLead} onToggleTask={toggleTask} onAdd={() => { setEditingLead(null); setModalOpen(true) }} />}
        {page === 'Leads' && <LeadsPage leads={filteredLeads} total={leads.length} query={query} setQuery={setQuery} statusFilter={statusFilter} setStatusFilter={setStatusFilter} onAdd={() => { setEditingLead(null); setModalOpen(true) }} onEdit={(lead) => { setEditingLead(lead); setModalOpen(true) }} onSelect={setSelectedLead} loading={loadingData} />}
        {page === 'Follow-ups' && <FollowUpsPage tasks={tasks} leads={leads} onToggle={toggleTask} onReload={loadData} />}
        {page === 'AI Assistant' && <AIAssistantPage leads={leads} drafts={drafts} onQualify={qualifyLead} busy={actionBusy} onNavigate={setPage} onReload={loadData} />}
        {page === 'Settings' && <SettingsPage workspace={workspace} leads={leads} onSaved={(next) => setWorkspace(next)} onReload={loadData} />}
      </div>
    </main>
    {modalOpen && <LeadModal initial={editingLead} busy={actionBusy} onClose={() => { setModalOpen(false); setEditingLead(null) }} onSave={saveLead} />}
    {selectedLead && <LeadPanel lead={leads.find((item) => item.id === selectedLead.id) ?? selectedLead} tasks={tasks.filter((task) => task.lead_id === selectedLead.id)} busy={actionBusy} onClose={() => setSelectedLead(null)} onEdit={() => { setEditingLead(selectedLead); setModalOpen(true) }} onDelete={() => void deleteLead(selectedLead)} onQualify={() => void qualifyLead(selectedLead)} onToggleTask={toggleTask} />}
  </div>
}

function Notice({ tone, text, onClose }: { tone: 'error' | 'success' | 'warn'; text: string; onClose?: () => void }) {
  const style = tone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`mb-5 flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${style}`}>{text}{onClose && <button aria-label="Dismiss" onClick={onClose}><X size={16} /></button>}</div>
}

function PageTitle({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: React.ReactNode }) {
  return <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[.16em] text-indigo-600">{eyebrow}</p><h2 className="text-2xl font-bold tracking-tight md:text-[27px]">{title}</h2><p className="mt-1.5 text-sm text-slate-500">{detail}</p></div>{action}</div>
}

function Overview({ workspace, leads, tasks, newLeads, qualifiedLeads, overdueCount, pipelineValue, loading, onNavigate, onSelectLead, onToggleTask, onAdd }: { workspace: Workspace | null; leads: Lead[]; tasks: FollowUpTask[]; newLeads: number; qualifiedLeads: number; overdueCount: number; pipelineValue: number; loading: boolean; onNavigate: (page: Page) => void; onSelectLead: (lead: Lead) => void; onToggleTask: (task: FollowUpTask) => void; onAdd: () => void }) {
  const recent = leads.slice(0, 5)
  const nextTasks = tasks.filter((task) => !task.completed_at).slice(0, 4)
  return <><PageTitle eyebrow="Your workspace" title={`Good to see you${workspace?.name ? '' : ' back'}.`} detail="Here’s what’s happening with your leads today." action={<button onClick={onAdd} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"><Plus size={16} /> Add lead</button>} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
      { label: 'Total leads', value: leads.length.toLocaleString(), hint: `${newLeads} new leads`, icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50', trend: '+ Live' },
      { label: 'Qualified by AI', value: qualifiedLeads.toLocaleString(), hint: leads.length ? `${Math.round(qualifiedLeads / leads.length * 100)}% of your leads` : 'Run your first qualification', icon: Sparkles, color: 'text-violet-600', bg: 'bg-violet-50', trend: 'AI' },
      { label: 'Open follow-ups', value: (tasks.filter((task) => !task.completed_at).length).toLocaleString(), hint: overdueCount ? `${overdueCount} overdue` : 'You’re all caught up', icon: CalendarClock, color: 'text-amber-600', bg: 'bg-amber-50', trend: overdueCount ? 'Needs attention' : 'On track' },
      { label: 'Pipeline value', value: pipelineValue.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }), hint: 'From open lead budgets', icon: Activity, color: 'text-emerald-600', bg: 'bg-emerald-50', trend: 'Live' },
    ].map(({ label, value, hint, icon: Icon, color, bg, trend }) => <div key={label} className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.03)]"><div className="flex items-start justify-between"><div className={`grid h-9 w-9 place-items-center rounded-lg ${bg} ${color}`}><Icon size={17} /></div><span className="rounded-full bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-500">{trend}</span></div><p className="mt-4 text-[12px] text-slate-500">{label}</p><p className="mt-1 text-[25px] font-bold tracking-tight">{loading ? '—' : value}</p><p className="mt-1 text-[11px] text-slate-400">{hint}</p></div>)}</div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,.9fr)]"><section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h3 className="text-sm font-semibold">Recent leads</h3><p className="mt-0.5 text-[11px] text-slate-400">The latest people added to your pipeline</p></div><button onClick={() => onNavigate('Leads')} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">View all →</button></div>{recent.length === 0 ? <EmptyState icon={Users} title={loading ? 'Loading leads' : 'Your pipeline starts here'} detail={loading ? 'Fetching workspace records…' : 'Add a lead or load fictional demo records to get started.'} action={!loading ? <button onClick={onAdd} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white">Add your first lead</button> : undefined} /> : <div className="overflow-x-auto"><table className="w-full min-w-[580px] text-left"><thead><tr className="bg-slate-50/70 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><th className="px-5 py-3">Lead</th><th className="px-3 py-3">Industry</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">AI score</th><th className="px-5 py-3">Added</th></tr></thead><tbody>{recent.map((lead) => <LeadRow key={lead.id} lead={lead} onClick={() => onSelectLead(lead)} />)}</tbody></table></div>}</section>
      <section className="rounded-xl border border-slate-200/80 bg-white"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h3 className="text-sm font-semibold">Upcoming follow-ups</h3><p className="mt-0.5 text-[11px] text-slate-400">Keep the conversation moving</p></div><button onClick={() => onNavigate('Follow-ups')} className="text-xs font-semibold text-indigo-600">View all →</button></div>{nextTasks.length === 0 ? <EmptyState icon={CalendarClock} title="No follow-ups due" detail="Create a task from any lead to keep your next steps close." /> : <div className="divide-y divide-slate-100">{nextTasks.map((task) => <TaskRow key={task.id} task={task} onToggle={() => onToggleTask(task)} />)}</div>}</section></div>
  </>
}

function LeadsPage({ leads, total, query, setQuery, statusFilter, setStatusFilter, onAdd, onEdit, onSelect, loading }: { leads: Lead[]; total: number; query: string; setQuery: (value: string) => void; statusFilter: 'all' | LeadStatus; setStatusFilter: (value: 'all' | LeadStatus) => void; onAdd: () => void; onEdit: (lead: Lead) => void; onSelect: (lead: Lead) => void; loading: boolean }) {
  return <><PageTitle eyebrow="Pipeline" title="Leads" detail={`${total} ${total === 1 ? 'lead' : 'leads'} in your workspace`} action={<button onClick={onAdd} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"><Plus size={16} /> Add lead</button>} /><section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white"><div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4"><label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"><Search size={15} className="text-slate-400" /><input aria-label="Search leads" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, industry…" className="w-full outline-none placeholder:text-slate-400" />{query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={14} /></button>}</label><select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | LeadStatus)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600"><option value="all">All statuses</option>{leadStatuses.map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}</select></div>{leads.length === 0 ? <EmptyState icon={Users} title={loading ? 'Loading leads' : 'No leads found'} detail={loading ? 'Fetching workspace records…' : query || statusFilter !== 'all' ? 'Try another search or clear the status filter.' : 'Add your first lead to start organizing your pipeline.'} action={!loading && !query && statusFilter === 'all' ? <button onClick={onAdd} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white">Add lead</button> : undefined} /> : <div className="overflow-x-auto"><table className="w-full min-w-[740px] text-left"><thead><tr className="bg-slate-50/70 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><th className="px-5 py-3">Name</th><th className="px-3 py-3">Industry · Source</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Budget</th><th className="px-3 py-3">AI score</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody>{leads.map((lead) => <tr key={lead.id} onClick={() => onSelect(lead)} className="cursor-pointer border-t border-slate-100 text-sm hover:bg-slate-50/70"><td className="px-5 py-3.5"><p className="font-medium text-slate-800">{lead.name}</p><p className="mt-0.5 text-[11px] text-slate-400">{lead.email || lead.phone || 'No contact details'}</p></td><td className="px-3 py-3.5 text-xs text-slate-600">{lead.industry || '—'}<p className="mt-0.5 text-[10px] text-slate-400">{lead.source || 'Source unknown'}</p></td><td className="px-3 py-3.5"><StatusBadge status={lead.status} /></td><td className="px-3 py-3.5 text-xs text-slate-600">{lead.budget === null ? '—' : Number(lead.budget).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}</td><td className="px-3 py-3.5"><Score value={lead.ai_qualification_score} /></td><td className="px-5 py-3.5 text-right"><button onClick={(event) => { event.stopPropagation(); onEdit(lead) }} className="rounded-md px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50">Edit</button></td></tr>)}</tbody></table></div>}</section></>
}

function LeadRow({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  return <tr onClick={onClick} className="cursor-pointer border-t border-slate-100 text-xs hover:bg-slate-50/70"><td className="px-5 py-3.5"><div className="flex items-center gap-3"><Avatar name={lead.name} /><div><p className="font-semibold text-slate-800">{lead.name}</p><p className="mt-0.5 text-[10px] text-slate-400">{lead.email || lead.phone || 'No contact details'}</p></div></div></td><td className="px-3 py-3.5 text-slate-600">{lead.industry || '—'}</td><td className="px-3 py-3.5"><StatusBadge status={lead.status} /></td><td className="px-3 py-3.5"><Score value={lead.ai_qualification_score} /></td><td className="px-5 py-3.5 text-slate-500">{new Date(lead.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td></tr>
}

function Avatar({ name }: { name: string }) {
  const colors = ['bg-violet-100 text-violet-700', 'bg-amber-100 text-amber-700', 'bg-emerald-100 text-emerald-700', 'bg-sky-100 text-sky-700']
  const color = colors[name.charCodeAt(0) % colors.length]
  return <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[10px] font-bold ${color}`}>{name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</div>
}

function StatusBadge({ status }: { status: LeadStatus }) { return <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-medium ${statusStyle[status]}`}>{statusLabel[status]}</span> }
function Score({ value }: { value: number | null }) { return value === null ? <span className="text-[11px] text-slate-400">Not scored</span> : <span className={`inline-flex items-center gap-1 text-xs font-semibold ${value >= 61 ? 'text-emerald-700' : value >= 31 ? 'text-amber-700' : 'text-slate-500'}`}><span className={`h-1.5 w-1.5 rounded-full ${value >= 61 ? 'bg-emerald-500' : value >= 31 ? 'bg-amber-500' : 'bg-slate-400'}`} />{value}<span className="font-normal text-slate-400">/100</span></span> }

function TaskRow({ task, onToggle }: { task: FollowUpTask; onToggle: () => void }) {
  const overdue = !task.completed_at && new Date(task.due_at) < new Date()
  return <div className="flex items-start gap-3 px-5 py-4"><button aria-label={task.completed_at ? 'Mark incomplete' : 'Mark complete'} onClick={onToggle} className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${task.completed_at ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 text-transparent hover:border-indigo-500'}`}>{task.completed_at && <Check size={11} />}</button><div className="min-w-0 flex-1"><p className={`text-xs font-medium ${task.completed_at ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{task.title}</p><p className="mt-1 truncate text-[10px] text-slate-400">{task.lead?.name ?? 'Lead'} · {new Date(task.due_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p></div>{overdue && <span className="mt-0.5 rounded-full bg-rose-50 px-2 py-1 text-[9px] font-semibold text-rose-600">Overdue</span>}</div>
}

function EmptyState({ icon: Icon, title, detail, action }: { icon: typeof Users; title: string; detail: string; action?: React.ReactNode }) {
  return <div className="flex min-h-48 flex-col items-center justify-center px-6 py-10 text-center"><div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-400"><Icon size={18} /></div><p className="text-sm font-semibold">{title}</p><p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-400">{detail}</p>{action && <div className="mt-4">{action}</div>}</div>
}

function LeadModal({ initial, busy, onClose, onSave }: { initial: Lead | null; busy: boolean; onClose: () => void; onSave: (values: LeadInput) => void }) {
  const [error, setError] = useState('')
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section role="dialog" aria-modal="true" aria-labelledby="lead-modal-title" className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"><div className="mb-5 flex items-start justify-between"><div><h2 id="lead-modal-title" className="text-lg font-bold">{initial ? 'Edit lead' : 'Add a lead'}</h2><p className="mt-1 text-xs text-slate-500">Keep the key details together for your next conversation.</p></div><button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700"><X size={19} /></button></div><form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const budgetRaw = String(form.get('budget') ?? '').trim(); const values: LeadInput = { name: String(form.get('name') ?? '').trim(), email: String(form.get('email') ?? '').trim(), phone: String(form.get('phone') ?? '').trim(), industry: String(form.get('industry') ?? '').trim(), source: String(form.get('source') ?? '').trim(), budget: budgetRaw ? Number(budgetRaw) : null, requirements: String(form.get('requirements') ?? '').trim(), previous_interaction: String(form.get('previous_interaction') ?? '').trim() || null, status: String(form.get('status') ?? 'new') as LeadStatus }; if (!values.name || values.name.length > 160) { setError('Enter a name between 1 and 160 characters.'); return } if (values.email && !/^\S+@\S+\.\S+$/.test(values.email)) { setError('Enter a valid email address.'); return } if (values.budget !== null && (!Number.isFinite(values.budget) || values.budget < 0)) { setError('Budget must be a non-negative number.'); return } if (!leadStatuses.includes(values.status)) { setError('Choose a valid lead status.'); return } onSave(values) }}>
    <Field label="Name *" name="name" initial={initial?.name} required maxLength={160} /><Field label="Email" name="email" type="email" initial={initial?.email ?? ''} /><Field label="Phone" name="phone" type="tel" initial={initial?.phone ?? ''} /><Field label="Industry" name="industry" initial={initial?.industry ?? ''} placeholder="e.g. Hospitality" /><Field label="Lead source" name="source" initial={initial?.source ?? ''} placeholder="e.g. Website" /><Field label="Budget" name="budget" type="number" initial={initial?.budget ?? ''} min="0" step="0.01" /><label className="grid gap-1.5 text-xs font-medium text-slate-600">Status<select name="status" defaultValue={initial?.status ?? 'new'} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800">{leadStatuses.map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}</select></label><label className="grid gap-1.5 text-xs font-medium text-slate-600 sm:col-span-2">Requirements / expressed interest<textarea name="requirements" defaultValue={initial?.requirements ?? ''} maxLength={3000} rows={4} placeholder="What did the lead ask for or share?" className="resize-y rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /></label><label className="grid gap-1.5 text-xs font-medium text-slate-600 sm:col-span-2">Previous interaction summary<textarea name="previous_interaction" defaultValue={initial?.previous_interaction ?? ''} maxLength={2000} rows={3} placeholder="Optional notes from a prior conversation or inquiry" className="resize-y rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /></label>
    {error && <p role="alert" className="text-xs text-rose-600 sm:col-span-2">{error}</p>}<div className="flex justify-end gap-2 border-t border-slate-100 pt-4 sm:col-span-2"><button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600">Cancel</button><button disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Saving…' : initial ? 'Save changes' : 'Create lead'}</button></div></form></section></div>
}

function Field({ label, name, initial, type = 'text', ...props }: { label: string; name: string; initial?: string | number; type?: string; required?: boolean; maxLength?: number; min?: string; step?: string; placeholder?: string }) { return <label className="grid gap-1.5 text-xs font-medium text-slate-600">{label}<input name={name} type={type} defaultValue={initial} {...props} className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /></label> }

function LeadPanel({ lead, tasks, busy, onClose, onEdit, onDelete, onQualify, onToggleTask }: { lead: Lead; tasks: FollowUpTask[]; busy: boolean; onClose: () => void; onEdit: () => void; onDelete: () => void; onQualify: () => void; onToggleTask: (task: FollowUpTask) => void }) {
  return <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/30" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><aside role="dialog" aria-modal="true" aria-label={`${lead.name} lead details`} className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-xl"><div className="flex items-center justify-between border-b border-slate-100 px-6 py-4"><p className="text-xs font-semibold text-slate-400">LEAD DETAILS</p><button onClick={onClose} aria-label="Close lead details" className="text-slate-400"><X size={19} /></button></div><div className="p-6"><div className="flex items-start gap-4"><Avatar name={lead.name} /><div className="min-w-0 flex-1"><h2 className="text-xl font-bold">{lead.name}</h2><p className="mt-1 text-xs text-slate-500">{lead.industry || 'Industry not added'} · {lead.source || 'Source unknown'}</p></div><StatusBadge status={lead.status} /></div><div className="mt-6 flex gap-2"><button onClick={onEdit} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Edit lead</button><button disabled={busy} onClick={onQualify} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"><Sparkles size={13} />{busy ? 'Reviewing…' : 'AI qualify'}</button><button onClick={onDelete} className="ml-auto rounded-lg px-3 py-2 text-xs text-rose-600 hover:bg-rose-50">Delete</button></div><div className="mt-7 grid grid-cols-2 gap-3">{[['Email', lead.email], ['Phone', lead.phone], ['Budget', lead.budget === null ? null : Number(lead.budget).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })], ['Added', new Date(lead.created_at).toLocaleDateString()]].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 break-words text-xs font-medium text-slate-700">{value || 'Not provided'}</p></div>)}</div>{lead.requirements && <section className="mt-6"><h3 className="text-xs font-semibold">Requirements & expressed interest</h3><p className="mt-2 whitespace-pre-wrap rounded-lg border border-slate-100 p-3 text-xs leading-relaxed text-slate-600">{lead.requirements}</p></section>}<section className="mt-6"><div className="flex items-center justify-between"><h3 className="text-xs font-semibold">AI qualification</h3><Score value={lead.ai_qualification_score} /></div>{lead.ai_qualification_score === null ? <p className="mt-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">Review this lead with AI to get an evidence-based score and suggested next step.</p> : <div className="mt-3 space-y-3 rounded-lg border border-indigo-100 bg-indigo-50/40 p-4"><p className="text-xs leading-relaxed text-slate-700">{lead.ai_qualification_summary}</p>{lead.ai_qualification_reasons?.length > 0 && <div><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Evidence</p><ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-slate-600">{lead.ai_qualification_reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>}{lead.ai_missing_information?.length > 0 && <div><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Still to learn</p><ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-slate-600">{lead.ai_missing_information.map((item) => <li key={item}>{item}</li>)}</ul></div>}<p className="text-xs"><span className="font-semibold">Next:</span> {lead.ai_recommended_action}</p><p className="text-[10px] text-slate-400">An assistant’s summary, not a validated prediction.</p></div>}</section><section className="mt-6"><h3 className="text-xs font-semibold">Follow-up tasks</h3>{tasks.length ? <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-100">{tasks.map((task) => <TaskRow key={task.id} task={task} onToggle={() => onToggleTask(task)} />)}</div> : <p className="mt-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">No follow-up tasks for this lead yet.</p>}</section></div></aside></div>
}

function FollowUpsPage({ tasks, leads, onToggle, onReload }: { tasks: FollowUpTask[]; leads: Lead[]; onToggle: (task: FollowUpTask) => void; onReload: () => void }) {
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const pending = tasks.filter((task) => !task.completed_at)
  const completed = tasks.filter((task) => task.completed_at)
  async function createTask(form: HTMLFormElement) {
    if (!supabase) return
    const values = new FormData(form)
    const leadId = String(values.get('lead_id') ?? '')
    const title = String(values.get('title') ?? '').trim()
    const due = String(values.get('due_at') ?? '')
    if (!leadId || !title || !due || !leads.some((lead) => lead.id === leadId)) { setError('Choose a lead, task title, and due date.'); return }
    setSaving(true); setError('')
    const workspace = await getCurrentWorkspace()
    const { error: saveError } = await supabase.from('follow_up_tasks').insert({ workspace_id: workspace.id, lead_id: leadId, title, due_at: new Date(due).toISOString() })
    setSaving(false)
    if (saveError) { setError(saveError.message); return }
    setShowForm(false); onReload()
  }
  const groups = [{ label: 'Needs attention', tasks: pending.filter((task) => new Date(task.due_at) < new Date()), empty: 'Nothing overdue. Nice work.' }, { label: 'Coming up', tasks: pending.filter((task) => new Date(task.due_at) >= new Date()), empty: 'No upcoming tasks. Add a follow-up while the conversation is fresh.' }, { label: 'Completed', tasks: completed, empty: '' }]
  return <><PageTitle eyebrow="Stay on track" title="Follow-ups" detail={`${pending.length} open · ${pending.filter((task) => new Date(task.due_at) < new Date()).length} overdue`} action={<button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16} /> Add task</button>} />{showForm && <section className="mb-5 rounded-xl border border-slate-200 bg-white p-5"><h3 className="mb-3 text-sm font-semibold">New follow-up task</h3><form onSubmit={(event) => { event.preventDefault(); void createTask(event.currentTarget) }} className="grid gap-3 md:grid-cols-4"><select name="lead_id" required className="rounded-lg border border-slate-200 px-3 py-2 text-sm"><option value="">Select lead…</option>{leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.name}</option>)}</select><input name="title" required maxLength={240} placeholder="What needs to happen?" className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2" /><input type="datetime-local" name="due_at" required className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><div className="flex items-center gap-2 md:col-span-4">{error && <span role="alert" className="text-xs text-rose-600">{error}</span>}<button disabled={saving} className="ml-auto rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white">{saving ? 'Saving…' : 'Create task'}</button><button type="button" onClick={() => setShowForm(false)} className="rounded-lg px-3 py-2 text-xs text-slate-500">Cancel</button></div></form></section>}{tasks.length === 0 ? <div className="rounded-xl border border-slate-200 bg-white"><EmptyState icon={CalendarClock} title="No follow-up tasks yet" detail="Add reminders tied to leads. You control when they are complete." action={<button onClick={() => setShowForm(true)} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white">Create a task</button>} /></div> : <div className="space-y-5">{groups.filter((group) => group.tasks.length || group.label !== 'Completed').map(({ label, tasks: groupTasks, empty }) => <section key={label}><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{label} <span className="ml-1 font-normal">{groupTasks.length}</span></h3><div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200/80 bg-white">{groupTasks.length ? groupTasks.map((task) => <TaskRow key={task.id} task={task} onToggle={() => onToggle(task)} />) : <p className="px-5 py-4 text-xs text-slate-400">{empty}</p>}</div></section>)}</div>}</>
}

function SettingsPage({ workspace, leads, onSaved, onReload }: { workspace: Workspace | null; leads: Lead[]; onSaved: (workspace: Workspace) => void; onReload: () => Promise<void> }) {
  const [name, setName] = useState(workspace?.name ?? '')
  const [industry, setIndustry] = useState(workspace?.industry ?? '')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [demoBusy, setDemoBusy] = useState(false)
  useEffect(() => { setName(workspace?.name ?? ''); setIndustry(workspace?.industry ?? '') }, [workspace])
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!supabase || !workspace || !name.trim()) return
    setBusy(true); setMessage('')
    const { data, error } = await supabase.from('workspaces').update({ name: name.trim(), industry: industry.trim() || null }).eq('id', workspace.id).select('id, name, industry').single()
    setBusy(false)
    if (error) { setMessage(error.message); return }
    onSaved(data); setMessage('Business context saved.')
  }
  async function loadDemo() {
    if (!workspace) return
    setDemoBusy(true); setMessage('')
    try { const count = await insertFictionalDemoData(workspace.id); setMessage(`${count} fictional demo leads and follow-up tasks added.`); await onReload() }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not load demo data.') }
    finally { setDemoBusy(false) }
  }
  return <><PageTitle eyebrow="Preferences" title="Settings" detail="Manage your workspace details and account." /><section className="max-w-2xl rounded-xl border border-slate-200/80 bg-white p-6"><div className="mb-5 flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-50 text-indigo-600"><BriefcaseBusiness size={17} /></div><div><h3 className="text-sm font-semibold">Workspace</h3><p className="text-[11px] text-slate-400">Your lead data is scoped to this workspace.</p></div></div><form onSubmit={(event) => void save(event)} className="flex flex-wrap items-end gap-3"><label className="grid min-w-[220px] flex-1 gap-1.5 text-xs font-medium text-slate-600">Workspace name<input maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400" /></label><label className="grid min-w-[220px] flex-1 gap-1.5 text-xs font-medium text-slate-600">Business industry<input maxLength={120} value={industry} onChange={(event) => setIndustry(event.target.value)} placeholder="e.g. Hospitality, real estate, coaching" className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400" /></label><button disabled={busy || !name.trim()} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save changes'}</button></form>{message && <p role="status" className="mt-3 text-xs text-slate-500">{message}</p>}<div className="mt-8 border-t border-slate-100 pt-5"><h3 className="text-sm font-semibold">Your account</h3><p className="mt-1 text-xs text-slate-500">{supabase ? 'Email and password managed securely by Supabase Auth.' : 'Add Supabase settings to connect account security.'}</p></div><div className="mt-8 border-t border-slate-100 pt-5"><h3 className="text-sm font-semibold">Explore LeadPilot</h3><p className="mt-1 text-xs leading-relaxed text-slate-500">Load nine clearly fictional leads across hotels, real estate, and coaching, plus example follow-up tasks. Demo leads use example.com addresses and are labeled “LeadPilot demo”. This can be added once per workspace.</p><button disabled={demoBusy || leads.some((lead) => lead.source === 'LeadPilot demo')} onClick={() => void loadDemo()} className="mt-3 rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">{demoBusy ? 'Adding sample records…' : leads.some((lead) => lead.source === 'LeadPilot demo') ? 'Demo records already loaded' : 'Load fictional demo data'}</button></div></section></>
}

function App() { return <AuthProvider><AppContent /></AuthProvider> }
export default App
