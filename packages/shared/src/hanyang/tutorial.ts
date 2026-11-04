// 한양 상단 튜토리얼 (기획서 4.8장): 5단계, 1분 안쪽, 직접 해 보기 2번
import type { PlayerId, TutorialStep } from '../core/types.ts'
import { COLORS, TOKENS } from './constants.ts'
import { bonusOf, card } from './rules.ts'
import type { HanyangState } from './types.ts'

export const HANYANG_TUTORIAL: TutorialStep[] = [
  {
    id: 'goal',
    title: '목표',
    guide: '어서 오시오! 오늘부터 한양 시전에서 장사를 해 봅시다.',
    text: '목표 {target}점을 먼저 채우면 이겨요. 상 오른쪽이 오방색 물건 다섯 가지(청자·비단·인삼·한지·먹)와 엽전이에요. 엽전은 어떤 물건으로도 낼 수 있어요.',
    focus: ['supply'],
  },
  {
    id: 'take',
    title: '물건 가져오기',
    guide: '먼저 물건을 사들여 봅시다.',
    text: '서로 다른 물건 3개, 또는 같은 물건 2개를 가져와요. 물건 더미 3개를 눌러 고르고 "가져오기"를 눌러 보세요.',
    focus: ['supply'],
    waitFor: 'take3',
    hint: '서로 다른 물건 3개를 골라 "가져오기"를 눌러 보세요.',
    after: '좋소! 가져온 물건은 내 앞에 놓여요.',
  },
  {
    id: 'buy',
    title: '카드 사기와 할인',
    guide: '물건을 넉넉히 드렸소. 저 장터 카드를 사 보시오.',
    text: '카드를 눌러 "사기". 산 카드의 색만큼 다음 카드부터 싸져요(할인). 화면 아래 내 살림 막대의 +숫자가 할인이에요.',
    focus: ['market:1:0'],
    board: 'canBuy',
    waitFor: 'buy',
    hint: '화살표가 가리키는 장터 카드를 눌러 "사기"를 눌러 보세요.',
    after: '거래 성사! 이제 그 색은 늘 하나씩 덜 내요.',
  },
  {
    id: 'reserve',
    title: '외상 장부',
    guide: '탐나는 카드는 미리 찜해 두면 남이 못 사 가오.',
    text: '카드를 찜해 두고 엽전 1개를 받아요. 찜은 3장까지, 더미에서 안 보고 찜할 수도 있어요. 카드를 누르면 "찜하기"가 있어요.',
    focus: ['market:2', 'deck:2'],
  },
  {
    id: 'patron',
    title: '명사 방문',
    guide: '장영실, 허준 같은 명사가 큰 상단을 찾아온다오.',
    text: '산 카드(할인)가 명사의 조건을 채우면 차례가 끝날 때 찾아와 점수를 줘요. 점수가 오르면 신분도 올라요. 이제 시작해 볼까요?',
    focus: ['patrons'],
  },
]

/** 연습 판 꾸미기 */
export function hanyangTutorialBoard(board: string, s0: HanyangState, me: PlayerId): HanyangState {
  const s = structuredClone(s0)
  const p = s.players.find((x) => x.id === me)!
  if (board === 'canBuy') {
    // 첫 장터 카드를 딱 살 수 있게 물건을 쥐여 준다 (할인 반영)
    const c = card(s.market[1][0]!)
    const bonus = bonusOf(p)
    for (const t of TOKENS) {
      s.supply[t] += p.tokens[t]
      p.tokens[t] = 0
    }
    for (const color of COLORS) {
      const need = Math.max(0, (c.cost[color] ?? 0) - bonus[color])
      p.tokens[color] = need
      s.supply[color] -= need
    }
    s.current = s.players.indexOf(p)
    s.phase = 'play'
  }
  return s
}
