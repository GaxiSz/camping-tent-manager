import { supabase, TENANT_ID } from '../lib/supabaseClient'

const nowISO = () => new Date().toISOString()

export async function listUnits() {
  const { data, error } = await supabase
    .from('units')
    .select('*')
    .eq('tenant_id', TENANT_ID)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function createUnitCloud({ type, name }) {
  const { error } = await supabase.from('units').insert([{
    tenant_id: TENANT_ID, type, name, updated_at: nowISO()
  }])
  if (error) throw error
}

export async function updateUnitCloud(id, patch) {
  const { error } = await supabase
    .from('units')
    .update({ ...patch, updated_at: nowISO() })
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)
  if (error) throw error
}

export async function deleteUnitCloud(id) {
  const { error } = await supabase
    .from('units')
    .update({ is_deleted: true, updated_at: nowISO() })
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)
  if (error) throw error
}

export async function listActiveBookings() {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('tenant_id', TENANT_ID)
    .eq('is_active', true)
  if (error) throw error
  return data
}

export async function createBookingCloud({ unitId, guestName, startDate, endDate }) {
  const { error } = await supabase.from('bookings').insert([{
    tenant_id: TENANT_ID,
    unit_id: unitId,
    guest_name: guestName,
    start_date: startDate,
    end_date: endDate,
    is_active: true,
    updated_at: nowISO()
  }])
  if (error) {
    // 23505 = unique_violation (doppio booking su quell'unità)
    if (error.code === '23505') throw new Error('Questa tenda è già prenotata.')
    throw error
  }
}

export async function extendBookingCloud(bookingId, newEndDate) {
  const { error } = await supabase
    .from('bookings')
    .update({ end_date: newEndDate, updated_at: nowISO() })
    .eq('id', bookingId)
    .eq('tenant_id', TENANT_ID)
    .eq('is_active', true)
  if (error) throw error
}

export async function freeUnitCloud(unitId) {
  const { error } = await supabase
    .from('bookings')
    .update({ is_active: false, updated_at: nowISO() })
    .eq('unit_id', unitId)
    .eq('tenant_id', TENANT_ID)
    .eq('is_active', true)
  if (error) throw error
}
