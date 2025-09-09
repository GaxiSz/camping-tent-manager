import { supabase } from './lib/supabaseClient'

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.session
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}


export function onAuthChange(cb) {
  return supabase.auth.onAuthStateChange((_event, session) => cb(session))
}

export async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}
