// 거래처 카드 표를 만든다 (기획서 4.2장).
// 실행: npm run cards → packages/shared/src/hanyang/data/cards.gen.ts
//
// 단계마다 "점수 + 비용 모양" 목록을 두고, 색마다 같은 목록을 쓴다.
// 비용 색은 자기 색을 뺀 네 색을 카드마다 한 칸씩 돌려 붙여서, 어느 색 물건도 수요가 쏠리지 않게 한다.
import { writeFileSync } from 'node:fs'
import { COLORS, type Color } from '../packages/shared/src/hanyang/constants.ts'
import type { CardDef, Cost, Tier } from '../packages/shared/src/hanyang/types.ts'

interface Shape {
  points: number
  cost: number[] // 큰 수부터
}

const SHAPES: Record<Tier, Shape[]> = {
  1: [
    { points: 0, cost: [1, 1, 1] },
    { points: 0, cost: [2, 1] },
    { points: 0, cost: [1, 1, 1, 1] },
    { points: 0, cost: [2, 2] },
    { points: 0, cost: [2, 1, 1] },
    { points: 1, cost: [3, 2] },
    { points: 1, cost: [2, 2, 2] },
  ],
  2: [
    { points: 1, cost: [3, 2, 2] },
    { points: 1, cost: [2, 2, 2, 1] },
    { points: 2, cost: [4, 3] },
    { points: 2, cost: [3, 3, 2] },
    { points: 3, cost: [5, 2] },
    { points: 2, cost: [4, 2, 1] },
  ],
  3: [
    { points: 3, cost: [4, 3, 3, 3] },
    { points: 4, cost: [5, 3, 3] },
    { points: 5, cost: [6, 4] },
    { points: 4, cost: [6, 3, 2] },
  ],
}

const NAMES: Record<Color, Record<Tier, string[]>> = {
  cheong: {
    1: ['사기 행상', '옹기전', '물레 공방', '가마터 일꾼', '흙 캐는 집', '장독대 집', '그릇 수리공'],
    2: ['분원 사기장', '상감 공방', '큰 가마터', '그릇 도매상', '사옹원 납품소', '사기 그릇 객주'],
    3: ['강진 청자 상단', '분원 도자 무역', '사옹원 어용 상단', '경기 분원 관요'],
  },
  jeok: {
    1: ['포목 행상', '염색집', '누에 치는 집', '바느질 집', '댕기 장수', '베틀 집', '뽕나무 밭'],
    2: ['비단 직조소', '홍색 염방', '침선 공방', '명주 도매상', '혼수 비단전', '갓끈 공방'],
    3: ['선전 비단 시전', '연경 비단 무역', '상의원 납품 상단', '운종가 포목 상단'],
  },
  hwang: {
    1: ['약초꾼', '심마니', '약재 행상', '인삼 밭', '장터 약방', '꿀 장수', '감초 말리는 집'],
    2: ['홍삼 증포소', '개성 삼포', '내의원 약재상', '약재 도가', '약령시 객주', '산삼 객주'],
    3: ['개성 송상', '의주 만상', '동래 왜관 무역', '내의원 어용 상단'],
  },
  baek: {
    1: ['닥나무 밭', '종이 뜨는 집', '책쾌', '부채 장수', '연 장수', '지물 행상', '창호지 집'],
    2: ['지소', '지물전', '방각본 책방', '부채 공방', '필사방', '책 도매상'],
    3: ['지전 종이 시전', '교서관 납품 상단', '사행 공물 상단', '전주 한지 상단'],
  },
  heuk: {
    1: ['숯 굽는 집', '먹 장수', '붓 장수', '벼루 행상', '서당 앞 문방구', '그을음 모으는 집', '장터 대장간'],
    2: ['묵방', '필방', '벼루 공방', '대장간 도가', '철물 도매상', '붓 도매상'],
    3: ['문방사우 상단', '철물 시전', '경강 선상', '해주 먹 상단'],
  },
}

const cards: CardDef[] = []
for (const tier of [1, 2, 3] as const) {
  COLORS.forEach((color, ci) => {
    const others = COLORS.filter((c) => c !== color)
    SHAPES[tier].forEach((shape, k) => {
      const cost: Cost = {}
      shape.cost.forEach((n, i) => {
        cost[others[(ci + k + i) % others.length]!] = n
      })
      cards.push({
        id: `t${tier}_${color}_${k + 1}`,
        tier,
        color,
        points: shape.points,
        cost,
        name: NAMES[color][tier][k]!,
      })
    })
  })
}

const out = new URL('../packages/shared/src/hanyang/data/cards.gen.ts', import.meta.url)
const body = cards.map((c) => `  ${JSON.stringify(c)},`).join('\n')
writeFileSync(
  out,
  `// tools/make_cards.ts가 만든 파일. 직접 고치지 말고 스크립트를 고쳐 다시 만든다.\n` +
    `import type { CardDef } from '../types.ts'\n\n` +
    `export const CARDS: readonly CardDef[] = [\n${body}\n]\n`,
)

const sum = (t: Tier) => cards.filter((c) => c.tier === t).reduce((s, c) => s + c.points, 0)
console.log(`카드 ${cards.length}장 (점수 합 1단계 ${sum(1)}, 2단계 ${sum(2)}, 3단계 ${sum(3)})`)
