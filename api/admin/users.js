import { listUsers, createUser, deleteUser, getSession } from '../../lib/auth.js'

export const config = { runtime: 'edge' }

// Super-admin only. GET = list users · POST = invite (create) · DELETE = remove.
export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': req.headers.get('origin') || '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

  const session = await getSession(req)
  if (!session || session.role !== 'super_admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors })
  }

  try {
    if (req.method === 'GET') {
      return new Response(JSON.stringify({ users: await listUsers() }), { status: 200, headers: cors })
    }

    if (req.method === 'POST') {
      const { email, password } = (await req.json().catch(() => ({})))
      const user = await createUser({ email, password, role: 'user', createdBy: session.email })
      return new Response(JSON.stringify({ ok: true, user }), { status: 200, headers: cors })
    }

    if (req.method === 'DELETE') {
      const { email } = (await req.json().catch(() => ({})))
      if (!email) return new Response(JSON.stringify({ error: 'Email required' }), { status: 400, headers: cors })
      if (String(email).toLowerCase().trim() === session.email) {
        return new Response(JSON.stringify({ error: "You can't remove your own account." }), { status: 400, headers: cors })
      }
      await deleteUser(email)
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors })
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: cors })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || 'Request failed' }), { status: 400, headers: cors })
  }
}
