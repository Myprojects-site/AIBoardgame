// 방 화면: 대기실(자리·설정), 게임(판 + 사람 목록), 결과, 채팅 — 기획서 2.1, 2.1.1, 3.5장
import { choiceAllowed } from '@aibg/shared/core/types'
import { GAMES } from '@aibg/shared/games'
import { BOT_PREFIX, ROOM, TURN_LIMITS, isBot, type ClientMsg, type RoomSettings, type RoomView } from '@aibg/shared/room'
import { BOARDS } from '../games/registry.ts'
import { isMuted, setMuted } from '../sound.ts'
import { button, dot, h } from './dom.ts'

export interface RoomCtx {
  view: RoomView
  send(msg: ClientMsg): void
  leave(): void
  redraw(): void
  isHost: boolean
}

const TURN_LIMIT_LABEL: Record<number, string> = { 0: '없음', 60: '1분', 120: '2분', 180: '3분' }

function nameOf(v: RoomView, id: string): string {
  if (isBot(id)) return `봇 ${id.slice(BOT_PREFIX.length)}`
  return v.members.find((m) => m.id === id)?.name ?? '?'
}

function label(v: RoomView, id: string): HTMLElement {
  const m = v.members.find((x) => x.id === id)
  const rank = v.ranks[id]
  return h(
    'span',
    { class: `who${m && !m.connected ? ' away' : ''}` },
    dot(m?.color ?? '#999'),
    rank ? h('span', { class: `rank rank-${rank}` }, rank) : '',
    ' ',
    nameOf(v, id),
    id === v.hostId ? ' 👑' : '',
    m && !m.connected ? ' (연결 끊김)' : '',
    v.standIn.includes(id) ? ' (봇이 대신)' : '',
  )
}

function settingsSummary(s: RoomSettings): string {
  const rules = GAMES[s.game]!
  const opts = rules.options.map((o) => o.choices.find((c) => c.value === s.options[o.id])?.label ?? '').join(' · ')
  return [rules.name, `${s.seats}인`, opts, s.tutorial ? '튜토리얼' : '', s.fillBots ? '빈자리 봇' : '',
    s.turnLimit ? `차례 ${TURN_LIMIT_LABEL[s.turnLimit]}` : '', s.spectators ? '' : '구경꾼 안 받음']
    .filter(Boolean)
    .join(' · ')
}

function settingsForm(ctx: RoomCtx): HTMLElement {
  const s = ctx.view.settings
  const rules = GAMES[s.game]!
  const set = (patch: Partial<RoomSettings>) => ctx.send({ t: 'settings', settings: patch })
  const select = (id: string, value: string | number, choices: { value: string | number; label: string; disabled?: boolean; note?: string }[], onChange: (v: string) => void) =>
    h('select', { id, onchange: (e: Event) => onChange((e.target as HTMLSelectElement).value) },
      ...choices.map((c) => h('option', { value: String(c.value), selected: c.value === value, disabled: !!c.disabled }, c.label + (c.disabled && c.note ? ` (${c.note})` : ''))))
  const check = (id: string, on: boolean, text: string, onChange: (v: boolean) => void) =>
    h('label', { class: 'check' }, h('input', { type: 'checkbox', id, checked: on, onchange: (e: Event) => onChange((e.target as HTMLInputElement).checked) }), ` ${text}`)

  const seats = []
  for (let n = rules.players.min; n <= rules.players.max; n++) seats.push({ value: n, label: `${n}명` })

  return h(
    'div',
    { class: 'settings' },
    h('label', {}, '인원 ', select('set-seats', s.seats, seats, (v) => set({ seats: Number(v) }))),
    ...rules.options.map((o) =>
      h('label', {}, `${o.label} `,
        select(`set-${o.id}`, s.options[o.id] as number, o.choices.map((c) => ({
          value: c.value as number,
          label: c.label,
          disabled: !choiceAllowed(o, c.value, s.seats),
          note: c.players ? `${c.players.join('~')}인만` : undefined,
        })), (v) => set({ options: { [o.id]: Number.isNaN(Number(v)) ? v : Number(v) } }))),
    ),
    check('set-tutorial', s.tutorial, '튜토리얼 보여 주기', (v) => set({ tutorial: v })),
    check('set-bots', s.fillBots, '빈자리 봇으로 채우기', (v) => set({ fillBots: v })),
    h('label', {}, '차례 시간 제한 ',
      select('set-turn', s.turnLimit, TURN_LIMITS.map((t) => ({ value: t, label: TURN_LIMIT_LABEL[t]! })), (v) => set({ turnLimit: Number(v) as RoomSettings['turnLimit'] }))),
    check('set-spectators', s.spectators, '구경꾼 받기', (v) => set({ spectators: v })),
  )
}

function lobby(ctx: RoomCtx): HTMLElement {
  const v = ctx.view
  const mySeat = v.seats.indexOf(v.you)
  const seated = new Set(v.seats.filter(Boolean))
  const watchers = v.members.filter((m) => !seated.has(m.id))
  return h(
    'div',
    { class: 'lobby' },
    h('h2', {}, '대기실'),
    h('p', { class: 'muted' }, settingsSummary(v.settings)),
    h(
      'ol',
      { class: 'seats' },
      ...v.seats.map((id, i) =>
        h('li', {},
          id ? label(v, id) : h('span', { class: 'muted' }, v.settings.fillBots ? '빈자리 (봇)' : '빈자리'),
          !id && button('앉기', () => ctx.send({ t: 'sit', seat: i }), { class: 'small', title: `${i + 1}번 자리` }),
          i === mySeat && button('일어나기', () => ctx.send({ t: 'stand' }), { class: 'small' })),
      ),
    ),
    watchers.length > 0 && h('p', { class: 'small' }, '서 있는 사람: ', ...watchers.map((m) => label(v, m.id))),
    ctx.isHost ? settingsForm(ctx) : h('p', { class: 'muted' }, '방장이 설정을 고르고 시작해요.'),
    ctx.isHost && button('게임 시작', () => ctx.send({ t: 'start' }), { class: 'primary', title: '모두 앉으면 시작' }),
  )
}

function sidePanel(ctx: RoomCtx): HTMLElement {
  const v = ctx.view
  const away = v.players.filter((p) => !isBot(p) && p !== v.you && !v.members.find((m) => m.id === p)?.connected)
  const elapsed = Math.floor((v.now - v.turnStartedAt) / 1000)
  const curAway = v.current && away.includes(v.current) && elapsed >= ROOM.awayNoticeSeconds
  const overTime = v.settings.turnLimit > 0 && elapsed > v.settings.turnLimit && v.phase === 'playing'
  return h(
    'div',
    { class: 'side' },
    overTime && v.current && h('p', { class: 'notice' }, '⏰ ', nameOf(v, v.current), `님 차례가 ${TURN_LIMIT_LABEL[v.settings.turnLimit]}을 넘었어요`),
    curAway && h('p', { class: 'notice' }, nameOf(v, v.current!), '님이 2분 넘게 자리를 비웠어요'),
    ctx.isHost && v.phase === 'playing' && v.players.filter((p) => !isBot(p) && p !== v.you).length > 0 &&
      h('div', { class: 'small' }, h('b', {}, '봇이 대신 두기'),
        ...v.players.filter((p) => !isBot(p) && p !== v.you).map((p) => {
          const on = v.standIn.includes(p)
          return h('div', {}, label(v, p), ' ', button(on ? '그만' : '대신 두기', () => ctx.send({ t: 'standIn', player: p, on: !on }), { class: 'small' }))
        })),
  )
}

function results(ctx: RoomCtx): HTMLElement {
  const v = ctx.view
  return h(
    'div',
    { class: 'results card' },
    h('h2', {}, '결과'),
    h('ol', {}, ...v.result!.ranking.map((r) => h('li', {}, `${r.place}등 `, label(v, r.player), ` ${r.score}점`))),
    ctx.isHost ? button('다시 하기', () => ctx.send({ t: 'again' }), { class: 'primary' }) : h('p', { class: 'muted' }, '방장이 다시 하기를 누르면 대기실로 가요.'),
  )
}

export function chatPanel(v: RoomView, send: (text: string) => void, input: HTMLInputElement): HTMLElement {
  const log = h('div', { class: 'chatlog' },
    ...v.chat.map((c) => h('div', { class: c.from ? '' : 'sys' }, c.from ? h('b', {}, nameOf(v, c.from), ': ') : '', c.text)))
  queueMicrotask(() => (log.scrollTop = log.scrollHeight))
  return h(
    'div',
    { class: 'chat' },
    log,
    h('form', { class: 'row', onsubmit: (e: Event) => {
      e.preventDefault()
      if (input.value.trim()) send(input.value)
      input.value = ''
    } }, input, h('button', { type: 'submit' }, '보내기')),
  )
}

export function roomScreen(ctx: RoomCtx, chatInput: HTMLInputElement): HTMLElement {
  const v = ctx.view
  const link = `${location.origin}${location.pathname}#/room/${v.code}`
  const top = h(
    'div',
    { class: 'topbar' },
    h('b', {}, 'AI 보드게임'),
    h('span', {}, ' 방 ', h('code', { id: 'room-code' }, v.code)),
    button('초대 링크 복사', () => {
      navigator.clipboard?.writeText(link).catch(() => {})
    }, { class: 'small', title: link }),
    h('span', { class: 'spacer' }),
    button(isMuted() ? '🔇 소리 켜기' : '🔊 소리 끄기', () => {
      setMuted(!isMuted())
      ctx.redraw()
    }, { class: 'small', title: '소리' }),
    button(ctx.isHost ? '나가기 (방장 넘기기)' : '나가기', () => ctx.leave(), { class: 'small' }),
  )
  let main: HTMLElement
  if (v.phase === 'lobby') main = lobby(ctx)
  else {
    const board = BOARDS[v.settings.game]!({
      room: v,
      me: v.you,
      label: (id) => label(v, id),
      nameOf: (id) => nameOf(v, id),
      colorOf: (id) => v.members.find((m) => m.id === id)?.color ?? '#8a8a8a',
      act: (action) => ctx.send({ t: 'act', action }),
      presence: (at, hover) => ctx.send({ t: 'presence', at, hover }),
      react: (emoji) => ctx.send({ t: 'react', emoji }),
      redraw: ctx.redraw,
    })
    main = h('div', {}, v.phase === 'over' && results(ctx), board)
  }
  return h(
    'div',
    { class: 'room' },
    top,
    h('div', { class: 'layout' }, h('div', { class: 'main' }, main), h('div', { class: 'aside' },
      v.phase !== 'lobby' && sidePanel(ctx),
      chatPanel(v, (text) => ctx.send({ t: 'chat', text }), chatInput))),
  )
}
