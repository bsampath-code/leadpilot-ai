import { supabase } from './supabase'
import type { Workspace } from './types'

export async function getCurrentWorkspace(): Promise<Workspace> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.from('workspaces').select('id, name, industry').limit(1).maybeSingle()
  if (error) throw error
  if (!data) throw new Error('No workspace is linked to this account. Sign out and contact your administrator.')
  return data
}
