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
    _dsChatCallbacks?: Record<string, { 
      onSession?: (sid: string) => void
      onChunk?: (data: any) => void
      onDone?: (data: any) => void
      onError?: (err: any) => void
      onNeedPow?: (challenge: any) => void
    }>
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
  // Try native first (official WebView bypass WAF)
  if (typeof window !== 'undefined' && (window as any).AndroidBridge?.dsChatNative) {
    try {
      console.log('[Session] Trying native official WebView...')
      // Use chat native with empty prompt to just create session
      const session = await dsCreateSessionViaNative(token)
      if (session) return session
    } catch (e) {
      console.warn('[Session] Native failed, fallback to direct', e)
    }
  }
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

function dsCreateSessionViaNative(token: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const bridge = (window as any).AndroidBridge
    if (!bridge?.dsChatNative) {
      reject('No native bridge')
      return
    }
    const callbackId = Math.random().toString(36).slice(2) + Date.now().toString(36)
    window._dsChatCallbacks = window._dsChatCallbacks || {}
    let resolved = false
    const timer = setTimeout(() => {
      if (!resolved) {
        delete window._dsChatCallbacks![callbackId]
        reject('Session create timeout')
      }
    }, 20000)

    window._dsChatCallbacks[callbackId] = {
      onSession: (sid: string) => {
        if (!resolved) {
          resolved = true
          clearTimeout(timer)
          delete window._dsChatCallbacks![callbackId]
          resolve(sid)
        }
      },
      onChunk: () => {},
      onDone: (data: any) => {
        if (!resolved) {
          resolved = true
          clearTimeout(timer)
          delete window._dsChatCallbacks![callbackId]
          if (data?.sessionId) resolve(data.sessionId)
          else reject('No session in done')
        }
      },
      onError: (err: any) => {
        if (!resolved) {
          resolved = true
          clearTimeout(timer)
          delete window._dsChatCallbacks![callbackId]
          reject(err?.error || err || 'Session error')
        }
      },
      onNeedPow: async (challenge: any) => {
        // Solve PoW via browser wasm
        try {
          const pow = await solvePow(challenge)
          // Now we need to continue - but our current native flow expects PoW solved inside WebView
          // For session creation, PoW not needed, so this shouldn't happen
          // If it does, we fallback
          console.log('[Session] PoW needed but not expected for session create')
        } catch (e) {
          if (!resolved) {
            resolved = true
            clearTimeout(timer)
            delete window._dsChatCallbacks![callbackId]
            reject(e)
          }
        }
      }
    }

    try {
      // For session creation, we send empty prompt but with flag
      bridge.dsChatNative(JSON.stringify({ token, prompt: '', thinking: false, search: false, _action: 'create_session' }), callbackId)
    } catch (e) {
      clearTimeout(timer)
      delete window._dsChatCallbacks![callbackId]
      reject(e)
    }
  })
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
  // Try native official WebView first (bypass WAF)
  if (typeof window !== 'undefined' && (window as any).AndroidBridge?.dsChatNative) {
    try {
      console.log('[Chat] Trying native official WebView streaming...')
      const nativeRes = await dsCompleteStreamViaNative(opts)
      return nativeRes
    } catch (e) {
      console.warn('[Chat] Native streaming failed, fallback to direct fetch', e)
      // Fall through to direct fetch
    }
  }

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

function dsCompleteStreamViaNative(opts: {
  token: string
  sessionId: string
  prompt: string
  thinking: boolean
  search: boolean
  parentMessageId?: string | null
  signal?: AbortSignal
}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const bridge = (window as any).AndroidBridge
    if (!bridge?.dsChatNative) {
      reject('No native bridge')
      return
    }
    const callbackId = Math.random().toString(36).slice(2) + Date.now().toString(36)
    window._dsChatCallbacks = window._dsChatCallbacks || {}

    // Create a ReadableStream that will be fed by native callbacks
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null
    let sessionIdFromNative: string | null = null
    let textAcc = ''
    let thinkingAcc = ''
    const encoder = new TextEncoder()

    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c
        // Send initial session if we already have it
        if (opts.sessionId) {
          const init = JSON.stringify({ type: 'session', sessionId: opts.sessionId })
          c.enqueue(encoder.encode(`data: ${init}\n\n`))
        }
      },
      cancel() {
        // Cleanup
        delete window._dsChatCallbacks![callbackId]
      }
    })

    // Create a Response with our stream
    const response = new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream' }
    })

    const cleanup = () => {
      delete window._dsChatCallbacks![callbackId]
    }

    window._dsChatCallbacks[callbackId] = {
      onSession: (sid: string) => {
        sessionIdFromNative = sid
        console.log('[ChatNative] Session:', sid.slice(0,8))
        if (controller) {
          const data = JSON.stringify({ type: 'session', sessionId: sid })
          try { controller!.enqueue(encoder.encode(`data: ${data}\n\n`)) } catch {}
        }
      },
      onChunk: (data: any) => {
        if (!controller) return
        try {
          const text = data?.text || ''
          const thinking = data?.thinking || ''
          const deltaText = data?.deltaText || ''
          const deltaThinking = data?.deltaThinking || ''
          if (deltaText || deltaThinking || text !== textAcc || thinking !== thinkingAcc) {
            textAcc = text
            thinkingAcc = thinking
            const payload = JSON.stringify({ type: 'delta', text: textAcc, thinking: thinkingAcc })
            controller!.enqueue(encoder.encode(`data: ${payload}\n\n`))
          }
        } catch (e) {
          console.error('[ChatNative] onChunk error', e)
        }
      },
      onDone: (data: any) => {
        if (!controller) {
          cleanup()
          return
        }
        try {
          textAcc = data?.text || textAcc
          thinkingAcc = data?.thinking || thinkingAcc
          const final = JSON.stringify({ type: 'delta', text: textAcc, thinking: thinkingAcc })
          controller!.enqueue(encoder.encode(`data: ${final}\n\n`))
          const done = JSON.stringify({ type: 'done', sessionId: data?.sessionId || sessionIdFromNative || opts.sessionId })
          controller!.enqueue(encoder.encode(`data: ${done}\n\n`))
          controller!.enqueue(encoder.encode(`data: [DONE]\n\n`))
          controller!.close()
        } catch (e) {
          try { controller!.error(e) } catch {}
        } finally {
          cleanup()
        }
      },
      onError: (err: any) => {
        if (!controller) {
          cleanup()
          reject(err)
          return
        }
        try {
          const msg = typeof err === 'string' ? err : err?.error || err?.detail || JSON.stringify(err)
          console.error('[ChatNative] Error:', msg)
          let friendly = msg
          try {
            const parsed = typeof err === 'string' ? JSON.parse(err) : err
            if (parsed?.error) friendly = parsed.error
            if (parsed?.detail) friendly = parsed.detail
          } catch {}
          const errPayload = JSON.stringify({ type: 'error', error: friendly })
          controller!.enqueue(encoder.encode(`data: ${errPayload}\n\n`))
          controller!.close()
        } catch (e) {
          try { controller!.error(e) } catch {}
        } finally {
          cleanup()
        }
      },
      onNeedPow: async (challenge: any) => {
        console.log('[ChatNative] PoW needed, solving via wasm... challenge len', JSON.stringify(challenge).length)
        try {
          const pow = await solvePow(challenge)
          console.log('[ChatNative] PoW solved, sending to native onPowSolved', pow.slice(0,80))
          const bridge = (window as any).AndroidBridge
          if (bridge?.onPowSolved) {
            bridge.onPowSolved(callbackId, pow)
            return
          }
          if (bridge?.dsChatNative) {
            // Fallback old path: retry with powResponse
            console.log('[ChatNative] onPowSolved not available, fallback dsChatNative retry')
            const retryPayload = {
              token: opts.token,
              sessionId: opts.sessionId || sessionIdFromNative || '',
              prompt: opts.prompt,
              thinking: opts.thinking,
              search: opts.search,
              parentMessageId: opts.parentMessageId,
              powResponse: pow
            }
            bridge.dsChatNative(JSON.stringify(retryPayload), callbackId)
            return
          }
          throw new Error('No native bridge for PoW solve')
        } catch (e) {
          console.error('[ChatNative] PoW solve failed', e)
          window._dsChatCallbacks![callbackId]?.onError?.(e instanceof Error ? e.message : String(e))
        }
      }
    }

    try {
      bridge.dsChatNative(JSON.stringify({
        token: opts.token,
        sessionId: opts.sessionId,
        prompt: opts.prompt,
        thinking: opts.thinking,
        search: opts.search,
        parentMessageId: opts.parentMessageId
      }), callbackId)
      // Resolve immediately with our streaming Response
      resolve(response)
    } catch (e) {
      cleanup()
      reject(e)
    }

    // Handle abort
    if (opts.signal) {
      opts.signal.addEventListener('abort', () => {
        try {
          controller?.close()
        } catch {}
        cleanup()
      })
    }
  })
}
