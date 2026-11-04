// 봇끼리 여러 판을 돌려 밸런스를 본다 (기획서 4.6장).
// 실행: npm run sim -- [판 수, 기본 300]
import { makeRng } from '../packages/shared/src/core/rng.ts'
import {
  CARDS,
  COLORS,
  PATRONS,
  RULES,
  activePlayer,
  chooseAction,
  hanyang,
  type BotOptions,
  type EndReason,
  type HanyangState,
} from '../packages/shared/src/hanyang/index.ts'

const GAMES = Number(process.argv[2] ?? 300)

function play(n: number, target: number, seed: number, botFor: (seat: number) => BotOptions = () => ({})) {
  const ids = Array.from({ length: n }, (_, i) => `p${i}`)
  let s: HanyangState = hanyang.setup(ids, seed, { target })
  const rng = makeRng(seed ^ 0x9e3779b9)
  while (s.phase !== 'over') {
    const p = activePlayer(s)
    s = hanyang.apply(s, p.id, chooseAction(s, p.id, rng, botFor(s.players.indexOf(p))))
  }
  return { s, result: hanyang.result(s)! }
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`
const quantile = (xs: number[], q: number) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) * q)]!

const bought = new Map<string, number>(CARDS.map((c) => [c.id, 0]))
const patronSeen = new Map<string, number>(PATRONS.map((p) => [p.id, 0]))
const patronTaken = new Map<string, number>(PATRONS.map((p) => [p.id, 0]))

console.log(`봇 ${GAMES}판씩\n`)
console.log('인원 목표 | 차례/인 평균 (10%~90%) | 끝난 이유             | 선 승률 (자리 순서대로)     | 1등 점수')
console.log('---------+------------------------+-----------------------+-----------------------------+---------')

for (const n of [2, 3, 4]) {
  for (const target of RULES.targetChoices) {
    if (RULES.targetPlayers[target] && !RULES.targetPlayers[target]!.includes(n)) continue
    const rounds: number[] = []
    const reasons: Record<EndReason, number> = { target: 0, exhausted: 0, stall: 0, limit: 0 }
    const seatWins = new Array(n).fill(0)
    let winScore = 0
    for (let g = 0; g < GAMES; g++) {
      const { s, result } = play(n, target, g * 7919 + n * 31 + target)
      rounds.push(s.round)
      reasons[s.endReason!]++
      for (const r of result.ranking.filter((r) => r.place === 1)) {
        const idx = s.players.findIndex((p) => p.id === r.player)
        seatWins[(idx - s.first + n) % n] += 1 / result.ranking.filter((x) => x.place === 1).length
      }
      winScore += result.ranking[0]!.score
      for (const p of s.players) for (const id of p.cards) bought.set(id, bought.get(id)! + 1)
      for (const id of [...s.patrons, ...s.players.flatMap((p) => p.patrons)]) patronSeen.set(id, patronSeen.get(id)! + 1)
      for (const id of s.players.flatMap((p) => p.patrons)) patronTaken.set(id, patronTaken.get(id)! + 1)
    }
    const avg = rounds.reduce((a, b) => a + b, 0) / GAMES
    const reasonText = (['target', 'exhausted', 'stall', 'limit'] as const)
      .filter((k) => reasons[k])
      .map((k) => `${{ target: '목표', exhausted: '카드 소진', stall: '정체', limit: '한도' }[k]} ${pct(reasons[k] / GAMES)}`)
      .join(', ')
    console.log(
      `${n}인 ${String(target).padStart(2)}점 | ${avg.toFixed(1).padStart(4)} (${quantile(rounds, 0.1)}~${quantile(rounds, 0.9)})`.padEnd(37) +
        `| ${reasonText.padEnd(21)} | ${seatWins.map((w) => pct(w / GAMES).padStart(4)).join(' ').padEnd(27)} | ${(winScore / GAMES).toFixed(1)}`,
    )
  }
}

// 카드: 단계별로 가장 덜 팔린 것과 가장 많이 팔린 것
console.log('\n카드 판매 (전체 판 기준)')
for (const tier of [1, 2, 3] as const) {
  const rows = CARDS.filter((c) => c.tier === tier).map((c) => ({ c, n: bought.get(c.id)! }))
  rows.sort((a, b) => a.n - b.n)
  const show = (r: (typeof rows)[number]) => `${r.c.name}(${r.c.points}점 ${JSON.stringify(r.c.cost)}) ${r.n}`
  console.log(`  ${tier}단계 적게: ${rows.slice(0, 3).map(show).join(' / ')}`)
  console.log(`  ${tier}단계 많이: ${rows.slice(-2).map(show).join(' / ')}`)
}

console.log('\n명사 (나온 판 중 누가 데려간 비율)')
for (const p of PATRONS) {
  console.log(`  ${p.name.padEnd(5)} ${p.points}점 ${JSON.stringify(p.need).padEnd(44)} ${pct(patronTaken.get(p.id)! / Math.max(1, patronSeen.get(p.id)!))}`)
}

// 한 색 몰기: 4인 21점에서 한 사람만 한 색을 몰 때 승률 (자리 돌려 가며, 기대값 25%)
console.log('\n한 색 몰기 전략 (4인 21점, 기대 승률 25%)')
for (const focus of COLORS) {
  let wins = 0
  for (let g = 0; g < GAMES; g++) {
    const seat = g % 4
    const { s, result } = play(4, 21, 100000 + g, (i) => (i === seat ? { focus } : {}))
    const firsts = result.ranking.filter((r) => r.place === 1)
    if (firsts.some((r) => r.player === s.players[seat]!.id)) wins += 1 / firsts.length
  }
  console.log(`  ${focus.padEnd(6)} ${pct(wins / GAMES)}`)
}
