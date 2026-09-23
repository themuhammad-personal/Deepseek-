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

declare global {
  interface Window {
    AndroidBridge?: {
      dsLoginNative?: (payloadJson: string, callbackId: string) => void
      dsChatNative?: (payloadJson: string, callbackId: string) => void
      onOfficialToken?: (token: string) => void
      getOfficialToken?: () => string | null
      switchToOfficialLogin?: () => void
    }
    _dsLoginCallbacks?: Record<string, { resolve: (v: any) => void; reject: (e: string) => void }>
  }
}

// Listen for official token from Android official WebView
if (typeof window !== 'undefined') {
  window.addEventListener('sds:official-token', ((e: CustomEvent) => {
    const token = (e.detail as any)?.token
    if (token && token.length > 20) {
      console.log('[Official] Token received via event, length:', token.length)
      // Dispatch to store if available
      try {
        const w = window as any
        if (w.useAppStore?.getState) {
          w.useAppStore.getState().setAccount({ token, email: '', mobile: '' })
        }
      } catch {}
    }
  }) as EventListener)

  // Also check if AndroidBridge already has token on load
  const checkOfficialToken = () => {
    try {
      const bridge = (window as any).AndroidBridge
      if (bridge?.getOfficialToken) {
        const t = bridge.getOfficialToken()
        if (t && t.length > 20) {
          console.log('[Official] Found saved token on startup')
          const w = window as any
          if (w.useAppStore?.getState) {
            const acc = w.useAppStore.getState().account
            if (!acc?.token || acc.token.length < 20) {
              w.useAppStore.getState().setAccount({ token: t, email: '', mobile: '' })
            }
          }
        }
      }
    } catch {}
  }
  if (document.readyState === 'complete') checkOfficialToken()
  else window.addEventListener('load', () => setTimeout(checkOfficialToken, 1000))
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
    
    const timer = setTimeout(() => {
      delete window._dsLoginCallbacks![callbackId]
      reject('WAF challenge solving... Please wait 5 sec and retry')
    }, 15000)

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

// Retry wrapper for WAF
async function dsLoginViaNativeWithRetry(body: DsLoginBody, retries = 2): Promise<{ token: string; email: string; mobile: string }> {
  let lastErr: any
  for (let i = 0; i <= retries; i++) {
    try {
      if (i > 0) {
        console.log(`[Login] Retry ${i}/${retries} after WAF wait...`)
        await new Promise(r => setTimeout(r, 3000 + i * 1000))
      }
      const res = await dsLoginViaNative(body)
      return res
    } catch (e) {
      lastErr = e
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('WAF') && i < retries) {
        console.log(`[Login] WAF detected, will retry ${i+1}/${retries}`)
        continue
      }
      throw e
    }
  }
  throw lastErr
}

export async function dsLoginDirect(body: DsLoginBody) {
  if (typeof window !== 'undefined' && (window as any).AndroidBridge?.dsLoginNative) {
    try {
      console.log('[Login] Trying native bridge with retry...')
      const nativeRes = await dsLoginViaNativeWithRetry(body, 2)
      if (nativeRes.token) {
        console.log('[Login] Native bridge SUCCESS')
        return nativeRes
      }
    } catch (e) {
      console.warn('[Login] Native bridge failed:', e)
      throw e
    }
  }

  const payload = {
    email: body.email?.trim() || null,
    mobile: body.mobile?.trim() || null,
    password: body.password,
    area_code: body.area_code || '+880',
    device_id: newDeviceId(),
    os: 'web',
  }
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
