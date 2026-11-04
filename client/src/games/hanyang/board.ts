// 한양 상단 글자 판. 3D 테이블이 기본이고, 글자 판은 버튼으로 바꿔 볼 수 있다(WebGL이 안 되는 기기도).
import {
  COLORS,
  TIERS,
  TIER_NAMES,
  TOKENS,
  TOKEN_NAMES,
  card,
  patron,
  type CardDef,
  type Color,
  type Cost,
  type HanyangAction,
  type HanyangView,
  type PlayerView,
  type Token,
} from '@aibg/shared/hanyang'
import { button, h, sameAction } from '../../ui/dom.ts'
import type { BoardCtx } from '../registry.ts'

// 고른 물건은 다시 그려도 남아 있어야 한다. 차례가 바뀌면 비운다.
let picked: Color[] = []
let pickedTurn = ''

const chip = (t: Token, n?: number) => h('span', { class: `tok tok-${t}` }, TOKEN_NAMES[t], n === undefined ? '' : ` ${n}`)

const costChips = (cost: Cost) => COLORS.filter((c) => cost[c]).map((c) => chip(c, cost[c]))

function bonusOf(p: PlayerView): Record<Color, number> {
  const b = { cheong: 0, jeok: 0, hwang: 0, baek: 0, heuk: 0 }
  for (const id of p.cards) b[card(id).color]++
  return b
}

function pointsOf(p: PlayerView): number {
  return p.cards.reduce((s, id) => s + card(id).points, 0) + p.patrons.reduce((s, id) => s + patron(id).points, 0)
}

function cardBox(c: CardDef, buttons: HTMLElement[]) {
  return h(
    'div',
    { class: `cardbox tier${c.tier}`, 'data-card': c.id },
    h('div', { class: 'cardtop' }, h('b', {}, c.points ? `${c.points}점` : ''), chip(c.color)),
    h('div', { class: 'cardname' }, c.name),
    h('div', { class: 'cost' }, ...costChips(c.cost)),
    h('div', { class: 'cardbtns' }, ...buttons),
  )
}

export function textBoard(ctx: BoardCtx): HTMLElement {
  const g = ctx.room.game as HanyangView
  const legal = ctx.room.legal as HanyangAction[]
  const can = (a: HanyangAction) => legal.some((l) => sameAction(l, a))
  const act = (a: HanyangAction) => ctx.act(a)
  const me = g.players.find((p) => p.id === ctx.me)
  const myTurn = ctx.room.current === ctx.me && legal.length > 0

  const turnKey = `${g.round}:${g.current}:${g.phase}`
  if (turnKey !== pickedTurn) {
    picked = []
    pickedTurn = turnKey
  }

  // 물건 가져오기
  const take3 = { type: 'take3', colors: COLORS.filter((c) => picked.includes(c)) } as HanyangAction
  const supply = h(
    'div',
    { class: 'supply' },
    ...TOKENS.map((t) => {
      if (t === 'yeop') return h('div', { class: 'pile' }, chip(t, g.supply[t]))
      const c = t as Color
      const on = picked.includes(c)
      return h(
        'div',
        { class: 'pile' },
        h('button', {
          class: `tok tok-${c}${on ? ' picked' : ''}`,
          'data-take': c,
          disabled: !myTurn || g.phase !== 'play' || g.supply[c] === 0,
          onclick: () => {
            picked = on ? picked.filter((x) => x !== c) : [...picked, c]
            ctx.redraw()
          },
        }, `${TOKEN_NAMES[c]} ${g.supply[c]}`),
        button('2개', () => act({ type: 'take2', color: c }), { disabled: !can({ type: 'take2', color: c }), class: 'small' }),
      )
    }),
    button(`고른 ${picked.length}개 가져오기`, () => act(take3), { disabled: !can(take3), class: 'primary', title: '서로 다른 물건 3개' }),
  )

  const patrons = h(
    'div',
    { class: 'patrons' },
    ...g.patrons.map((id) => {
      const p = patron(id)
      return h('div', { class: 'patron' }, h('b', {}, `${p.name} ${p.points}점`), h('div', { class: 'cost' }, ...costChips(p.need)))
    }),
  )

  const market = h(
    'div',
    { class: 'market' },
    ...[...TIERS].reverse().map((tier) =>
      h(
        'div',
        { class: 'tierrow' },
        h(
          'div',
          { class: 'deck' },
          h('b', {}, TIER_NAMES[tier]),
          h('div', {}, `더미 ${g.decks[tier]}`),
          button('찜', () => act({ type: 'reserve', tier, slot: 'deck' }), { disabled: !can({ type: 'reserve', tier, slot: 'deck' }), class: 'small' }),
        ),
        ...g.market[tier].map((id, slot) =>
          id
            ? cardBox(card(id), [
                button('사기', () => act({ type: 'buy', tier, slot }), { disabled: !can({ type: 'buy', tier, slot }), class: 'small primary' }),
                button('찜', () => act({ type: 'reserve', tier, slot }), { disabled: !can({ type: 'reserve', tier, slot }), class: 'small' }),
              ])
            : h('div', { class: 'cardbox empty' }, '빈자리'),
        ),
      ),
    ),
  )

  const players = h(
    'div',
    { class: 'players' },
    ...g.players.map((p) => {
      const bonus = bonusOf(p)
      return h(
        'div',
        { class: `player${ctx.room.current === p.id ? ' current' : ''}${p.id === ctx.me ? ' mine' : ''}` },
        h('div', { class: 'pname' }, ctx.label(p.id), h('b', { class: 'score' }, `${pointsOf(p)}점`)),
        h('div', { class: 'row small' }, '물건 ', ...TOKENS.filter((t) => p.tokens[t]).map((t) => chip(t, p.tokens[t]))),
        h('div', { class: 'row small' }, '할인 ', ...COLORS.filter((c) => bonus[c]).map((c) => chip(c, bonus[c]))),
        p.patrons.length > 0 && h('div', { class: 'small' }, '명사 ', p.patrons.map((id) => patron(id).name).join(', ')),
        p.reserved.length > 0 &&
          h(
            'div',
            { class: 'reserved' },
            ...p.reserved.map((r, index) =>
              r.card
                ? cardBox(
                    card(r.card),
                    p.id === ctx.me
                      ? [button('사기', () => act({ type: 'buyReserved', index }), { disabled: !can({ type: 'buyReserved', index }), class: 'small primary' })]
                      : [],
                  )
                : h('div', { class: 'cardbox hidden' }, '찜한 카드'),
            ),
          ),
      )
    }),
  )

  const prompt = turnPrompt(ctx)

  return h(
    'div',
    { class: 'board' },
    statusLine(ctx),
    prompt,
    h('h3', {}, '물건'),
    supply,
    h('h3', {}, '명사'),
    patrons,
    h('h3', {}, '거래처'),
    market,
    h('h3', {}, '상단'),
    players,
  )
}

export function statusLine(ctx: BoardCtx): HTMLElement {
  const g = ctx.room.game as HanyangView
  const myTurn = ctx.room.current === ctx.me && ctx.room.legal.length > 0
  return h('div', { class: 'status' }, `목표 ${g.target}점 · ${g.round}바퀴째 · `, ctx.room.current ? h('span', {}, '차례: ', ctx.label(ctx.room.current)) : '',
    myTurn ? h('b', { class: 'myturn' }, ' — 내 차례!') : '')
}

/** 행동 뒤 정리 단계(되돌리기, 명사 고르기)와 넘기기 */
export function turnPrompt(ctx: BoardCtx): HTMLElement | null {
  const g = ctx.room.game as HanyangView
  const legal = ctx.room.legal as HanyangAction[]
  const act = (a: HanyangAction) => ctx.act(a)
  const me = g.players.find((p) => p.id === ctx.me)
  const myTurn = ctx.room.current === ctx.me && legal.length > 0
  let prompt: HTMLElement | null = null
  if (myTurn && g.phase === 'discard' && me) {
    prompt = h('div', { class: 'prompt' }, '물건은 10개까지예요. 되돌려 놓을 물건을 고르세요: ',
      ...TOKENS.filter((t) => me.tokens[t]).map((t) => button(`${TOKEN_NAMES[t]} 1개`, () => act({ type: 'discard', token: t }), { class: 'small' })))
  } else if (myTurn && g.phase === 'patron') {
    prompt = h('div', { class: 'prompt' }, '명사 여러 명이 찾아왔어요. 한 명을 고르세요: ',
      ...g.patronChoices.map((id) => button(`${patron(id).name} ${patron(id).points}점`, () => act({ type: 'patron', id }), { class: 'small' })))
  } else if (myTurn && legal.length === 1 && legal[0]!.type === 'pass') {
    prompt = h('div', { class: 'prompt' }, '할 수 있는 게 없어요. ', button('넘기기', () => act({ type: 'pass' }), { class: 'small' }))
  }
  return prompt
}
