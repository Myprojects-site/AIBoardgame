import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rollTurnOrder } from '../src/core/dice.ts'
import { makeRng } from '../src/core/rng.ts'

/** 정해 둔 눈을 차례로 내는 주사위 */
const fixed = (faces: number[]) => {
  let i = 0
  return () => (faces[i++]! - 1) / 6 + 0.01
}

test('높은 눈부터 차례', () => {
  const r = rollTurnOrder(['a', 'b', 'c'], fixed([2, 6, 4]))
  assert.deepEqual(r.order, ['b', 'c', 'a'])
  assert.deepEqual(r.dice, [{ player: 'a', rolls: [2] }, { player: 'b', rolls: [6] }, { player: 'c', rolls: [4] }])
})

test('같은 눈끼리만 다시 굴려 그 자리 안에서 순서를 정한다', () => {
  // a 5, b 5, c 3, d 5 → a·b·d 다시: 2, 6, 2 → b 먼저, a·d 다시: 4, 1
  const r = rollTurnOrder(['a', 'b', 'c', 'd'], fixed([5, 5, 3, 5, 2, 6, 2, 4, 1]))
  assert.deepEqual(r.order, ['b', 'a', 'd', 'c'])
  assert.deepEqual(r.dice.find((d) => d.player === 'a')!.rolls, [5, 2, 4])
  assert.deepEqual(r.dice.find((d) => d.player === 'c')!.rolls, [3])
})

test('어떤 난수든 모두 한 번씩 들어간 순서가 나온다', () => {
  for (let seed = 0; seed < 200; seed++) {
    const ids = ['a', 'b', 'c', 'd'].slice(0, 2 + (seed % 3))
    const r = rollTurnOrder(ids, makeRng(seed))
    assert.deepEqual([...r.order].sort(), [...ids].sort())
    for (const d of r.dice) for (const v of d.rolls) assert.ok(v >= 1 && v <= 6)
    // 마지막 눈은 순서대로 내림차순(같은 눈이면 다시 굴린 것)
    const last = r.order.map((p) => r.dice.find((d) => d.player === p)!.rolls)
    for (let i = 1; i < last.length; i++) assert.ok(last[i - 1]![0]! >= last[i]![0]!)
  }
})

test('난수가 늘 같아도 멈추고 자리 순서로 정한다', () => {
  const r = rollTurnOrder(['a', 'b', 'c'], () => 0.5)
  assert.deepEqual(r.order, ['a', 'b', 'c'])
  assert.equal(r.dice[0]!.rolls.length, 10)
})
