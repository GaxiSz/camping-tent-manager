<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

/* ---- AUTH (Supabase) ---- */
import { signIn, signOut, onAuthChange, getSession } from './auth'

/* ---- CLOUD ADAPTER (Supabase tables) ---- */
import {
  listUnits,
  createUnitCloud,
  updateUnitCloud,
  deleteUnitCloud,
  listActiveBookings,
  createBookingCloud,
  extendBookingCloud,
  freeUnitCloud
} from './adapters/cloudAdapter'

/* ---- DATE UTILS ---- */
import { ymd, todayAt, cmpYmd, addDays } from './utils/date'

/* ---- SUPABASE CLIENT (for Realtime) ---- */
import { supabase, TENANT_ID } from './lib/supabaseClient'

/* ============ AUTH STATE ============ */
const session = ref(null)
const email = ref('')
const password = ref('')
const authError = ref('')

async function doLogin() {
  authError.value = ''
  try {
    await signIn(email.value, password.value)
  } catch (e) {
    authError.value = e?.message || 'Login failed'
  }
}
async function doLogout() {
  try {
    await signOut()
  } catch (e) {
    console.error('Logout error', e)
  } finally {
    // reset local state immediately, don’t wait for onAuthChange
    session.value = null
    units.value = []
    activeBookings.value = []
    if (channel) {
      supabase.removeChannel(channel)
      channel = null
    }
  }
}


/* ============ CLOUD DATA STATE ============ */
const units = ref([])
const activeBookings = ref([])

async function reloadCloud() {
  units.value = await listUnits()
  activeBookings.value = await listActiveBookings()
}

/* ============ DERIVED / UI STATE ============ */
const today = ref(ymd())
const activeTab = ref('available')

function activeByUnitId(unitId) {
  return activeBookings.value.find(b => b.unit_id === unitId) || null
}

function unitStatus(u) {
  const b = activeByUnitId(u.id)
  if (!b) return { status: 'available', color: null, booking: null }
  const cmp = cmpYmd(b.end_date, today.value)
  const color = (cmp === 0) ? 'yellow' : (cmp > 0 ? 'red' : null)
  return { status: 'booked', color, booking: b }
}

const availableUnits = computed(() =>
  units.value.filter(u => !u.is_deleted && !activeByUnitId(u.id))
)
const bookedUnits = computed(() =>
  units.value.filter(u => !u.is_deleted && !!activeByUnitId(u.id))
)

/* ============ CRUD: UNITS ============ */
const unitType = ref('tent')
const unitName = ref('')
const editingId = ref(null)
const editName = ref('')

function startEdit(u) {
  editingId.value = u.id
  editName.value = u.name
}

async function addUnit() {
  if (!unitName.value.trim()) return
  await createUnitCloud({ type: unitType.value, name: unitName.value.trim() })
  unitName.value = ''
  await reloadCloud()
}

async function saveEdit(u) {
  if (!editName.value.trim()) return
  await updateUnitCloud(u.id, { name: editName.value.trim() })
  editingId.value = null
  editName.value = ''
  await reloadCloud()
}

async function removeUnit(u) {
  if (confirm(`Delete "${u.name}"?`)) {
    await deleteUnitCloud(u.id)
    await reloadCloud()
  }
}

/* ============ BOOKING MODAL ============ */
const showModal = ref(false)
const modalMode = ref('new')
const modalUnit = ref(null)
const guestName = ref('')
const endDate = ref(ymd())
const daysQuick = [1, 3, 5, 7, 10, 14]

function openNewBooking(u) {
  modalMode.value = 'new'
  modalUnit.value = u
  guestName.value = ''
  endDate.value = ymd()
  showModal.value = true
}

function openManageBooking(u) {
  modalMode.value = 'manage'
  modalUnit.value = u
  const b = activeByUnitId(u.id)
  guestName.value = b?.guest_name ?? ''
  endDate.value = b?.end_date ?? ymd()
  showModal.value = true
}

function closeModal() { showModal.value = false }
function addDaysQuick(n) { endDate.value = addDays(endDate.value, n) }

async function saveNewBooking() {
  if (!modalUnit.value) return
  if (!guestName.value.trim()) { alert('Please enter guest name'); return }
  try {
    await createBookingCloud({
      unitId: modalUnit.value.id,
      guestName: guestName.value.trim(),
      startDate: ymd(),
      endDate: endDate.value
    })
    closeModal()
    activeTab.value = 'booked'
    await reloadCloud()
  } catch (e) {
    alert(e.message || 'Error while booking')
  }
}

async function extendCurrent() {
  const b = activeByUnitId(modalUnit.value.id)
  if (!b) return
  await extendBookingCloud(b.id, endDate.value)
  closeModal()
  await reloadCloud()
}

async function makeAvailable(u) {
  await freeUnitCloud(u.id)
  await reloadCloud()
}

/* ============ AUTO-FREE 13:00 (client-side) ============ */
function enforceAutoFree() {
  const now = new Date()
  const threshold = todayAt(13, 0)
  if (now >= threshold) {
    const toFree = bookedUnits.value
      .map(u => ({ u, b: activeByUnitId(u.id) }))
      .filter(({ b }) => b && b.end_date === today.value)
    if (toFree.length > 0) {
      Promise.all(toFree.map(({ u }) => freeUnitCloud(u.id)))
        .then(reloadCloud)
        .catch(() => {})
    }
  }
}

let tHandle = null
let channel = null

/* ============ MOUNT / UNMOUNT ============ */
onMounted(async () => {
  const s = await getSession()
  session.value = s

  onAuthChange((sess) => {
    session.value = sess
    if (sess) {
      reloadCloud()
      subscribeRealtime()
    } else {
      units.value = []
      activeBookings.value = []
      if (channel) { supabase.removeChannel(channel); channel = null }
    }
  })

  if (session.value) {
    await reloadCloud()
    subscribeRealtime()
  }

  enforceAutoFree()
  tHandle = setInterval(enforceAutoFree, 60 * 1000)
})

onBeforeUnmount(() => {
  if (channel) supabase.removeChannel(channel)
  clearInterval(tHandle)
})

/* ============ REALTIME SUBSCRIPTION ============ */
function subscribeRealtime() {
  if (channel) supabase.removeChannel(channel)
  channel = supabase
    .channel('realtime-tents')
    // UNITS
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'units', filter: `tenant_id=eq.${TENANT_ID}` },
      () => reloadCloud()
    )
    // BOOKINGS
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'bookings', filter: `tenant_id=eq.${TENANT_ID}` },
      () => reloadCloud()
    )
    .subscribe()
}
</script>

<template>
  <div class="app">
    <aside>
      <h1>Offline Tent Manager</h1>

      <!-- LOGIN -->
      <div v-if="!session" class="card stack">
        <h2>Login</h2>
        <input v-model="email" placeholder="email" />
        <input v-model="password" type="password" placeholder="password" />
        <button class="btn primary" @click="doLogin">Sign in</button>
        <div class="muted" v-if="authError">{{ authError }}</div>
        <div class="muted">Accedi per attivare la sincronizzazione cloud.</div>
      </div>

      <div v-else class="card stack">
        <div>Logged in</div>
        <button class="btn" @click="doLogout">Sign out</button>
      </div>

      <!-- CREATE UNIT -->
      <div v-if="session" class="card stack">
        <h2>Create a tent / spot</h2>
        <label>Type</label>
        <select v-model="unitType">
          <option value="tent">Tent</option>
          <option value="spot">Free spot</option>
        </select>
        <label>Name</label>
        <input v-model="unitName" placeholder="e.g. Tent 1 or Spot A" @keyup.enter="addUnit" />
        <button class="btn primary" @click="addUnit">Create</button>
      </div>

      <!-- LIST UNITS -->
      <div v-if="session" class="card stack">
        <h2>Units</h2>
        <div v-if="units.length === 0" class="muted">No units yet.</div>
        <div v-for="u in units" :key="u.id" class="row" style="justify-content:space-between">
          <div>
            <strong>{{ u.name }}</strong>
            <span class="muted">· {{ u.type }}</span>
          </div>
          <div class="row">
            <template v-if="editingId === u.id">
              <input v-model="editName" style="width:140px" />
              <button class="btn small" @click="saveEdit(u)">Save</button>
              <button class="btn small ghost" @click="editingId=null">Cancel</button>
            </template>
            <template v-else>
              <button class="btn small" @click="startEdit(u)">Edit</button>
              <button class="btn small ghost" @click="removeUnit(u)">Delete</button>
            </template>
          </div>
        </div>
      </div>
    </aside>

    <main v-if="session">
      <div class="row tabs">
        <button class="tab" :class="{active: activeTab==='available'}" @click="activeTab='available'">Available</button>
        <button class="tab" :class="{active: activeTab==='booked'}" @click="activeTab='booked'">Booked</button>
        <div class="right muted">Today: {{ today }}</div>
      </div>

      <!-- AVAILABLE -->
      <div v-if="activeTab==='available'" class="card">
        <div class="legend muted">Tap a unit to book</div>
        <div class="grid">
          <div v-for="u in availableUnits" :key="u.id" class="unit" @click="openNewBooking(u)">
            <span>{{ u.name }}</span>
            <span class="badge">{{ u.type }}</span>
          </div>
        </div>
      </div>

      <!-- BOOKED -->
      <div v-else class="card">
        <div class="legend muted">
          <span class="dot yellow"></span> Ends today
          <span class="dot red" style="margin-left:12px;"></span> Ends after today
        </div>
        <div class="grid">
          <div
            v-for="u in bookedUnits"
            :key="u.id"
            class="unit booked"
            :class="unitStatus(u).color"
            @click="openManageBooking(u)"
          >
            <template v-if="unitStatus(u).booking">
              <div style="text-align:center">
                <div>{{ u.name }}</div>
                <div class="muted" style="font-size:12px">
                  {{ unitStatus(u).booking.guest_name }} · until {{ unitStatus(u).booking.end_date }}
                </div>
              </div>
              <span class="badge">Booked</span>
            </template>
          </div>
        </div>
      </div>

      <!-- MODAL -->
      <div v-if="showModal" class="modal-backdrop" @click.self="closeModal">
        <div class="modal" role="dialog" aria-modal="true">
          <header>
            <template v-if="modalMode==='new'">
              Book {{ modalUnit?.name }}
            </template>
            <template v-else>
              Manage booking — {{ modalUnit?.name }}
            </template>
          </header>
          <section class="stack">
            <div class="row" v-if="modalMode==='new'">
              <div style="flex:1">
                <label>Guest name</label>
                <input v-model="guestName" placeholder="Name and/or phone" />
              </div>
            </div>
            <div>
              <label>End date</label>
              <input type="date" v-model="endDate" :min="ymd()" />
            </div>
            <div class="chip-row">
              <div class="chip" v-for="n in daysQuick" :key="n" @click="addDaysQuick(n)">+{{ n }} day{{ n>1?'s':'' }}</div>
            </div>
          </section>
          <footer>
            <button class="btn ghost" @click="closeModal">Cancel</button>
            <template v-if="modalMode==='new'">
              <button class="btn primary" @click="saveNewBooking">Save booking</button>
            </template>
            <template v-else>
              <button class="btn" @click="makeAvailable(modalUnit)">Make available</button>
              <button class="btn primary" @click="extendCurrent">Extend</button>
            </template>
          </footer>
        </div>
      </div>
    </main>

    <main v-else class="card" style="margin:16px">
      <div>Effettua il login per usare il cloud sync.</div>
    </main>
  </div>
</template>

<style scoped>
/* usa gli stili globali già presenti */
</style>
