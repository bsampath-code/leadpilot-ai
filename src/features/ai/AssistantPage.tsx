import { useState } from 'react'
import { Bot, Check, FileText, Sparkles, Users } from 'lucide-react'
import type { AiDraft, Lead } from '../../lib/types'
import { supabase } from '../../lib/supabase'

type Page = 'Overview' | 'Leads' | 'Follow-ups' | 'AI Assistant' | 'Settings'

export function AssistantPage({ leads, drafts, busy, onQualify, onNavigate, onReload }: {
  leads: Lead[]
  drafts: AiDraft[]
  busy: boolean
  onQualify: (lead: Lead) => void
  onNavigate: (page: Page) => void
  onReload: () => void
}) {
  const [query, setQuery] = useState('')
  const [leadId, setLeadId] = useState('')
  const [channel, setChannel] = useState<AiDraft['channel']>('email')
  const [tone, setTone] = useState<AiDraft['tone']>('professional')
  const [objective, setObjective] = useState<AiDraft['objective']>('ask_clarifying_question')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [edits, setEdits] = useState<Record<string, { subject: string; message: string }>>({})
  const filtered = leads.filter((lead) => lead.name.toLowerCase().includes(query.toLowerCase()) || (lead.industry ?? '').toLowerCase().includes(query.toLowerCase()))

  async function generate(event: React.FormEvent) {
    event.preventDefault()
    if (!supabase || !leadId) return
    setGenerating(true); setError(''); setSuccess('')
    const { data, error: invokeError } = await supabase.functions.invoke('generate-follow-up', { body: { lead_id: leadId, channel, tone, objective } })
    setGenerating(false)
    if (invokeError) { setError(invokeError.message); return }
    if (data?.error) { setError(data.error); return }
    setSuccess('Draft created and saved. Review it before using it.')
    await onReload()
  }

  function draftValue(draft: AiDraft) { return edits[draft.id] ?? { subject: draft.subject ?? '', message: draft.message } }
  async function saveDraft(draft: AiDraft) {
    if (!supabase) return
    const values = draftValue(draft)
    if (!values.message.trim() || values.message.length > 5000 || values.subject.length > 180) { setError('Keep the message between 1 and 5000 characters and subject under 180.'); return }
    setSaving(draft.id); setError(''); setSuccess('')
    const { error: saveError } = await supabase.from('ai_follow_up_drafts').update({ subject: values.subject.trim(), message: values.message.trim() }).eq('id', draft.id)
    setSaving(null)
    if (saveError) { setError(saveError.message); return }
    setSuccess('Draft changes saved. Nothing has been sent.')
    await onReload()
  }

  return <>
    <div className="mb-7"><p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[.16em] text-indigo-600">AI workspace</p><h2 className="text-2xl font-bold tracking-tight md:text-[27px]">AI Assistant</h2><p className="mt-1.5 text-sm text-slate-500">Review lead intent and prepare a next conversation.</p></div>
    <div className="mb-5 rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-violet-50 p-6 md:p-8"><div className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-600 text-white shadow-sm"><Sparkles size={20} /></div><h2 className="mt-4 text-lg font-bold">Evidence first. Human decision always.</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">LeadPilot reads only the details you recorded, then returns a qualification score, supporting reasons, missing information, and one practical next action. The score is an assistant summary, not a validated prediction.</p><div className="mt-4 flex flex-wrap gap-2 text-[11px] text-slate-500"><span className="rounded-full border border-indigo-100 bg-white/70 px-2.5 py-1">No automatic outreach</span><span className="rounded-full border border-indigo-100 bg-white/70 px-2.5 py-1">Workspace private</span><span className="rounded-full border border-indigo-100 bg-white/70 px-2.5 py-1">You control next steps</span></div></div>
    {(error || success) && <p role={error ? 'alert' : 'status'} className={`mb-4 rounded-lg border px-3 py-2 text-xs ${error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{error || success}</p>}
    <section className="mb-5 rounded-xl border border-slate-200/80 bg-white p-5"><div className="mb-4 flex items-center gap-2"><div className="grid h-8 w-8 place-items-center rounded-lg bg-violet-50 text-violet-600"><FileText size={16} /></div><div><h3 className="text-sm font-semibold">Draft a follow-up</h3><p className="text-[11px] text-slate-400">Generated drafts are editable and never sent automatically.</p></div></div><form onSubmit={(event) => void generate(event)} className="grid gap-3 md:grid-cols-[1.5fr_1fr_1fr_1.5fr_auto]"><select aria-label="Lead for follow-up" required value={leadId} onChange={(event) => setLeadId(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="">Choose a lead…</option>{leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.name}</option>)}</select><select aria-label="Follow-up channel" value={channel} onChange={(event) => setChannel(event.target.value as AiDraft['channel'])} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="email">Email</option><option value="whatsapp">WhatsApp-style</option><option value="sms">SMS</option></select><select aria-label="Message tone" value={tone} onChange={(event) => setTone(event.target.value as AiDraft['tone'])} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="professional">Professional</option><option value="friendly">Friendly</option><option value="concise">Concise</option></select><select aria-label="Draft objective" value={objective} onChange={(event) => setObjective(event.target.value as AiDraft['objective'])} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="ask_clarifying_question">Ask a clarifying question</option><option value="arrange_call">Arrange a call</option><option value="offer_relevant_next_step">Offer a relevant next step</option><option value="follow_up_previous_inquiry">Follow up on a previous inquiry</option></select><button disabled={!leadId || generating} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Sparkles size={15} />{generating ? 'Creating…' : 'Generate draft'}</button></form></section>
    <section className="mb-5 overflow-hidden rounded-xl border border-slate-200/80 bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4"><div className="flex items-center gap-2"><Users size={15} className="text-indigo-500" /><div><h3 className="text-sm font-semibold">Leads to review</h3><p className="text-[11px] text-slate-400">{leads.filter((lead) => lead.ai_qualification_score === null).length} without a qualification</p></div></div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a lead…" className="rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-400" /></div>{filtered.length === 0 ? <div className="p-8 text-center"><Bot className="mx-auto text-slate-300" size={22} /><p className="mt-2 text-sm font-semibold">No leads to review</p><button onClick={() => onNavigate('Leads')} className="mt-3 text-xs font-semibold text-indigo-600">Go to leads →</button></div> : <div className="divide-y divide-slate-100">{filtered.map((lead) => <div key={lead.id} className="flex flex-wrap items-center gap-3 px-5 py-4"><div className="grid h-8 w-8 place-items-center rounded-full bg-indigo-50 text-[10px] font-bold text-indigo-700">{lead.name.slice(0, 1).toUpperCase()}</div><div className="min-w-[150px] flex-1"><p className="text-xs font-semibold">{lead.name}</p><p className="mt-1 text-[10px] text-slate-400">{lead.industry || 'Industry not provided'} · {lead.requirements ? `${lead.requirements.length} chars of requirements` : 'No requirements noted'}</p></div><span className="text-xs text-slate-500">{lead.ai_qualification_score === null ? 'Not scored' : `${lead.ai_qualification_score}/100`}</span><button disabled={busy} onClick={() => onQualify(lead)} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"><Sparkles size={13} />{busy ? 'Reviewing…' : lead.ai_qualification_score === null ? 'Qualify' : 'Requalify'}</button></div>)}</div>}</section>
    <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white"><div className="border-b border-slate-100 p-4"><h3 className="text-sm font-semibold">Saved drafts</h3><p className="mt-0.5 text-[11px] text-slate-400">Edit any draft before using it. LeadPilot has no sending integration.</p></div>{drafts.length === 0 ? <div className="p-8 text-center text-xs text-slate-400">Your generated drafts will appear here.</div> : <div className="divide-y divide-slate-100">{drafts.map((draft) => { const value = draftValue(draft); return <article key={draft.id} className="p-5"><div className="mb-3 flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium capitalize text-slate-600">{draft.channel}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium capitalize text-slate-600">{draft.tone}</span><span className="text-[10px] text-slate-400">{draft.lead?.name ?? 'Lead'} · {new Date(draft.created_at).toLocaleDateString()}</span><button disabled={saving === draft.id} onClick={() => void saveDraft(draft)} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 disabled:opacity-50"><Check size={13} />{saving === draft.id ? 'Saving…' : 'Save edits'}</button></div>{draft.channel === 'email' && <label className="mb-2 grid gap-1 text-[10px] font-medium text-slate-400">SUBJECT<input value={value.subject} maxLength={180} onChange={(event) => setEdits({ ...edits, [draft.id]: { ...value, subject: event.target.value } })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-indigo-400" /></label>}<label className="grid gap-1 text-[10px] font-medium text-slate-400">MESSAGE<textarea rows={5} maxLength={5000} value={value.message} onChange={(event) => setEdits({ ...edits, [draft.id]: { ...value, message: event.target.value } })} className="resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal leading-relaxed text-slate-800 outline-none focus:border-indigo-400" /></label><div className="mt-3 rounded-lg bg-slate-50 p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Why this approach</p><p className="mt-1 text-xs leading-relaxed text-slate-600">{draft.reason}</p></div><p className="mt-2 text-[10px] text-slate-400">Draft only · No messages sent</p></article> })}</div>}</section>
  </>
}
