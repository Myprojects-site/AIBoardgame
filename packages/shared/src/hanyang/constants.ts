// 한양 상단 수치 (기획서 4장). 수치는 여기에만 둔다.

export const COLORS = ['cheong', 'jeok', 'hwang', 'baek', 'heuk'] as const
export type Color = (typeof COLORS)[number]
export const WILD = 'yeop'
export type Token = Color | typeof WILD
export const TOKENS: readonly Token[] = [...COLORS, WILD]
export const TIERS = [1, 2, 3] as const

export const TOKEN_NAMES: Record<Token, string> = {
  cheong: '청자',
  jeok: '비단',
  hwang: '인삼',
  baek: '한지',
  heuk: '먹',
  yeop: '엽전',
}

export const TIER_NAMES = { 1: '장터', 2: '공방', 3: '대상단' } as const

export const RULES = {
  minPlayers: 2,
  maxPlayers: 4,
  tokensPerColor: { 2: 5, 3: 6, 4: 7 } as Record<number, number>,
  wildTokens: 5,
  marketSlots: 4,
  maxTokens: 10,
  maxReserved: 3,
  take2MinSupply: 4,
  extraPatrons: 1,
  // 선 플레이어가 유리해서 뒷자리는 물건을 쥐고 시작한다 (차례 순서대로). 엽전 하나는 지나쳤다.
  startTokensBySeat: { 2: [0, 1], 3: [0, 1, 1], 4: [0, 0, 1, 1] } as Record<number, number[]>,
  targetChoices: [16, 21, 26, 31],
  // 4인 31점은 카드가 떨어져 끝나는 판이 30%라 막는다 (기획서 4.5장)
  targetPlayers: { 31: [2, 3] } as Record<number, number[]>,
  defaultTarget: 21,
  // 카드가 떨어지거나 아무도 못 사는 판이 끝없이 이어지지 않게
  stallAfterRound: 10,
  stallRounds: 3,
  maxRounds: 80,
} as const
