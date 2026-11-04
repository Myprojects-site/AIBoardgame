import './style.css'
import { createRoom, defaultSettings, newRoomCode, resumeRoom, type RoomSettings, type RoomState, type RoomView } from '@aibg/shared/room'
import { hostKey, load, loadMe, store, forget, type Me } from './identity.ts'
import { guestSession, hostSession, type NetStatus, type Session, type SessionEvents } from './net/session.ts'
import { h } from './ui/dom.ts'
import { homeScreen, identityForm } from './ui/home.ts'
import { roomScreen } from './ui/room.ts'

const app = document.getElementById('app')!
const statusBar = h('div', { class: 'netstatus', id: 'net-status' })
const toast = h('div', { class: 'toast', id: 'toast' })
const screen = h('div', {})
app.append(statusBar, screen, toast)

// 채팅 입력칸은 다시 그려도 쓰던 글이 남게 하나만 쓴다
const chatInput = h('input', { id: 'chat-input', maxlength: 200, placeholder: '채팅', autocomplete: 'off' }) as HTMLInputElement

let session: Session | null = null
let view: RoomView | null = null

const STATUS_TEXT: Record<NetStatus, string> = {
  connecting: '연결하는 중…',
  online: '',
  waitingHost: '방장을 기다리는 중… (방장이 돌아오면 자동으로 이어져요)',
  reopening: '방 주소를 다시 여는 중…',
  failed: '연결이 잘 안 돼요. 인터넷을 확인해 주세요',
}

let toastTimer: ReturnType<typeof setTimeout> | undefined
function showToast(text: string) {
  toast.textContent = text
  toast.classList.add('on')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.remove('on'), 3500)
}

function draw() {
  if (!view || !session) return
  // 다시 그릴 때 채팅 칸 포커스 유지
  const focused = document.activeElement === chatInput
  screen.replaceChildren(
    roomScreen({ view, send: (m) => session?.send(m), leave, redraw: draw, isHost: session.isHost }, chatInput),
  )
  if (focused) chatInput.focus()
}

function events(me: Me): SessionEvents {
  return {
    view(v) {
      view = v
      // 방장은 고른 설정을 다음 방 만들기에 다시 쓴다 (기획서 2.1.1장)
      if (session?.isHost && v.phase === 'lobby') store('lastSettings', v.settings)
      draw()
    },
    error: showToast,
    status(s, detail) {
      statusBar.textContent = STATUS_TEXT[s] + (detail && s === 'failed' ? ` (${detail})` : '')
      statusBar.classList.toggle('on', s !== 'online')
    },
    becomeHost(room) {
      // 방장을 넘겨받았다
      store(hostKey(room.code), room)
      session?.close()
      session = hostSession(resumeRoom(room, me.id), me, events(me))
      showToast('방장이 되었어요')
    },
  }
}

function enterRoom(code: string) {
  const me = loadMe()
  if (!me) {
    screen.replaceChildren(identityForm(() => enterRoom(code), `방 ${code}에 들어가요`))
    return
  }
  session?.close()
  view = null
  screen.replaceChildren(h('div', { class: 'card narrow' }, `방 ${code}에 들어가는 중…`))
  const saved = load<RoomState>(hostKey(code))
  session = saved && saved.hostId === me.id ? hostSession(resumeRoom(saved, me.id), me, events(me)) : guestSession(code, me, events(me))
}

function leave() {
  if (!session) return
  if (session.isHost && view && view.members.some((m) => m.id !== view!.you && m.connected)) {
    if (!session.handoff()) showToast('넘길 사람이 없어요')
  } else if (session.isHost) {
    if (!confirm('넘길 사람이 없어요. 방을 닫을까요?')) return
    if (view) forget(hostKey(view.code))
    session.close()
  } else {
    session.close()
  }
  session = null
  view = null
  location.hash = ''
}

function home() {
  session?.close()
  session = null
  view = null
  statusBar.classList.remove('on')
  const me = loadMe()
  if (!me) {
    screen.replaceChildren(identityForm(home))
    return
  }
  screen.replaceChildren(
    homeScreen(me, {
      create() {
        const code = newRoomCode()
        const settings = load<RoomSettings>('lastSettings') ?? defaultSettings()
        store(hostKey(code), createRoom(code, me, settings))
        location.hash = `#/room/${code}`
      },
      join: (code) => (location.hash = `#/room/${code}`),
      rename: () => screen.replaceChildren(identityForm(home)),
    }),
  )
}

function route() {
  const m = location.hash.match(/^#\/room\/([A-Z0-9]{6})$/)
  if (m) enterRoom(m[1]!)
  else home()
}

window.addEventListener('hashchange', route)
// 방장이 게임 중에 창을 닫으면 다른 사람 판이 멈춘다 (기획서 2.4장)
window.addEventListener('beforeunload', (e) => {
  if (session?.isHost && view?.phase === 'playing') e.preventDefault()
})
// 차례 시간 표시를 위해 가끔 다시 그린다
setInterval(() => {
  if (view && view.phase === 'playing' && document.activeElement?.tagName !== 'SELECT') {
    view = { ...view, now: Date.now() }
    draw()
  }
}, 5000)

// 자동 확인(tools/e2e.ts)용
;(window as unknown as Record<string, unknown>).__aibg = {
  get view() {
    return view
  },
  send: (msg: Parameters<Session['send']>[0]) => session?.send(msg),
  get isHost() {
    return session?.isHost ?? false
  },
}

route()
