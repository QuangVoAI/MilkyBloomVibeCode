import React, { useEffect, useMemo, useRef, useState } from 'react'
import { MessageCircle, Send, Sparkles, Trash2, X } from 'lucide-react'
import { socketService } from '@/services/socket.service'
import { getChatProviderStatus } from '@/services'

const STORAGE_KEY = 'milkybloom-chat-session-v2'
const PROVIDER_STORAGE_KEY = 'milkybloom-chat-provider-v1'
const MAX_HISTORY = 20

const WELCOME_MESSAGE = {
  role: 'assistant',
  content:
    'Xin chào, mình là trợ lý MilkyBloom. Bạn cần hỏi về sản phẩm, đơn hàng, vận chuyển, đổi trả hay chính sách nào?',
}

const QUICK_PROMPTS = [
  'Tôi muốn xem sản phẩm phù hợp cho bé 3 tuổi',
  'Phí ship và thời gian giao hàng thế nào?',
  'Tôi muốn kiểm tra trạng thái đơn hàng',
]

const getProviderLabel = (providerState) => {
  if (!providerState?.provider) return 'Loading...'

  switch (providerState.provider) {
    case 'remote':
      return 'Featherless'
    case 'agentic':
      return 'Agentic AI'
    case 'gemini':
      return 'Gemini'
    case 'auto':
      return 'Auto'
    default:
      return providerState.provider
  }
}

const getProviderDisplayName = (provider) => {
  switch (provider) {
    case 'agentic':
      return 'Agentic AI'
    case 'remote':
      return 'Featherless'
    case 'gemini':
      return 'Gemini'
    case 'auto':
      return 'Auto'
    default:
      return provider || 'Auto'
  }
}

const getChatPhaseLabel = (phase) => {
  switch (phase) {
    case 'connected':
      return 'Connected'
    case 'streaming':
      return 'Streaming'
    case 'done':
      return 'Done'
    case 'error':
      return 'Error'
    case 'offline':
      return 'Offline'
    default:
      return 'Idle'
  }
}

const getUserIdFromStorage = () => {
  try {
    const raw = localStorage.getItem('user')
    if (!raw) return ''
    const parsed = JSON.parse(raw)
    return parsed?.id || parsed?._id || ''
  } catch {
    return ''
  }
}

const ChatWidget = () => {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([WELCOME_MESSAGE])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [providerState, setProviderState] = useState(null)
  const [selectedProvider, setSelectedProvider] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const [chatPhase, setChatPhase] = useState('idle')
  const messagesRef = useRef(null)
  const assistantIndexRef = useRef(null)
  const streamingSessionIdRef = useRef('')

  const normalizeProviderChoice = (value) => {
    if (value === 'agentic' || value === 'remote' || value === 'auto') {
      return value
    }
    return 'agentic'
  }

  const effectiveProvider = normalizeProviderChoice(
    selectedProvider || 'agentic',
  )
  const providerLabel = useMemo(
    () => getProviderDisplayName(effectiveProvider),
    [effectiveProvider],
  )

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed.messages) && parsed.messages.length > 0) {
          setMessages(parsed.messages)
        }
        if (typeof parsed.open === 'boolean') {
          setOpen(parsed.open)
        }
      }
    } catch {
      // ignore invalid cache
    } finally {
      setHydrated(true)
    }

    try {
      const storedProvider = localStorage.getItem(PROVIDER_STORAGE_KEY)
      if (storedProvider) {
        setSelectedProvider(storedProvider === 'remote' ? 'agentic' : storedProvider)
      }
    } catch {
      // ignore storage read failures
    }

    ;(async () => {
      try {
        const response = await getChatProviderStatus()
        if (response?.success) {
          setProviderState(response.data)
          setSelectedProvider((current) => normalizeProviderChoice(current || 'agentic'))
        }
      } catch {
        setProviderState({ provider: 'unavailable' })
        setSelectedProvider((current) => normalizeProviderChoice(current || 'agentic'))
      }
    })()

    const userId = getUserIdFromStorage()
    socketService.connect(userId, { token: localStorage.getItem('authToken') || '' })

    const handleSocketConnect = () => {
      setChatPhase('connected')
    }

    const handleSocketDisconnect = () => {
      setChatPhase('offline')
    }

    const handleSocketReconnect = () => {
      setChatPhase('connected')
    }

    const handleSocketConnectError = () => {
      setChatPhase('offline')
    }

    const handleStatus = (data) => {
      if (data?.session_id && data.session_id !== streamingSessionIdRef.current) return
      if (data?.status === 'started' || data?.status === 'streaming') {
        setChatPhase('streaming')
      }
    }

    const handleToken = (data) => {
      if (data?.session_id && data.session_id !== streamingSessionIdRef.current) return
      const chunk = data?.content || ''
      if (!chunk || assistantIndexRef.current == null) return

      setMessages((current) => {
        const next = [...current]
        const target = next[assistantIndexRef.current]
        if (!target) return current
        next[assistantIndexRef.current] = {
          ...target,
          content: `${target.content || ''}${chunk}`,
        }
        return next
      })
    }

    const handleFinal = (data) => {
      if (data?.session_id && data.session_id !== streamingSessionIdRef.current) return
      if (assistantIndexRef.current == null) {
        setLoading(false)
        return
      }
      if (data?.reply) {
        setMessages((current) => {
          const next = [...current]
          const target = next[assistantIndexRef.current]
          if (!target) return current
          next[assistantIndexRef.current] = {
            ...target,
            content: data.reply,
          }
          return next
        })
      }
      setLoading(false)
      setChatPhase('done')
      streamingSessionIdRef.current = ''
      assistantIndexRef.current = null
    }

    const handleError = (data) => {
      if (data?.session_id && data.session_id !== streamingSessionIdRef.current) return
      const message = data?.message || 'Hệ thống chat tạm thời chưa sẵn sàng.'
      if (assistantIndexRef.current != null) {
        setMessages((current) => {
          const next = [...current]
          const target = next[assistantIndexRef.current]
          if (!target) return current
          next[assistantIndexRef.current] = { ...target, content: message }
          return next
        })
      }
      setLoading(false)
      setChatPhase('error')
      streamingSessionIdRef.current = ''
      assistantIndexRef.current = null
    }

    socketService.on('connect', handleSocketConnect)
    socketService.on('disconnect', handleSocketDisconnect)
    socketService.on('reconnect', handleSocketReconnect)
    socketService.on('connect_error', handleSocketConnectError)
    socketService.on('chat_token', handleToken)
    socketService.on('chat_final', handleFinal)
    socketService.on('chat_error', handleError)
    socketService.on('chat_status', handleStatus)

    return () => {
      socketService.off('connect', handleSocketConnect)
      socketService.off('disconnect', handleSocketDisconnect)
      socketService.off('reconnect', handleSocketReconnect)
      socketService.off('connect_error', handleSocketConnectError)
      socketService.off('chat_token', handleToken)
      socketService.off('chat_final', handleFinal)
      socketService.off('chat_error', handleError)
      socketService.off('chat_status', handleStatus)
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return

    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          open,
          messages: messages.slice(-MAX_HISTORY),
          provider: selectedProvider || '',
        }),
      )
    } catch {
      // ignore storage write failures
    }
  }, [messages, open, hydrated, selectedProvider])

  useEffect(() => {
    if (!messagesRef.current) return
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight
  }, [messages, open])

  const sendViaWebSocket = (trimmed) => {
    const sessionId = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    streamingSessionIdRef.current = sessionId
    setChatPhase('streaming')
    assistantIndexRef.current = messages.length + 1
    setMessages((current) => [...current, { role: 'assistant', content: '' }])
    socketService.sendChatMessage({
      message: trimmed,
      history: messages.slice(-MAX_HISTORY),
      provider: effectiveProvider === 'auto' ? 'agentic' : effectiveProvider,
      sessionId,
      authToken: localStorage.getItem('authToken') || '',
    })
  }

  const sendMessage = async (text) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    const userMessage = { role: 'user', content: trimmed }
    setMessages((current) => [...current, userMessage])
    setInput('')
    setLoading(true)
    sendViaWebSocket(trimmed)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    await sendMessage(input)
  }

  const handleQuickPrompt = async (prompt) => {
    await sendMessage(prompt)
  }

  const handleClear = () => {
    setMessages([WELCOME_MESSAGE])
    setInput('')
    setLoading(false)
    setChatPhase('idle')
    streamingSessionIdRef.current = ''
    assistantIndexRef.current = null
    try {
      sessionStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(PROVIDER_STORAGE_KEY)
    } catch {
      // ignore storage failure
    }
  }

  const handleChangeProvider = (provider) => {
    const nextProvider = normalizeProviderChoice(provider)
    setSelectedProvider(nextProvider)
    try {
      localStorage.setItem(PROVIDER_STORAGE_KEY, nextProvider)
    } catch {
      // ignore storage failure
    }
  }

  const statusClassName = () => {
    switch (chatPhase) {
      case 'connected':
        return 'border-emerald-200 bg-emerald-50 text-emerald-700'
      case 'streaming':
        return 'border-sky-200 bg-sky-50 text-sky-700'
      case 'done':
        return 'border-rose-200 bg-rose-50 text-rose-700'
      case 'error':
        return 'border-amber-200 bg-amber-50 text-amber-700'
      case 'offline':
        return 'border-slate-200 bg-slate-50 text-slate-500'
      default:
        return 'border-slate-200 bg-slate-50 text-slate-500'
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-[80] sm:bottom-6 sm:right-6">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group flex items-center gap-3 rounded-full bg-gradient-to-r from-rose-500 via-pink-500 to-amber-400 px-4 py-3 text-white shadow-2xl shadow-rose-300/40 transition-transform hover:scale-[1.03]"
          aria-label="Open MilkyBloom chat"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15">
            <MessageCircle className="h-5 w-5" />
          </span>
          <span className="pr-1 text-sm font-semibold">Ask MilkyBloom</span>
          <Sparkles className="h-4 w-4 opacity-80" />
        </button>
      ) : (
        <div className="flex h-[32rem] w-[calc(100vw-1.5rem)] max-w-[24rem] flex-col overflow-hidden rounded-[28px] border border-rose-100 bg-[linear-gradient(180deg,#fffefc_0%,#fff5f0_100%)] shadow-[0_30px_80px_rgba(190,90,90,0.25)]">
          <div className="flex items-center justify-between border-b border-rose-100 px-4 py-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-amber-400 text-white">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    MilkyBloom Assistant
                  </div>
                  <div className="text-xs text-slate-500">{providerLabel}</div>
                  <div className="mt-1 inline-flex items-center rounded-full border border-rose-100 bg-white px-2 py-0.5 text-[11px] text-slate-500">
                    Đang dùng: {providerLabel}
                  </div>
                  <div className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${statusClassName()}`}>
                    {getChatPhaseLabel(chatPhase)}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Backend snapshot: {getProviderLabel(providerState)}
                  </div>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {['agentic', 'auto'].map((provider) => {
                  const active = effectiveProvider === provider
                  return (
                    <button
                      key={provider}
                      type="button"
                      onClick={() => handleChangeProvider(provider)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                        active
                          ? 'border-rose-400 bg-rose-50 text-rose-700'
                          : 'border-rose-100 bg-white text-slate-500 hover:bg-rose-50 hover:text-slate-700'
                      }`}
                    >
                      {getProviderDisplayName(provider)}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleClear}
                className="rounded-full p-2 text-slate-500 transition hover:bg-white hover:text-slate-800"
                aria-label="Clear chat"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-2 text-slate-500 transition hover:bg-white hover:text-slate-800"
                aria-label="Close chat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div
            ref={messagesRef}
            className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
          >
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`flex ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-3xl px-4 py-3 text-sm leading-6 shadow-sm ${
                    message.role === 'user'
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-700'
                  }`}
                >
                  {message.content || (loading && index === assistantIndexRef.current ? 'Đang suy nghĩ...' : '')}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-rose-100 bg-white/70 px-3 py-3 backdrop-blur">
            <div className="mb-2 flex flex-wrap gap-2">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleQuickPrompt(prompt)}
                  className="rounded-full border border-rose-100 bg-rose-50 px-3 py-1 text-left text-[11px] text-rose-700 transition hover:bg-rose-100"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={2}
                placeholder="Nhập câu hỏi của bạn..."
                className="min-h-[52px] flex-1 resize-none rounded-2xl border border-rose-100 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-rose-300"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-amber-400 text-white transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default ChatWidget
