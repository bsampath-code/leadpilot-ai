export const leadStatuses = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'] as const
export type LeadStatus = typeof leadStatuses[number]

export type Lead = {
  id: string
  workspace_id: string
  name: string
  email: string | null
  phone: string | null
  industry: string | null
  source: string | null
  budget: number | null
  requirements: string | null
  previous_interaction: string | null
  status: LeadStatus
  ai_qualification_score: number | null
  ai_qualification_category: 'high' | 'medium' | 'low' | null
  ai_qualification_reasons: string[]
  ai_missing_information: string[]
  ai_recommended_action: string | null
  ai_qualification_summary: string | null
  created_at: string
  updated_at: string
}

export type LeadInput = Pick<Lead, 'name' | 'email' | 'phone' | 'industry' | 'source' | 'budget' | 'requirements' | 'status'> & { previous_interaction?: string | null }

export type FollowUpTask = {
  id: string
  workspace_id: string
  lead_id: string
  title: string
  due_at: string
  completed_at: string | null
  created_at: string
  lead?: Pick<Lead, 'name'>
}

export type AiDraft = {
  id: string
  workspace_id: string
  lead_id: string
  channel: 'email' | 'whatsapp' | 'sms'
  tone: 'professional' | 'friendly' | 'concise'
  objective: 'ask_clarifying_question' | 'arrange_call' | 'offer_relevant_next_step' | 'follow_up_previous_inquiry'
  subject: string
  message: string
  reason: string
  created_at: string
  updated_at: string
  lead?: Pick<Lead, 'name'>
}

export type Workspace = { id: string; name: string; industry: string | null }
