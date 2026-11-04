// 방장 브라우저에서 도는 방 (기획서 2.4장). 연결(PeerJS)과 저장(localStorage)은 밖에서 넣어 준다.
import { makeRng } from '../core/rng.ts'
import { rankOf, type Rank } from '../core/rank.ts'
import { choiceAllowed, type PlayerId } from '../core/types.ts'
import { GAMES, type AnyRules } from '../games.ts'
import {
  REACTIONS,
  TURN_LIMITS,
  type ClientMsg,
  type HostMsg,
  type Member,
  type RoomSettings,
  type RoomState,
  type RoomView,
} from './types.ts'

export const ROOM = {
  codeLength: 6,
  codeChars: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', // 헷갈리는 O·0·I·1 뺌
  nameMaxLength: 12,
  chatKeep: 50,
  chatMaxLength: 200,
  maxMembers: 12,
  awayNoticeSeconds: 120, // 차례인 사람이 이만큼 없으면 방장에게 "봇이 대신하기"를 권한다
  botDelayMs: 700,
}

export const BOT_PREFIX = 'bot:'
export const isBot = (id: string) => id.startsWith(BOT_PREFIX)

export function newRoomCode(rng: () => number = Math.random): string {
  let code = ''
  for (let i = 0; i < ROOM.codeLength; i++) code += ROOM.codeChars[Math.floor(rng() * ROOM.codeChars.length)]
  return code
}

export function defaultSettings(game = 'hanyang'): RoomSettings {
  const rules = GAMES[game]!
  return {
    game,
    seats: rules.players.max,
    tutorial: true,
    fillBots: false,
    turnLimit: 0,
    spectators: true,
    options: Object.fromEntries(rules.options.map((o) => [o.id, o.default])),
  }
}

export function createRoom(code: string, host: Omit<Member, 'connected'>, settings?: RoomSettings): RoomState {
  const s = settings ? structuredClone(settings) : defaultSettings()
  return {
    v: 1,
    code,
    hostId: host.id,
    members: [],
    seats: Array(s.seats).fill(null),
    settings: s,
    phase: 'lobby',
    seed: 0,
    players: [],
    game: null,
    standIn: [],
    result: null,
    chat: [],
    turnStartedAt: 0,
    actions: 0,
  }
}

/** 저장해 둔 방을 다시 열 때(새로고침, 방장 넘겨받기): 아직 아무도 연결되지 않은 상태로 */
export function resumeRoom(saved: RoomState, hostId: string): RoomState {
  const room = structuredClone(saved)
  room.hostId = hostId
  for (const m of room.members) m.connected = false
  return room
}

export class RoomError extends Error {}

export interface RoomHostIo {
  send(to: string, msg: HostMsg): void
  save?(room: RoomState): void
  now?(): number
  random?(): number
}

export class RoomHost {
  room: RoomState
  private io: Required<RoomHostIo>

  constructor(room: RoomState, io: RoomHostIo) {
    this.room = room
    this.io = { save: () => {}, now: Date.now, random: Math.random, ...io }
  }

  get rules(): AnyRules {
    return GAMES[this.room.settings.game]!
  }

  receive(from: string, msg: ClientMsg): void {
    if (msg.t === 'presence' || msg.t === 'react') return this.relay(from, msg)
    try {
      this.handle(from, msg)
    } catch (e) {
      if (!(e instanceof Error)) throw e
      this.io.send(from, { t: 'error', text: e.message })
      return
    }
    this.changed()
  }

  disconnect(id: string): void {
    const m = this.member(id)
    if (!m || !m.connected) return
    m.connected = false
    this.changed()
  }

  /** 지금 봇이 둘 차례인가 (빈자리 봇, 또는 봇이 대신 두는 사람) */
  botTurn(): boolean {
    const cur = this.current()
    return !!cur && (isBot(cur) || this.room.standIn.includes(cur))
  }

  /** 봇 한 수. 방장 쪽이 ROOM.botDelayMs 간격으로 부른다 */
  stepBot(): boolean {
    const cur = this.current()
    if (!cur || !this.botTurn()) return false
    const rng = makeRng(this.room.seed + this.room.actions * 7919)
    this.applyAction(cur, this.rules.bot(this.room.game, cur, rng))
    this.changed()
    return true
  }

  /** 방장 넘기기: 다음 사람에게 방을 넘긴다. 넘길 사람이 없으면 null */
  handoff(): { to: string; room: RoomState } | null {
    const old = this.room.hostId
    const seated = this.room.seats.filter((id): id is string => !!id && !isBot(id))
    const candidates = [...seated, ...this.room.members.map((m) => m.id)]
    const to = candidates.find((id) => id !== old && this.member(id)?.connected)
    if (!to) return null
    this.member(old)!.connected = false
    if (this.room.phase === 'playing' && this.room.players.includes(old) && !this.room.standIn.includes(old)) {
      this.room.standIn.push(old)
    }
    this.system(`${this.member(old)!.name}님이 나가고 ${this.member(to)!.name}님이 방장이 되었어요`)
    const room = structuredClone(this.room)
    room.hostId = to
    this.io.send(to, { t: 'becomeHost', room })
    return { to, room }
  }

  viewFor(id: string): RoomView {
    const r = this.room
    const playing = r.phase !== 'lobby' && r.game !== null
    const ranks: Record<PlayerId, Rank> = {}
    if (playing) {
      for (const p of r.players) {
        const winner = !!r.result?.ranking.some((x) => x.player === p && x.place === 1)
        ranks[p] = rankOf(this.rules.progress(r.game, p), winner)
      }
    }
    return {
      code: r.code,
      you: id,
      hostId: r.hostId,
      members: r.members,
      seats: r.seats,
      settings: r.settings,
      phase: r.phase,
      players: r.players,
      game: playing ? this.rules.view(r.game, r.players.includes(id) ? id : 'spectator') : null,
      legal: r.phase === 'playing' && !r.standIn.includes(id) ? this.rules.legalActions(r.game, id) : [],
      current: this.current(),
      ranks,
      result: r.result,
      chat: r.chat,
      standIn: r.standIn,
      turnStartedAt: r.turnStartedAt,
      now: this.io.now(),
    }
  }

  // ---- 안쪽 ----

  /** 손 위치·보는 중·반응: 저장하지 않고 바로 넘긴다. 틀린 값은 조용히 버린다(자주 오는 메시지라). */
  private relay(from: string, msg: Extract<ClientMsg, { t: 'presence' | 'react' }>): void {
    const sender = this.member(from)
    if (!sender?.connected) return
    if (msg.t === 'react') {
      if (!(REACTIONS as readonly string[]).includes(msg.emoji)) return
      for (const m of this.room.members) if (m.connected) this.io.send(m.id, { t: 'react', from, emoji: msg.emoji })
      return
    }
    const finite = (xs: unknown) => Array.isArray(xs) && xs.length === 2 && xs.every((n) => Number.isFinite(n))
    const at = msg.at
    if (at !== null && !(('c' in at && finite(at.c)) || ('p' in at && typeof at.p === 'string' && finite(at.l)))) return
    if (msg.hover !== null && (typeof msg.hover !== 'string' || msg.hover.length > 80)) return
    for (const m of this.room.members) {
      if (m.connected && m.id !== from) this.io.send(m.id, { t: 'presence', from, at, hover: msg.hover })
    }
  }

  private changed(): void {
    this.io.save(this.room)
    for (const m of this.room.members) if (m.connected) this.io.send(m.id, { t: 'room', view: this.viewFor(m.id) })
  }

  private member(id: string): Member | undefined {
    return this.room.members.find((m) => m.id === id)
  }

  private current(): PlayerId | null {
    return this.room.phase === 'playing' ? this.rules.currentPlayer(this.room.game) : null
  }

  private system(text: string): void {
    this.pushChat({ from: null, text, at: this.io.now() })
  }

  private pushChat(line: { from: string | null; text: string; at: number }): void {
    this.room.chat.push(line)
    if (this.room.chat.length > ROOM.chatKeep) this.room.chat.splice(0, this.room.chat.length - ROOM.chatKeep)
  }

  private requireHost(from: string): void {
    if (from !== this.room.hostId) throw new RoomError('방장만 할 수 있어요')
  }

  private requirePhase(phase: RoomState['phase']): void {
    if (this.room.phase !== phase) {
      throw new RoomError({ lobby: '게임 시작 전에만', playing: '게임 중에만', over: '게임이 끝난 뒤에만' }[phase] + ' 할 수 있어요')
    }
  }

  private handle(from: string, msg: ClientMsg): void {
    if (msg.t === 'hello') return this.hello(from, msg)
    if (!this.member(from)) throw new RoomError('먼저 들어와 주세요')
    const r = this.room
    switch (msg.t) {
      case 'sit': {
        this.requirePhase('lobby')
        if (!Number.isInteger(msg.seat) || msg.seat < 0 || msg.seat >= r.seats.length) throw new RoomError('없는 자리예요')
        if (r.seats[msg.seat]) throw new RoomError('이미 누가 앉은 자리예요')
        r.seats = r.seats.map((id) => (id === from ? null : id))
        r.seats[msg.seat] = from
        break
      }
      case 'stand':
        this.requirePhase('lobby')
        r.seats = r.seats.map((id) => (id === from ? null : id))
        break
      case 'settings':
        this.requireHost(from)
        this.requirePhase('lobby')
        this.applySettings(msg.settings)
        break
      case 'start':
        this.requireHost(from)
        this.requirePhase('lobby')
        this.start()
        break
      case 'act':
        this.requirePhase('playing')
        if (!r.players.includes(from)) throw new RoomError('구경꾼은 둘 수 없어요')
        this.applyAction(from, msg.action)
        // 대신 두던 봇이 있었으면 본인이 돌아온 것
        r.standIn = r.standIn.filter((p) => p !== from)
        break
      case 'chat': {
        const text = String(msg.text).trim().slice(0, ROOM.chatMaxLength)
        if (!text) return
        this.pushChat({ from, text, at: this.io.now() })
        break
      }
      case 'standIn':
        this.requireHost(from)
        this.requirePhase('playing')
        if (!r.players.includes(msg.player) || isBot(msg.player)) throw new RoomError('사람 자리가 아니에요')
        r.standIn = r.standIn.filter((p) => p !== msg.player)
        if (msg.on) r.standIn.push(msg.player)
        this.system(`${this.member(msg.player)?.name ?? msg.player} 자리를 ${msg.on ? '봇이 대신 둬요' : '본인이 다시 둬요'}`)
        break
      case 'again':
        this.requireHost(from)
        this.requirePhase('over')
        r.phase = 'lobby'
        r.game = null
        r.players = []
        r.standIn = []
        r.result = null
        r.seats = r.seats.map((id) => (id && isBot(id) ? null : id))
        break
      default:
        throw new RoomError('알 수 없는 요청')
    }
  }

  private hello(from: string, msg: Extract<ClientMsg, { t: 'hello' }>): void {
    if (msg.id !== from) throw new RoomError('잘못된 인사')
    const name = String(msg.name).trim().slice(0, ROOM.nameMaxLength)
    if (!name) throw new RoomError('닉네임을 정해 주세요')
    const known = this.member(from)
    if (known) {
      known.name = name
      known.color = msg.color
      known.connected = true
      // 자리 비운 동안 봇이 대신 뒀으면 돌려준다
      if (this.room.standIn.includes(from)) {
        this.room.standIn = this.room.standIn.filter((p) => p !== from)
        this.system(`${name}님이 돌아왔어요`)
      }
      return
    }
    const r = this.room
    if (r.phase !== 'lobby' && !r.settings.spectators) throw new RoomError('게임 중이고 구경꾼을 받지 않는 방이에요')
    if (r.members.length >= ROOM.maxMembers) throw new RoomError('방이 꽉 찼어요')
    r.members.push({ id: from, name, color: msg.color, connected: true })
    if (from !== r.hostId) this.system(`${name}님이 들어왔어요`)
  }

  private applySettings(patch: Partial<RoomSettings>): void {
    const s = { ...this.room.settings, ...patch, options: { ...this.room.settings.options, ...patch.options } }
    const rules = GAMES[s.game]
    if (!rules) throw new RoomError('없는 게임이에요')
    if (patch.game && patch.game !== this.room.settings.game) s.options = defaultSettings(s.game).options
    if (!Number.isInteger(s.seats) || s.seats < rules.players.min || s.seats > rules.players.max) {
      throw new RoomError(`인원은 ${rules.players.min}~${rules.players.max}명이에요`)
    }
    if (!(TURN_LIMITS as readonly number[]).includes(s.turnLimit)) throw new RoomError('없는 시간 제한이에요')
    // 인원에 따라 못 고르는 값은 기본값으로 되돌리고 알린다 (기획서 2.1.1장)
    for (const spec of rules.options) {
      const value = s.options[spec.id]
      if (value === undefined || choiceAllowed(spec, value, s.seats)) continue
      if (!spec.choices.some((c) => c.value === value)) throw new RoomError(`${spec.label}: 고를 수 없는 값이에요`)
      s.options[spec.id] = spec.default
      const label = (v: unknown) => spec.choices.find((c) => c.value === v)?.label ?? String(v)
      this.system(`${spec.label} ${label(value)}은 ${s.seats}인이 고를 수 없어서 ${label(spec.default)}(으)로 바꿨어요`)
    }
    const seats = this.room.seats.slice(0, s.seats)
    while (seats.length < s.seats) seats.push(null)
    this.room.settings = s
    this.room.seats = seats
  }

  private start(): void {
    const r = this.room
    const rules = this.rules
    if (!r.seats.some((id) => id)) throw new RoomError('앉은 사람이 없어요')
    if (r.seats.some((id) => !id) && !r.settings.fillBots) {
      throw new RoomError('빈자리가 있어요. 자리를 채우거나 "빈자리 봇으로 채우기"를 켜 주세요')
    }
    let bot = 0
    r.seats = r.seats.map((id) => id ?? `${BOT_PREFIX}${++bot}`)
    r.players = [...(r.seats as string[])]
    r.seed = Math.floor(this.io.random() * 2 ** 31)
    r.game = rules.setup(r.players, r.seed, r.settings.options)
    r.phase = 'playing'
    r.standIn = []
    r.result = null
    r.actions = 0
    r.turnStartedAt = this.io.now()
    this.system('게임을 시작해요!')
  }

  private applyAction(player: PlayerId, action: unknown): void {
    const r = this.room
    const before = this.current()
    r.game = this.rules.apply(r.game, player, action)
    r.actions++
    if (this.current() !== before) r.turnStartedAt = this.io.now()
    r.result = this.rules.result(r.game)
    if (r.result) {
      r.phase = 'over'
      this.system('게임이 끝났어요')
    }
  }
}
