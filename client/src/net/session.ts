// 방장 브라우저 판정 (기획서 2.4장).
// 방장: 방 코드로 PeerJS 주소를 열고 RoomHost를 돌린다. 방장 자신도 같은 메시지로 행동한다.
// 참가자: 방장 주소로 연결해 행동을 보내고 RoomView를 받는다. 끊기면 다시 붙을 때까지 계속 시도한다.
import { Peer, type DataConnection } from 'peerjs'
import { ROOM, RoomHost, type ClientMsg, type HostMsg, type RoomState, type RoomView } from '@aibg/shared/room'
import { forget, hostKey, store, type Me } from '../identity.ts'

export const PEER_PREFIX = 'aibg-'
const RETRY_MS = 2000
const HOST_REOPEN_TRIES = 30 // 새로고침 직후엔 중계 서버가 옛 주소를 잠깐 붙잡고 있다
const HANDOFF_FLUSH_MS = 800

export type NetStatus = 'connecting' | 'online' | 'waitingHost' | 'reopening' | 'failed'

export interface SessionEvents {
  view(v: RoomView): void
  error(text: string): void
  status(s: NetStatus, detail?: string): void
  becomeHost(room: RoomState): void
}

export interface Session {
  readonly isHost: boolean
  send(msg: ClientMsg): void
  close(): void
  /** 방장만: 다음 사람에게 넘긴다. 넘길 사람이 없으면 false */
  handoff(): boolean
}

const PEER_OPTIONS = { debug: 0 as const }

export function hostSession(room: RoomState, me: Me, ev: SessionEvents): Session {
  const conns = new Map<string, DataConnection>()
  let closed = false
  let botTimer: ReturnType<typeof setTimeout> | undefined
  let peer: Peer

  const deliver = (msg: HostMsg) => {
    if (msg.t === 'room') ev.view(msg.view)
    else if (msg.t === 'error') ev.error(msg.text)
  }
  const host = new RoomHost(room, {
    send: (to, msg) => (to === me.id ? deliver(msg) : conns.get(to)?.send(msg)),
    save: (r) => store(hostKey(r.code), r),
  })

  // 봇 차례면 조금 쉬었다가 둔다
  const pump = () => {
    clearTimeout(botTimer)
    if (!closed && host.botTurn()) {
      botTimer = setTimeout(() => {
        host.stepBot()
        pump()
      }, ROOM.botDelayMs)
    }
  }
  const receive = (from: string, msg: ClientMsg) => {
    host.receive(from, msg)
    pump()
  }

  const open = (attempt: number) => {
    ev.status(attempt ? 'reopening' : 'connecting')
    peer = new Peer(PEER_PREFIX + room.code, PEER_OPTIONS)
    peer.on('open', () => ev.status('online'))
    peer.on('disconnected', () => {
      if (!closed && !peer.destroyed) peer.reconnect()
    })
    peer.on('error', (err) => {
      if (closed) return
      if (err.type === 'unavailable-id' && attempt < HOST_REOPEN_TRIES) {
        peer.destroy()
        setTimeout(() => open(attempt + 1), RETRY_MS)
      } else if (err.type !== 'peer-unavailable') {
        ev.status('failed', err.type)
      }
    })
    peer.on('connection', (conn) => {
      let id: string | null = null
      conn.on('data', (data) => {
        const msg = data as ClientMsg
        if (!id) {
          if (msg?.t !== 'hello' || typeof msg.id !== 'string' || msg.id === me.id) {
            conn.close()
            return
          }
          id = msg.id
          const old = conns.get(id)
          conns.set(id, conn)
          old?.close()
        }
        receive(id, msg)
      })
      conn.on('close', () => {
        if (id && conns.get(id) === conn) {
          conns.delete(id)
          host.disconnect(id)
        }
      })
    })
  }

  open(0)
  receive(me.id, { t: 'hello', id: me.id, name: me.name, color: me.color })

  const close = () => {
    closed = true
    clearTimeout(botTimer)
    peer.destroy()
  }
  return {
    isHost: true,
    send: (msg) => receive(me.id, msg),
    close,
    handoff() {
      if (!host.handoff()) return false
      forget(hostKey(room.code))
      // becomeHost가 건너갈 시간을 주고 주소를 비운다. 새 방장이 같은 주소를 연다.
      closed = true
      setTimeout(close, HANDOFF_FLUSH_MS)
      return true
    },
  }
}

export function guestSession(code: string, me: Me, ev: SessionEvents): Session {
  let closed = false
  let conn: DataConnection | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  const peer = new Peer(PEER_OPTIONS)

  const retry = () => {
    if (closed) return
    ev.status('waitingHost')
    clearTimeout(timer)
    timer = setTimeout(connect, RETRY_MS)
  }

  const connect = () => {
    if (closed) return
    if (peer.disconnected) {
      peer.reconnect()
      return retry()
    }
    const c = peer.connect(PEER_PREFIX + code, { reliable: true })
    conn = c
    c.on('open', () => {
      ev.status('online')
      c.send({ t: 'hello', id: me.id, name: me.name, color: me.color } satisfies ClientMsg)
    })
    c.on('data', (data) => {
      const msg = data as HostMsg
      if (msg.t === 'room') ev.view(msg.view)
      else if (msg.t === 'error') ev.error(msg.text)
      else if (msg.t === 'becomeHost') ev.becomeHost(msg.room)
    })
    c.on('close', () => {
      if (conn === c) retry()
    })
    c.on('error', () => {
      if (conn === c) retry()
    })
  }

  ev.status('connecting')
  peer.on('open', connect)
  peer.on('disconnected', () => {
    if (!closed && !peer.destroyed) peer.reconnect()
  })
  peer.on('error', (err) => {
    if (closed) return
    // 방장이 아직(또는 다시) 주소를 열지 않았다
    if (err.type === 'peer-unavailable') retry()
    else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
      ev.status('failed', err.type)
      retry()
    }
  })

  return {
    isHost: false,
    send(msg) {
      if (conn?.open) conn.send(msg)
      else ev.error('방장과 연결이 끊겨 있어요. 다시 붙는 중이에요')
    },
    close() {
      closed = true
      clearTimeout(timer)
      conn = null
      peer.destroy()
    },
    handoff: () => false,
  }
}
