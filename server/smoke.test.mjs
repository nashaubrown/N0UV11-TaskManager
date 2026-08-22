const API = 'http://localhost:4000/api'
let pass = 0, fail = 0
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok  ${name}`) }
  else { fail++; console.log(`FAIL  ${name} ${extra}`) }
}
const j = async (method, path, body, token, raw) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(raw ? { 'content-type': raw.type } : body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: raw ? raw.data : body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data; try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, data }
}

// --- auth ---
const login = await j('POST', '/auth/login', { email: 'nashaubrown@gmail.com', password: 'nouvii123' })
check('login', login.status === 200 && login.data.accessToken, JSON.stringify(login.data).slice(0, 200))
const T = login.data.accessToken
const me = await j('GET', '/auth/me', null, T)
check('me', me.status === 200 && me.data.role === 'owner')
const badLogin = await j('POST', '/auth/login', { email: 'nashaubrown@gmail.com', password: 'wrong' })
check('bad login → 401', badLogin.status === 401)
const noAuth = await j('GET', '/tasks')
check('no token → 401', noAuth.status === 401)
const refreshed = await j('POST', '/auth/refresh', { refreshToken: login.data.refreshToken })
check('refresh rotation', refreshed.status === 200 && refreshed.data.accessToken)
const reuse = await j('POST', '/auth/refresh', { refreshToken: login.data.refreshToken })
check('reused refresh → 401', reuse.status === 401)

// --- websocket: subscribe before mutations ---
const { default: WebSocket } = await import('ws')
const events = []
const ws = new WebSocket(`ws://localhost:4000/ws?token=${T}`)
await new Promise((r) => ws.on('open', r))
ws.on('message', (m) => events.push(JSON.parse(m.toString())))

// --- projects & tasks ---
const projects = await j('GET', '/projects', null, T)
check('list projects', projects.status === 200 && projects.data.items.length === 3 && projects.data.items[0].taskCount >= 0)
const pid = projects.data.items.find((p) => p.name === 'Café Aroma Launch').id

const newTask = await j('POST', '/tasks', { title: 'Smoke test task', priority: 'high', projectId: pid, dueAt: new Date(Date.now() + 86400000).toISOString() }, T)
check('create task', newTask.status === 201 && newTask.data.title === 'Smoke test task')
const search = await j('GET', '/tasks?q=smoke', null, T)
check('search tasks', search.status === 200 && search.data.items.length === 1)
const filtered = await j('GET', '/tasks?status=in_review', null, T)
check('filter by status', filtered.status === 200 && filtered.data.items.every((t) => t.status === 'in_review'))
const patched = await j('PATCH', `/tasks/${newTask.data.id}`, { status: 'completed' }, T)
check('update task → completed', patched.status === 200 && patched.data.status === 'completed')
const badTask = await j('POST', '/tasks', { title: '' }, T)
check('validation → 422', badTask.status === 422)

const taskComment = await j('POST', `/tasks/${newTask.data.id}/comments`, { body: 'Smoke comment' }, T)
check('task comment', taskComment.status === 201)
const comments = await j('GET', `/tasks/${newTask.data.id}/comments`, null, T)
check('read comments', comments.status === 200 && comments.data.items.length === 1)

// --- merchants ---
const merchants = await j('GET', '/merchants', null, T)
check('merchants with counts', merchants.status === 200 && merchants.data.items.length === 4)
const mid = merchants.data.items[0].id

// --- photo upload flow: presign → PUT → register ---
const presign = await j('POST', '/uploads/presign', { fileName: 'test.png', contentType: 'image/png', sizeBytes: 100 }, T)
check('presign', presign.status === 200 && presign.data.uploadUrl)
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC', 'base64')
const putRes = await fetch(`http://localhost:4000${presign.data.uploadUrl}`, {
  method: 'PUT', headers: { 'content-type': 'image/png', authorization: `Bearer ${T}` }, body: png,
})
check('PUT bytes (local driver)', putRes.status === 201)
const photo = await j('POST', '/photos', {
  s3Key: presign.data.key, title: 'Smoke photo', contentType: 'image/png', sizeBytes: png.length,
  projectId: pid, merchantId: mid,
}, T)
check('register photo', photo.status === 201 && photo.data.merchantId === mid)
const served = await fetch(`http://localhost:4000${photo.data.url}`)
check('serve photo bytes', served.status === 200 && (await served.arrayBuffer()).byteLength === png.length)
const photoSearch = await j('GET', `/photos?merchantId=${mid}`, null, T)
check('filter photos by merchant', photoSearch.status === 200 && photoSearch.data.items.length === 1)
await j('POST', `/photos/${photo.data.id}/tags`, { tag: 'storefront' }, T)
const tagSearch = await j('GET', '/photos?q=storefront', null, T)
check('search photos by tag', tagSearch.data.items.length === 1)

// --- approvals: 2-step flow ---
const approval = await j('POST', `/approvals/photos/${photo.data.id}`, {
  steps: [{ name: 'Internal QC' }, { name: 'Client sign-off' }],
}, T)
check('create approval', approval.status === 201 && approval.data.steps.length === 2 && approval.data.currentStep === 1)
const step1 = await j('POST', `/approvals/${approval.data.id}/decisions`, { action: 'approve', feedback: 'QC pass' }, T)
check('approve step 1 → advances', step1.status === 201 && step1.data.currentStep === 2 && step1.data.status === 'in_review')
const step2 = await j('POST', `/approvals/${approval.data.id}/decisions`, { action: 'approve' }, T)
check('approve step 2 → approved', step2.data.status === 'approved')
const again = await j('POST', `/approvals/${approval.data.id}/decisions`, { action: 'approve' }, T)
check('decide on resolved → 400', again.status === 400)
const photoAfter = await j('GET', `/photos/${photo.data.id}`, null, T)
check('photo shows approvalStatus', photoAfter.data.approvalStatus === 'approved')

// --- CRM ---
const contact = await j('POST', '/contacts', { fullName: 'Ahmed Manager', company: 'Café Aroma' }, T)
check('create contact', contact.status === 201)
const deal = await j('POST', '/deals', { name: 'Café Aroma expansion', stage: 'proposal', valueCents: 250000, contactId: contact.data.id }, T)
check('create deal', deal.status === 201 && deal.data.contact.fullName === 'Ahmed Manager')
const dealMove = await j('PATCH', `/deals/${deal.data.id}`, { stage: 'closed_won' }, T)
check('move deal stage', dealMove.data.stage === 'closed_won')

// --- org / permissions / audit ---
const invite = await j('POST', '/org/members', { email: 'viewer@nouvii.app', fullName: 'View Only', role: 'viewer' }, T)
check('invite member', invite.status === 201 && invite.data.tempPassword)
const viewerLogin = await j('POST', '/auth/login', { email: 'viewer@nouvii.app', password: invite.data.tempPassword })
check('viewer login', viewerLogin.status === 200)
const viewerCreate = await j('POST', '/tasks', { title: 'Should be denied' }, viewerLogin.data.accessToken)
check('viewer create task → 403', viewerCreate.status === 403)
const viewerAudit = await j('GET', '/org/audit', null, viewerLogin.data.accessToken)
check('viewer audit → 403', viewerAudit.status === 403)
const audit = await j('GET', '/org/audit', null, T)
check('audit log populated', audit.status === 200 && audit.data.items.some((a) => a.action === 'approval.approve'))

// --- calendar (unconfigured → clean degradation) ---
const cal = await j('GET', '/calendar/status', null, T)
check('calendar status (unconfigured)', cal.status === 200 && cal.data.configured === false)

// --- websocket events arrived ---
await new Promise((r) => setTimeout(r, 500))
ws.close()
const types = new Set(events.map((e) => e.type))
check('WS: task.created', types.has('task.created'))
check('WS: photo.created', types.has('photo.created'))
check('WS: approval.updated', types.has('approval.updated'))
check('WS: presence.changed', types.has('presence.changed'))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
