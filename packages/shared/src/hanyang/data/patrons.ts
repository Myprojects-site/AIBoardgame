import type { PatronDef } from '../types.ts'

// 명사 방문 타일 (기획서 4.3장). 조건 모양을 여러 가지로, 어려울수록 점수를 높게.
export const PATRONS: readonly PatronDef[] = [
  { id: 'jang_yeongsil', name: '장영실', points: 2, need: { heuk: 4, cheong: 3 } },
  { id: 'heo_jun', name: '허준', points: 2, need: { hwang: 5, baek: 2 } },
  { id: 'kim_hongdo', name: '김홍도', points: 2, need: { baek: 3, jeok: 3, heuk: 2 } },
  { id: 'sin_saimdang', name: '신사임당', points: 2, need: { cheong: 2, jeok: 2, hwang: 2, baek: 2, heuk: 2 } },
  { id: 'jeong_yakyong', name: '정약용', points: 3, need: { baek: 4, cheong: 2, hwang: 2 } },
  { id: 'kim_mandeok', name: '김만덕', points: 3, need: { hwang: 5, jeok: 3 } },
  { id: 'bak_jiwon', name: '박지원', points: 3, need: { jeok: 4, heuk: 3, cheong: 2 } },
  { id: 'han_seokbong', name: '한석봉', points: 3, need: { heuk: 5 } },
  { id: 'hwang_jini', name: '황진이', points: 4, need: { jeok: 5, baek: 3 } },
  { id: 'an_gyeon', name: '안견', points: 4, need: { cheong: 5, baek: 3, heuk: 2 } },
]
