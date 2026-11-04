import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeRng } from '../src/core/rng.ts'
import { IllegalAction, choiceAllowed } from '../src/core/types.ts'
import {
  CARDS,
  COLORS,
  RULES,
  TOKENS,
  activePlayer,
  card,
  chooseAction,
  emptyTokens,
  hanyang,
  patron,
  pointsOf,
  tokenTotal,
  type HanyangState,
} from '../src/hanyang/index.ts'

const IDS = ['a', 'b', 'c', 'd']

function start(n = 4, seed = 1, target = 21): HanyangState {
  return hanyang.setup(IDS.slice(0, n), seed, { target })
}

/** 차례를 바꿔 가며 직접 상태를 꾸밀 때 쓴다 */
function edit(s: HanyangState, f: (s: HanyangState) => void): HanyangState {
  const c = structuredClone(s)
  f(c)
  return c
}

function allTokens(s: HanyangState) {
  const sum = { ...s.supply }
  for (const p of s.players) for (const t of TOKENS) sum[t] += p.tokens[t]
  return sum
}

test('카드 표: 85장, 단계별 장수와 색 분포', () => {
  assert.equal(CARDS.length, 85)
  for (const [tier, n] of [[1, 35], [2, 30], [3, 20]] as const) {
    const cards = CARDS.filter((c) => c.tier === tier)
    assert.equal(cards.length, n)
    for (const color of COLORS) assert.equal(cards.filter((c) => c.color === color).length, n / 5)
  }
  assert.equal(new Set(CARDS.map((c) => c.id)).size, 85)
})

test('준비: 인원별 토큰 수, 뒷자리 시작 물건, 공개 카드 4장씩, 명사 인원+1', () => {
  for (const n of [2, 3, 4]) {
    const s = start(n)
    const total = allTokens(s)
    for (const c of COLORS) assert.equal(total[c], RULES.tokensPerColor[n])
    assert.equal(total.yeop, RULES.wildTokens)
    s.players.forEach((p, i) => {
      const order = (i - s.first + n) % n
      assert.equal(tokenTotal(p.tokens), RULES.startTokensBySeat[n]![order])
      assert.equal(p.tokens.yeop, 0)
    })
    for (const t of [1, 2, 3] as const) assert.equal(s.market[t].length, 4)
    assert.equal(s.patrons.length, n + 1)
  }
})

test('같은 시드면 같은 판', () => {
  assert.deepEqual(start(4, 42), start(4, 42))
  assert.notDeepEqual(start(4, 42).decks, start(4, 43).decks)
})

test('목표 점수는 고를 수 있는 값만, 4인은 31점 못 고름', () => {
  for (const n of [2, 3]) for (const t of [16, 21, 26, 31]) assert.equal(start(n, 1, t).target, t)
  for (const t of [16, 21, 26]) assert.equal(start(4, 1, t).target, t)
  assert.throws(() => start(4, 1, 31))
  assert.throws(() => start(2, 1, 20))

  const spec = hanyang.options.find((o) => o.id === 'target')!
  assert.equal(choiceAllowed(spec, 31, 4), false)
  assert.equal(choiceAllowed(spec, 31, 3), true)
})

test('차례가 아니면 행동할 수 없다', () => {
  const s = start()
  const other = s.players[(s.current + 1) % 4]!.id
  assert.deepEqual(hanyang.legalActions(s, other), [])
  assert.throws(() => hanyang.apply(s, other, { type: 'take2', color: 'jeok' }), IllegalAction)
})

test('서로 다른 물건 3개 가져오기 후 차례가 넘어간다', () => {
  const s = start()
  const me = activePlayer(s).id
  const n = hanyang.apply(s, me, { type: 'take3', colors: ['heuk', 'cheong', 'jeok'] })
  const p = n.players.find((x) => x.id === me)!
  assert.equal(p.tokens.cheong + p.tokens.jeok + p.tokens.heuk, 3)
  assert.equal(n.supply.cheong, s.supply.cheong - 1)
  assert.notEqual(n.current, s.current)
})

test('같은 물건 2개는 4개 이상 남았을 때만', () => {
  const s = edit(start(), (s) => (s.supply.hwang = 3))
  const me = activePlayer(s).id
  assert.throws(() => hanyang.apply(s, me, { type: 'take2', color: 'hwang' }), IllegalAction)
  hanyang.apply(s, me, { type: 'take2', color: 'baek' })
})

test('남은 색이 3가지 미만이면 남은 만큼만 가져온다', () => {
  const s = edit(start(), (s) => {
    s.supply.cheong = 0
    s.supply.jeok = 0
    s.supply.hwang = 0
  })
  const take = hanyang.legalActions(s, activePlayer(s).id).filter((a) => a.type === 'take3')
  assert.deepEqual(take, [{ type: 'take3', colors: ['baek', 'heuk'] }])
})

test('카드 사기: 할인 먼저, 모자라면 엽전', () => {
  const s0 = start()
  const id = s0.market[1][0]!
  const c = card(id)
  const [first, ...rest] = COLORS.filter((k) => (c.cost[k] ?? 0) > 0)
  const s = edit(s0, (s) => {
    const p = activePlayer(s)
    // 첫 색은 할인 카드 1장 + 엽전, 나머지는 물건으로
    const bonusCard = CARDS.find((x) => x.color === first && x.tier === 2)!
    p.cards.push(bonusCard.id)
    for (const k of rest) p.tokens[k] = c.cost[k]!
    p.tokens.yeop = c.cost[first!]! - 1
  })
  const me = activePlayer(s).id
  const n = hanyang.apply(s, me, { type: 'buy', tier: 1, slot: 0 })
  const p = n.players.find((x) => x.id === me)!
  assert.ok(p.cards.includes(id))
  assert.equal(tokenTotal(p.tokens), 0)
  assert.notEqual(n.market[1][0], id) // 빈자리는 더미에서 채운다
  assert.deepEqual(allTokens(n), allTokens(s))
})

test('외상 장부: 엽전 1개, 3장까지, 더미에서 찜하면 다른 사람에게 가려진다', () => {
  let s = start(2)
  const me = activePlayer(s).id
  const other = s.players.find((p) => p.id !== me)!.id
  s = hanyang.apply(s, me, { type: 'reserve', tier: 3, slot: 'deck' })
  const p = s.players.find((x) => x.id === me)!
  assert.equal(p.tokens.yeop, 1)
  assert.equal(p.reserved.length, 1)
  assert.equal(hanyang.view(s, other).players.find((x) => x.id === me)!.reserved[0]!.card, null)
  assert.notEqual(hanyang.view(s, me).players.find((x) => x.id === me)!.reserved[0]!.card, null)

  const full = edit(s, (s) => {
    s.current = s.players.findIndex((x) => x.id === me)
    s.players.find((x) => x.id === me)!.reserved.push({ card: 't1_jeok_1', blind: false }, { card: 't1_jeok_2', blind: false })
  })
  assert.ok(!hanyang.legalActions(full, me).some((a) => a.type === 'reserve'))
})

test('물건이 10개를 넘으면 10개까지 되돌린다', () => {
  let s = edit(start(), (s) => {
    activePlayer(s).tokens = { ...emptyTokens(), cheong: 4, jeok: 4 }
  })
  const me = activePlayer(s).id
  s = hanyang.apply(s, me, { type: 'take3', colors: ['hwang', 'baek', 'heuk'] })
  assert.equal(s.phase, 'discard')
  assert.equal(activePlayer(s).id, me)
  s = hanyang.apply(s, me, { type: 'discard', token: 'cheong' })
  assert.notEqual(activePlayer(s).id, me)
  assert.equal(tokenTotal(s.players.find((p) => p.id === me)!.tokens), 10)
})

test('명사: 하나면 자동, 둘 이상이면 고른다', () => {
  const s0 = start()
  const [p1, p2] = s0.patrons
  const withBonus = (ids: string[]) =>
    edit(s0, (s) => {
      const p = activePlayer(s)
      for (const id of ids) {
        for (const [color, n] of Object.entries(patron(id).need) as [string, number][]) {
          const have = p.cards.filter((c) => card(c).color === color).length
          const pool = CARDS.filter((c) => c.color === color && !p.cards.includes(c.id))
          for (let i = have; i < n; i++) p.cards.push(pool[i - have]!.id)
        }
      }
    })
  let s = withBonus([p1!])
  const me = activePlayer(s).id
  const auto = hanyang.apply(s, me, { type: 'take3', colors: ['cheong', 'jeok', 'hwang'] })
  assert.ok(auto.players.find((p) => p.id === me)!.patrons.includes(p1!))

  s = withBonus([p1!, p2!])
  const choose = hanyang.apply(s, me, { type: 'take3', colors: ['cheong', 'jeok', 'hwang'] })
  assert.equal(choose.phase, 'patron')
  const done = hanyang.apply(choose, me, { type: 'patron', id: p2! })
  assert.deepEqual(done.players.find((p) => p.id === me)!.patrons, [p2])
  assert.ok(done.patrons.includes(p1!))
})

test('목표 점수에 닿으면 그 바퀴를 마저 돌고 끝난다', () => {
  const two = CARDS.find((c) => c.tier === 2 && c.points === 2)!
  let s = edit(start(3), (s) => {
    s.current = (s.first + 1) % 3 // 바퀴 중간 사람
    const p = activePlayer(s)
    // 3단계 3·4·5점을 색 두 개에서 → 24점보다 적게, 20점 이하로 맞춘다: 5+5+4+3+3 = 20
    const t3 = CARDS.filter((c) => c.tier === 3)
    p.cards.push(...[5, 5, 4, 3, 3].map((pt, i) => t3.filter((c) => c.points === pt)[i % 2]!.id))
    p.tokens = { ...emptyTokens(), ...two.cost }
    s.market[2][0] = two.id
  })
  const me = activePlayer(s).id
  assert.equal(pointsOf(activePlayer(s)), 20)
  s = hanyang.apply(s, me, { type: 'buy', tier: 2, slot: 0 })
  assert.ok(pointsOf(s.players.find((p) => p.id === me)!) >= 21)
  assert.equal(s.endTriggered, true)
  assert.notEqual(s.phase, 'over') // 아직 바퀴가 남음
  const rng = makeRng(1)
  while (s.phase !== 'over') s = hanyang.apply(s, activePlayer(s).id, chooseAction(s, activePlayer(s).id, rng))
  assert.equal(s.endReason, 'target')
  assert.equal(s.current, s.first)
})

test('봇끼리 여러 판: 끝까지 가고 토큰 수가 보존된다', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const n = 2 + (seed % 3)
    const target = RULES.targetChoices[seed % (n === 4 ? 3 : 4)]
    let s = start(n, seed, target)
    const total = allTokens(s)
    const rng = makeRng(seed)
    let steps = 0
    while (s.phase !== 'over') {
      const me = activePlayer(s).id
      s = hanyang.apply(s, me, chooseAction(s, me, rng))
      assert.ok(++steps < 5000)
    }
    assert.deepEqual(allTokens(s), total)
    for (const p of s.players) assert.ok(tokenTotal(p.tokens) <= RULES.maxTokens)
    assert.ok(hanyang.result(s))
  }
})
