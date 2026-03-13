import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export const signUp = (email, password, username) =>
  supabase.auth.signUp({ email, password, options: { data: { username } } })

export const signIn = (email, password) =>
  supabase.auth.signInWithPassword({ email, password })

export const signOut = () => supabase.auth.signOut()

export const fetchEvents = async (filters = {}) => {
  let query = supabase
    .from('events')
    .select('*, profiles(username, avatar_url), event_attendees(count)')
    .order('date', { ascending: true })
  if (filters.type && filters.type !== 'all') query = query.eq('type', filters.type)
  if (filters.search) query = query.or(`title.ilike.%${filters.search}%,city.ilike.%${filters.search}%`)
  const { data, error } = await query
  if (error) throw error
  return data
}

export const createEvent = async (eventData, userId) => {
  const { data, error } = await supabase.from('events').insert([{ ...eventData, user_id: userId }]).select().single()
  if (error) throw error
  return data
}

export const uploadEventPhoto = async (file, eventId) => {
  const ext = file.name.split('.').pop()
  const path = `events/${eventId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('event-photos').upload(path, file)
  if (error) throw error
  const { data } = supabase.storage.from('event-photos').getPublicUrl(path)
  return data.publicUrl
}

export const toggleAttendance = async (eventId, userId) => {
  const { data: existing } = await supabase.from('event_attendees').select('id').eq('event_id', eventId).eq('user_id', userId).single()
  if (existing) { await supabase.from('event_attendees').delete().eq('id', existing.id); return false }
  await supabase.from('event_attendees').insert([{ event_id: eventId, user_id: userId }])
  return true
}

export const getAttendanceStatus = async (eventId, userId) => {
  const { data } = await supabase.from('event_attendees').select('id').eq('event_id', eventId).eq('user_id', userId).single()
  return !!data
}

export const fetchComments = async (eventId) => {
  const { data, error } = await supabase.from('comments').select('*, profiles(username, avatar_url)').eq('event_id', eventId).order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export const postComment = async (eventId, userId, text) => {
  const { data, error } = await supabase.from('comments').insert([{ event_id: eventId, user_id: userId, text }]).select('*, profiles(username, avatar_url)').single()
  if (error) throw error
  return data
}
