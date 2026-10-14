import type { Session, User } from '@supabase/supabase-js'
import { createContext, useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'

type AuthContextValue = { user: User | null; session: Session | null; loading: boolean }
export const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) { setLoading(false); return }
    void supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => { setSession(nextSession); setLoading(false) })
    return () => listener.subscription.unsubscribe()
  }, [])
  return <AuthContext.Provider value={{ session, user: session?.user ?? null, loading }}>{children}</AuthContext.Provider>
}
