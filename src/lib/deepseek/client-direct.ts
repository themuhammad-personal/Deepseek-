import { DS_API, dsHeaders, newDeviceId } from './headers'
import { solvePow, type PowChallenge } from './pow-browser'

export type DsLoginBody = {
  email?: string
  mobile?: string
  password: string
  area_code?: string
}

type Envelope<T> = {
  code?: number
  msg?: string
  data?: {
    biz_code?: number
    biz_msg?: string
    biz_data?: T
  }
}

function unwrap<T>(json: Envelope<T>, fallback: string): T {
  const biz = json.data
  if (biz && biz.biz_code && biz.biz_code !== 0) {
    throw new Error(biz.biz_msg || fallback)
  }
  if (!biz?.biz_data) throw new Error(json.msg || fallback)
  return biz.biz_data
}

// ── Native Android Bridge for official DeepSeek login (bypass CORS + WAF) ──
declare global {
  interface Window {
    AndroidBridge?: {
      dsLoginNative?: (payloadJson: string, callbackId: string) => void
      dsChatNative?: (payloadJson: string, callbackId: string) => void
    }
    _dsLoginCallbacks?: Record<string, { resolve: (v: any) => void; reject: (e: string) => void }>
  }
}

function dsLoginViaNative(body: DsLoginBody): Promise<{ token: string; email: string; mobile: string }> {
  return new Promise((resolve, reject) => {
    const bridge = (window as any).AndroidBridge
    if (!bridge || typeof bridge.dsLoginNative !== 'function') {
      reject('Native bridge not available')
      return
    }
    const callbackId = Math.random().toString(36).slice(2) + Date.now().toString(36)
    window._dsLoginCallbacks = window._dsLoginCallbacks || {}
    
    // Timeout after 30s
    const timer = setTimeout(() => {
      delete window._dsLoginCallbacks![callbackId]
      reject('Login timeout - WAF challenge solving, please wait and retry')
    }, 30000)

    window._dsLoginCallbacks[callbackId] = {
      resolve: (data: any) => {
        clearTimeout(timer)
        resolve(data)
      },
      reject: (err: string) => {
        clearTimeout(timer)
        reject(err)
      }
    }

    const payload = {
      email: body.email?.trim() || undefined,
      mobile: body.mobile?.trim() || undefined,
      area_code: body.area_code || '+880',
      password: body.password
    }

    try {
      console.log('[NativeLogin] Calling AndroidBridge.dsLoginNative', payload.email || payload.mobile)
      bridge.dsLoginNative(JSON.stringify(payload), callbackId)
    } catch (e) {
      clearTimeout(timer)
      delete window._dsLoginCallbacks![callbackId]
      reject((e as Error).message || 'Native call failed')
    }
  })
}

export async function dsLoginDirect(body: DsLoginBody) {
  // 1. Try native Android bridge first (official, bypasses CORS + WAF via hidden WebView cookies)
  if (typeof window !== 'undefined' && (window as any).AndroidBridge?.dsLoginNative) {
    try {
      console.log('[Login] Trying native bridge...')
      const nativeRes = await dsLoginViaNative(body)
      if (nativeRes.token) {
        console.log('[Login] Native bridge SUCCESS')
        return nativeRes
      }
    } catch (e) {
      console.warn('[Login] Native bridge failed, falling back to fetch:', e)
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('WAF') || msg.includes('wait')) {
        throw new Error(msg)
      }
    }
  }

  // 2. Try direct fetch (will fail on Android due to CORS/WAF, but works on web)
  const payload = {
    email: body.email?.trim() || null,
    mobile: body.mobile?.trim() || null,
    password: body.password,
    area_code: body.area_code || '+880',
    device_id: newDeviceId(),
    os: 'web',
  }
  try {
    const res = await fetch(`${DS_API}/users/login`, {
      method: 'POST',
      headers: dsHeaders(),
      body: JSON.stringify(payload),
    })
    const json = (await res.json()) as Envelope<{
      user?: { token?: string; email?: string; mobile?: string; id?: string }
      token?: string
    }>
    if (!res.ok) throw new Error(`Login failed (${res.status})`)
    const data = unwrap(json, 'Email or password is incorrect.')
    const user = (data.user ?? data) as {
      token?: string
      email?: string
      mobile?: string
    }
    const token = user.token || (data as any).token
    if (!token) throw new Error('DeepSeek did not return a session.')
    return {
      token,
      email: user.email || body.email || '',
      mobile: user.mobile || body.mobile || '',
    }
  } catch (fetchErr) {
    const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      throw new Error('Network blocked by WAF. Please wait 5 seconds for hidden WebView to solve challenge and retry. If persists, restart app.')
    }
    throw fetchErr
  }
}

export async function dsCreateSessionDirect(token: string): Promise<string> {
  const res = await fetch(`${DS_API}/chat_session/create`, {
    method: 'POST',
    headers: dsHeaders(token),
    body: '{}',
  })
  const json = (await res.json()) as Envelope<{ chat_session?: { id?: string } }>
  const data = unwrap(json, 'Could not start a chat.')
  const id = data.chat_session?.id
  if (!id) throw new Error('Could not start a chat.')
  return id
}

async function dsPowHeaderDirect(token: string, targetPath = '/api/v0/chat/completion'): Promise<string> {
  const res = await fetch(`${DS_API}/chat/create_pow_challenge`, {
    method: 'POST',
    headers: dsHeaders(token),
    body: JSON.stringify({ target_path: targetPath }),
  })
  const json = (await res.json()) as Envelope<{ challenge?: PowChallenge }>
  const data = unwrap(json, 'PoW challenge failed.')
  if (!data.challenge) throw new Error('PoW challenge missing.')
  return solvePow(data.challenge)
}

export async function dsCompleteStreamDirect(opts: {
  token: string
  sessionId: string
  prompt: string
  thinking: boolean
  search: boolean
  parentMessageId?: string | null
  signal?: AbortSignal
}): Promise<Response> {
  const pow = await dsPowHeaderDirect(opts.token)
  const upstream = await fetch(`${DS_API}/chat/completion`, {
    method: 'POST',
    headers: dsHeaders(opts.token, { 'X-Ds-Pow-Response': pow }),
    body: JSON.stringify({
      chat_session_id: opts.sessionId,
      parent_message_id: opts.parentMessageId ?? null,
      prompt: opts.prompt,
      ref_file_ids: [],
      thinking_enabled: opts.thinking,
      search_enabled: opts.search,
      preempt: false,
    }),
    signal: opts.signal,
  })
  return upstream
}
