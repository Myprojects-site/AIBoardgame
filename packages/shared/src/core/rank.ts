// 신분 아바타 (기획서 3.5장). 진행도 = 점수 ÷ 목표 점수.
export const RANKS = ['천민', '상민', '중인', '양반', '왕'] as const
export type Rank = (typeof RANKS)[number]

const STEPS: [number, Rank][] = [
  [0.75, '양반'],
  [0.5, '중인'],
  [0.25, '상민'],
]

export function rankOf(progress: number, winner: boolean): Rank {
  if (winner) return '왕'
  for (const [min, rank] of STEPS) if (progress >= min) return rank
  return '천민'
}
