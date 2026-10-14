import { supabase } from './supabase'
import type { LeadInput } from './types'

const fictionalLeads: LeadInput[] = [
  { name: 'Avery Chen', email: 'avery.chen@example.com', phone: '+1 202-555-0142', industry: 'Hotels', source: 'LeadPilot demo', budget: 18000, requirements: 'Asked about a 24-room boutique hotel booking and guest follow-up system. Wants a walkthrough for the front desk team.', status: 'contacted' },
  { name: 'Morgan Patel', email: 'morgan.patel@example.com', phone: null, industry: 'Hotels', source: 'LeadPilot demo', budget: 9500, requirements: 'Interested in reducing missed group booking inquiries; asked whether multiple properties can share an inbox.', status: 'qualified' },
  { name: 'Jordan Rivera', email: 'jordan.rivera@example.com', phone: '+1 202-555-0188', industry: 'Hotels', source: 'LeadPilot demo', budget: null, requirements: 'Requested information about collecting direct-booking inquiries. Timeline and budget not discussed.', status: 'new' },
  { name: 'Taylor Brooks', email: 'taylor.brooks@example.com', phone: '+1 202-555-0120', industry: 'Real estate', source: 'LeadPilot demo', budget: 24000, requirements: 'Looking for a lead intake workflow for residential sales. Requested a comparison of follow-up options and a call next week.', status: 'proposal' },
  { name: 'Casey Nguyen', email: 'casey.nguyen@example.com', phone: null, industry: 'Real estate', source: 'LeadPilot demo', budget: 12000, requirements: 'Asked about routing inquiries between four agents and tracking viewing requests. Wants to know setup requirements.', status: 'qualified' },
  { name: 'Riley Thompson', email: 'riley.thompson@example.com', phone: '+1 202-555-0167', industry: 'Real estate', source: 'LeadPilot demo', budget: null, requirements: 'Requested a brochure for a small rental portfolio. No specific timing or budget shared.', status: 'new' },
  { name: 'Quinn Morgan', email: 'quinn.morgan@example.com', phone: '+1 202-555-0131', industry: 'Coaching', source: 'LeadPilot demo', budget: 7200, requirements: 'Runs a career coaching practice and asked for a demo of inquiry tracking and consultation reminders.', status: 'contacted' },
  { name: 'Jamie Okafor', email: 'jamie.okafor@example.com', phone: null, industry: 'Coaching', source: 'LeadPilot demo', budget: null, requirements: 'Interested in organizing discovery call requests. Asked for an overview; decision process and budget are not known.', status: 'new' },
  { name: 'Drew Fischer', email: 'drew.fischer@example.com', phone: '+1 202-555-0194', industry: 'Coaching', source: 'LeadPilot demo', budget: 15000, requirements: 'Asked about a workspace for a five-coach team, lead ownership, and reporting. Requested a team demonstration.', status: 'qualified' },
]

export async function insertFictionalDemoData(workspaceId: string) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { count, error: checkError } = await supabase.from('leads').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('source', 'LeadPilot demo')
  if (checkError) throw checkError
  if ((count ?? 0) > 0) throw new Error('Fictional demo records have already been added to this workspace.')
  const { data, error } = await supabase.from('leads').insert(fictionalLeads.map((lead) => ({ ...lead, workspace_id: workspaceId }))).select('id, name, industry')
  if (error) throw error
  if (!data) throw new Error('Demo leads were not returned by the database')
  const deadlines = [2, -1, 4, 1, 6, -2]
  const taskRows = data.slice(0, deadlines.length).map((lead, index) => {
    const dueAt = new Date(Date.now() + deadlines[index] * 86_400_000)
    return { workspace_id: workspaceId, lead_id: lead.id, title: ['Prepare a tailored product walkthrough', 'Confirm inquiry routing needs', 'Share property workflow overview', 'Follow up on requested comparison', 'Send coaching team demo details', 'Ask which consultation details matter'][index], due_at: dueAt.toISOString() }
  })
  const { error: taskError } = await supabase.from('follow_up_tasks').insert(taskRows)
  if (taskError) {
    await supabase.from('leads').delete().in('id', data.map((lead) => lead.id))
    throw taskError
  }
  return data.length
}
