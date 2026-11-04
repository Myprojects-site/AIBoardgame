import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RoomHost, createRoom, resumeRoom, type HostMsg, type RoomState, type RoomView } from '../src/room/index.ts'
import type { HanyangView } from '../src/hanyang/index.ts'

/** 방장 하나와 보낸 메시지 기록 */
function setup(names = ['host', 'b', 'c']) {
  const inbox = new Map<string, HostMsg[]>()
  let saved: RoomState | null = null
  let clock = 1000
  const host = new RoomHost(createRoom('ABCDEF', { id: names[0]!, name: names[0]!, color: '#fff' }), {
    send: (to, msg) => inbox.set(to, [...(inbox.get(to) ?? []), msg]),
    save: (r) => (saved = structuredClone(r)),
    now: () => clock,
    random: () => 0.5,
  })
  for (const n of names) host.receive(n, { t: 'hello', id: n, name: n, color: '#fff' })
  const last = (id: string): RoomView => {
    const msgs = (inbox.get(id) ?? []).filter((m) => m.t === 'room')
    return (msgs[msgs.length - 1] as Extract<HostMsg, { t: 'room' }>).view
  }
  const errors = (id: string) => (inbox.get(id) ?? []).filter((m) => m.t === 'error').map((m) => (m as { text: string }).text)
  return { host, inbox, last, errors, saved: () => saved, tick: (ms: number) => (clock += ms) }
}

/** 봇 차례면 봇을, 사람 차례면 그 사람이 첫 번째 할 수 있는 행동(살 수 있으면 사기)을 해서 끝까지 */
function playOut(t: ReturnType<typeof setup>) {
  let guard = 0
  while (t.host.room.phase === 'playing') {
    if (++guard > 5000) throw new Error('안 끝남')
    if (t.host.stepBot()) continue
    const cur = t.last(t.host.room.hostId).current!
    const legal = t.last(cur).legal as { type: string }[]
    const act = legal.find((a) => a.type === 'buy' || a.type === 'buyReserved') ?? legal[0]!
    t.host.receive(cur, { t: 'act', action: act })
  }
}

test('입장: 들어온 순서대로 멤버, 알림', () => {
  const t = setup()
  assert.deepEqual(t.host.room.members.map((m) => m.id), ['host', 'b', 'c'])
  assert.ok(t.last('b').chat.some((c) => c.text.includes('c님이 들어왔어요')))
  assert.equal(t.last('c').you, 'c')
})

test('자리: 앉기, 옮기기, 이미 앉은 자리 거부', () => {
  const t = setup()
  t.host.receive('b', { t: 'sit', seat: 0 })
  t.host.receive('b', { t: 'sit', seat: 2 })
  t.host.receive('c', { t: 'sit', seat: 2 })
  assert.deepEqual(t.host.room.seats, [null, null, 'b', null])
  assert.ok(t.errors('c').some((e) => e.includes('이미')))
})

test('설정: 방장만, 인원 줄이면 자리 정리, 4인으로 늘리면 31점이 21점으로', () => {
  const t = setup()
  t.host.receive('b', { t: 'settings', settings: { seats: 2 } })
  assert.ok(t.errors('b').includes('방장만 할 수 있어요'))

  t.host.receive('host', { t: 'settings', settings: { seats: 3, options: { target: 31 } } })
  assert.equal(t.host.room.settings.options.target, 31)
  t.host.receive('c', { t: 'sit', seat: 2 })
  t.host.receive('host', { t: 'settings', settings: { seats: 2 } })
  assert.deepEqual(t.host.room.seats, [null, null]) // 3번 자리 c는 일어남

  t.host.receive('host', { t: 'settings', settings: { seats: 4 } })
  assert.equal(t.host.room.settings.options.target, 21)
  assert.ok(t.last('b').chat.some((c) => c.text.includes('31점은 4인이 고를 수 없어서 21점')))

  t.host.receive('host', { t: 'settings', settings: { seats: 5 } })
  assert.ok(t.errors('host').some((e) => e.includes('2~4')))
})

test('시작: 빈자리는 봇 켜야, 숨긴 정보는 사람마다 가려서', () => {
  const t = setup()
  t.host.receive('host', { t: 'settings', settings: { seats: 3 } })
  t.host.receive('host', { t: 'sit', seat: 0 })
  t.host.receive('b', { t: 'sit', seat: 1 })
  t.host.receive('host', { t: 'start' })
  assert.ok(t.errors('host').some((e) => e.includes('빈자리')))

  t.host.receive('host', { t: 'settings', settings: { fillBots: true } })
  t.host.receive('host', { t: 'start' })
  assert.equal(t.host.room.phase, 'playing')
  assert.deepEqual(t.host.room.players, ['host', 'b', 'bot:1'])
  // 구경꾼 c는 할 수 있는 행동이 없다
  assert.deepEqual(t.last('c').legal, [])
  const g = t.last('c').game as HanyangView
  assert.equal(typeof g.decks[1], 'number') // 더미 순서는 숫자로만
  assert.deepEqual(Object.keys(t.last('b').ranks).sort(), ['b', 'bot:1', 'host'])
})

test('판정: 차례가 아닌 사람, 구경꾼, 틀린 행동은 거부하고 상태는 그대로', () => {
  const t = setup()
  t.host.receive('host', { t: 'settings', settings: { seats: 2 } })
  t.host.receive('host', { t: 'sit', seat: 0 })
  t.host.receive('b', { t: 'sit', seat: 1 })
  t.host.receive('host', { t: 'start' })
  const cur = t.last('host').current!
  const other = cur === 'host' ? 'b' : 'host'
  const before = structuredClone(t.host.room.game)
  t.host.receive(other, { t: 'act', action: { type: 'take2', color: 'jeok' } })
  t.host.receive('c', { t: 'act', action: { type: 'take2', color: 'jeok' } })
  t.host.receive(cur, { t: 'act', action: { type: 'buy', tier: 3, slot: 0 } })
  assert.deepEqual(t.host.room.game, before)
  assert.ok(t.errors(other).length > 0 && t.errors('c').length > 0 && t.errors(cur).length > 0)
})

test('끝까지: 봇 섞어 한 판, 결과와 1등은 왕, 다시 하기로 대기실', () => {
  const t = setup()
  t.host.receive('host', { t: 'settings', settings: { seats: 4, fillBots: true, options: { target: 16 } } })
  t.host.receive('host', { t: 'sit', seat: 0 })
  t.host.receive('b', { t: 'sit', seat: 2 })
  t.host.receive('host', { t: 'start' })
  playOut(t)
  const v = t.last('b')
  assert.equal(v.phase, 'over')
  const winner = v.result!.ranking.find((r) => r.place === 1)!.player
  assert.equal(v.ranks[winner], '왕')

  t.host.receive('host', { t: 'again' })
  assert.equal(t.host.room.phase, 'lobby')
  assert.deepEqual(t.host.room.seats, ['host', null, 'b', null]) // 봇은 빠진다
})

test('자리 비움: 끊기면 표시, 방장이 봇 대신 두기, 돌아오면 돌려받음', () => {
  const t = setup()
  t.host.receive('host', { t: 'settings', settings: { seats: 2 } })
  t.host.receive('host', { t: 'sit', seat: 0 })
  t.host.receive('b', { t: 'sit', seat: 1 })
  t.host.receive('host', { t: 'start' })
  t.host.disconnect('b')
  assert.equal(t.last('host').members.find((m) => m.id === 'b')!.connected, false)

  t.host.receive('host', { t: 'standIn', player: 'b', on: true })
  let moved = 0
  for (let i = 0; i < 20 && t.host.room.phase === 'playing'; i++) {
    if (t.host.stepBot()) moved++
    else {
      const legal = t.last('host').legal
      t.host.receive('host', { t: 'act', action: legal[0] })
    }
  }
  assert.ok(moved >= 5) // b 차례는 봇이 뒀다

  t.host.receive('b', { t: 'hello', id: 'b', name: 'b', color: '#000' })
  assert.deepEqual(t.host.room.standIn, [])
  assert.equal(t.host.botTurn(), false)
})

test('구경꾼을 안 받는 방: 게임 중 새로 온 사람은 거부, 원래 멤버는 다시 들어옴', () => {
  const t = setup(['host', 'b'])
  t.host.receive('host', { t: 'settings', settings: { seats: 2, spectators: false } })
  t.host.receive('host', { t: 'sit', seat: 0 })
  t.host.receive('b', { t: 'sit', seat: 1 })
  t.host.receive('host', { t: 'start' })
  t.host.receive('z', { t: 'hello', id: 'z', name: 'z', color: '#fff' })
  assert.ok(t.errors('z')[0]!.includes('구경꾼'))
  t.host.disconnect('b')
  t.host.receive('b', { t: 'hello', id: 'b', name: 'b', color: '#fff' })
  assert.equal(t.errors('b').length, 0)
})

test('저장과 다시 열기: 방장 새로고침 뒤 같은 판, 모두 연결 끊긴 상태로 시작', () => {
  const t = setup()
  t.host.receive('host', { t: 'settings', settings: { seats: 2 } })
  t.host.receive('host', { t: 'sit', seat: 0 })
  t.host.receive('b', { t: 'sit', seat: 1 })
  t.host.receive('host', { t: 'start' })
  const saved = JSON.parse(JSON.stringify(t.saved())) as RoomState // localStorage를 거친 것처럼
  const room = resumeRoom(saved, 'host')
  assert.ok(room.members.every((m) => !m.connected))
  const sent: HostMsg[] = []
  const again = new RoomHost(room, { send: (_to, m) => sent.push(m) })
  again.receive('host', { t: 'hello', id: 'host', name: 'host', color: '#fff' })
  assert.deepEqual(again.room.game, t.host.room.game)
  assert.equal(again.viewFor('host').legal.length > 0 || again.viewFor('b').legal.length > 0, true)
})

test('방장 넘기기: 다음 사람에게 방 전체, 옛 방장 자리는 봇이 대신', () => {
  const t = setup()
  t.host.receive('host', { t: 'settings', settings: { seats: 2 } })
  t.host.receive('host', { t: 'sit', seat: 0 })
  t.host.receive('b', { t: 'sit', seat: 1 })
  t.host.receive('host', { t: 'start' })
  const h = t.host.handoff()!
  assert.equal(h.to, 'b')
  assert.equal(h.room.hostId, 'b')
  assert.deepEqual(h.room.standIn, ['host'])
  assert.ok(t.inbox.get('b')!.some((m) => m.t === 'becomeHost'))

  // 넘겨받은 쪽이 다시 연다
  const next = new RoomHost(resumeRoom(h.room, 'b'), { send: () => {} })
  next.receive('b', { t: 'hello', id: 'b', name: 'b', color: '#fff' })
  next.receive('c', { t: 'settings', settings: {} })
  assert.equal(next.viewFor('b').hostId, 'b')
})

test('넘길 사람이 없으면 넘기지 않는다', () => {
  const t = setup(['host'])
  assert.equal(t.host.handoff(), null)
})

test('손·보는 중: 저장하지 않고 다른 사람에게만 바로 넘김, 틀린 값은 버림', () => {
  const t = setup()
  const saves = t.saved()
  const before = (id: string) => (t.inbox.get(id) ?? []).length
  const [hb, cb, bb] = [before('host'), before('c'), before('b')]
  t.host.receive('b', { t: 'presence', at: { c: [1.5, -2] }, hover: '{"kind":"market"}' })
  assert.equal(t.saved(), saves) // 저장 안 함
  assert.equal(before('b'), bb) // 보낸 사람에게는 안 감
  const got = t.inbox.get('c')!.slice(cb)
  assert.deepEqual(got, [{ t: 'presence', from: 'b', at: { c: [1.5, -2] }, hover: '{"kind":"market"}' }])
  assert.equal(before('host'), hb + 1)

  t.host.receive('b', { t: 'presence', at: { c: [Number.NaN, 0] }, hover: null })
  t.host.receive('b', { t: 'presence', at: { p: 'c', l: [0.5, 0.1] }, hover: 'x'.repeat(200) })
  assert.equal(before('c'), cb + 1)
})

test('반응: 정해진 이모지만, 보낸 사람 포함 모두에게', () => {
  const t = setup()
  t.host.receive('b', { t: 'react', emoji: '👏' })
  t.host.receive('b', { t: 'react', emoji: '<script>' })
  for (const id of ['host', 'b', 'c']) {
    const reacts = t.inbox.get(id)!.filter((m) => m.t === 'react')
    assert.deepEqual(reacts, [{ t: 'react', from: 'b', emoji: '👏' }])
  }
})

test('채팅: 앞뒤 공백 정리, 길이 제한, 50줄만 보관', () => {
  const t = setup(['host', 'b'])
  t.host.receive('b', { t: 'chat', text: '   ' })
  t.host.receive('b', { t: 'chat', text: 'x'.repeat(500) })
  assert.equal(t.host.room.chat.at(-1)!.text.length, 200)
  for (let i = 0; i < 80; i++) t.host.receive('b', { t: 'chat', text: `${i}` })
  assert.equal(t.host.room.chat.length, 50)
  assert.equal(t.host.room.chat.at(-1)!.text, '79')
})
