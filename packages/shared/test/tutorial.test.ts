import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TutorialRun } from '../src/core/tutorial.ts'
import { hanyang, type HanyangAction, type HanyangState, type HanyangView } from '../src/hanyang/index.ts'

const run = () => new TutorialRun<HanyangState, HanyangAction, HanyangView>(hanyang, 'me', 21)

test('한양 상단 튜토리얼: 5단계, 직접 해 보기 2번 (기획서 4.8장)', () => {
  assert.equal(hanyang.tutorial.length, 5)
  assert.deepEqual(hanyang.tutorial.filter((s) => s.waitFor).map((s) => s.waitFor), ['take3', 'buy'])
  assert.ok(run().text.includes('21점'))
})

test('처음부터 끝까지: 해 보기 전에는 못 넘어가고, 해 보면 객주가 두고 내 차례로', () => {
  const r = run()
  assert.equal(r.legal().length, 0) // 설명 단계는 아무것도 못 함
  assert.equal(r.act({ type: 'take2', color: 'jeok' }).ok, false)
  assert.equal(r.next(), false) // 2단계로

  assert.equal(r.current.id, 'take')
  assert.equal(r.canNext, false)
  assert.equal(r.next(), false)
  assert.equal(r.current.id, 'take') // 해 보기 전엔 그대로
  assert.ok(r.legal().every((a) => a.type === 'take3'))
  const wrong = r.act({ type: 'take2', color: 'jeok' })
  assert.equal(wrong.ok, false)
  assert.ok(wrong.message.includes('3개'))
  const ok = r.act(r.legal()[0]!)
  assert.equal(ok.ok, true)
  assert.equal(hanyang.currentPlayer(r.state), 'me') // 객주가 두고 돌아옴
  assert.equal(r.canNext, true)
  r.next()

  // 3단계: 첫 장터 카드를 딱 살 수 있게 꾸며 둠
  assert.equal(r.current.id, 'buy')
  const buy = r.legal().find((a) => a.type === 'buy' && a.tier === 1 && a.slot === 0)
  assert.ok(buy, '첫 장터 카드를 살 수 있어야 함')
  const bought = r.state.market[1][0]!
  assert.equal(r.act(buy!).ok, true)
  assert.ok(r.state.players[0]!.cards.includes(bought))
  r.next()
  assert.equal(r.current.id, 'reserve')
  r.next()
  assert.equal(r.last, true)
  assert.equal(r.next(), true) // 끝
})

test('연습 판은 같은 순서로 늘 같게 시작한다', () => {
  assert.deepEqual(run().state, run().state)
})
