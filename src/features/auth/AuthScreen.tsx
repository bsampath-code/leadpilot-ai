import { useState } from 'react'
import { z } from 'zod'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'

const credentialsSchema = z.object({ email: z.email('Enter a valid email'), password: z.string().min(8, 'Use at least 8 characters') })

export function AuthScreen() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  async function submit(form: HTMLFormElement) {
    setError(null); setNotice(null)
    const parsed = credentialsSchema.safeParse(Object.fromEntries(new FormData(form)))
    if (!parsed.success) { setError(parsed.error.issues[0].message); return }
    if (!supabase) { setError('Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to connect this app.'); return }
    setPending(true)
    try {
      const result = mode === 'sign-in' ? await supabase.auth.signInWithPassword(parsed.data) : await supabase.auth.signUp({ ...parsed.data, options: { emailRedirectTo: window.location.origin } })
      if (result.error) { setError(result.error.message); return }
      if (mode === 'sign-up' && !result.data.session) setNotice('Check your inbox to confirm your email, then sign in.')
    } catch {
      setError('Could not reach the authentication service. Check your connection and try again.')
    } finally { setPending(false) }
  }
  return <main className="grid min-h-screen place-items-center p-5"><section className="w-full max-w-md rounded-2xl border bg-white p-8 shadow-sm"><div className="mb-8"><p className="text-sm font-semibold text-brand">LEADPILOT AI</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Stay close to every lead.</h1><p className="mt-2 text-slate-600">Your focused AI follow-up workspace.</p></div>{!isSupabaseConfigured && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Local setup mode — configure Supabase to sign in.</p>}<form onSubmit={(event) => { event.preventDefault(); void submit(event.currentTarget) }} className="space-y-4"><label className="grid gap-1.5 text-sm font-medium">Email<input name="email" type="email" autoComplete="email" required className="rounded-lg border px-3 py-2.5 outline-none ring-brand focus:ring-2" /></label><label className="grid gap-1.5 text-sm font-medium">Password<input name="password" type="password" minLength={8} autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} required className="rounded-lg border px-3 py-2.5 outline-none ring-brand focus:ring-2" /></label>{error && <p role="alert" className="text-sm text-red-600">{error}</p>}{notice && <p className="text-sm text-emerald-700">{notice}</p>}<button disabled={pending} className="w-full rounded-lg bg-brand px-4 py-2.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">{pending ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create workspace'}</button></form><button className="mt-5 w-full text-sm text-slate-600 hover:text-brand" onClick={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}>{mode === 'sign-in' ? 'New here? Create an account' : 'Already have an account? Sign in'}</button></section></main>
}
