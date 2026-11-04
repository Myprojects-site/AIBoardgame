// 주사위로 차례 정하기 (모든 게임 공통). 높은 사람이 먼저, 같은 눈끼리는 그 사람들만 다시 굴린다.
import type { PlayerId } from './types.ts'

const MAX_REROLLS = 10

export interface DiceRoll {
  player: PlayerId
  rolls: number[] // 다시 굴렸으면 여러 개, 마지막이 정한 눈
}

export function rollTurnOrder(players: PlayerId[], random: () => number): { order: PlayerId[]; dice: DiceRoll[] } {
  const rolls = new Map<PlayerId, number[]>(players.map((p) => [p, []]))
  const d6 = () => 1 + Math.floor(random() * 6)
  // 같은 눈이 끝없이 나올 수는 없지만, 난수가 고장 나도 멈추게 10번까지만 다시 굴린다(그 뒤로는 자리 순서)
  const resolve = (group: PlayerId[], depth = 0): PlayerId[] => {
    if (group.length <= 1 || depth >= MAX_REROLLS) return group
    const thrown = group.map((p) => {
      const v = d6()
      rolls.get(p)!.push(v)
      return { p, v }
    })
    const faces = [...new Set(thrown.map((x) => x.v))].sort((a, b) => b - a)
    return faces.flatMap((v) => resolve(thrown.filter((x) => x.v === v).map((x) => x.p), depth + 1))
  }
  const order = resolve(players)
  return { order, dice: players.map((p) => ({ player: p, rolls: rolls.get(p)! })) }
}
