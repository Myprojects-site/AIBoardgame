// 입장(닉네임·내 색·프로필 사진)과 첫 화면(방 만들기 / 링크로 들어가기) — 기획서 2.1장
import { ROOM } from '@aibg/shared/room'
import { PLAYER_COLORS, loadMe, saveMe, type Me } from '../identity.ts'
import { photoFor, shrinkPhoto } from '../photos.ts'
import { button, h } from './dom.ts'

export function identityForm(onDone: (me: Me) => void, note?: string): HTMLElement {
  const me = loadMe()
  let color = me?.color ?? PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)]!
  const name = h('input', { id: 'name', maxlength: ROOM.nameMaxLength, placeholder: '닉네임', value: me?.name ?? '' }) as HTMLInputElement
  let photo = me?.photo
  const preview = h('img', { class: 'photo big', id: 'photo-preview', alt: '프로필 사진' }) as HTMLImageElement
  // 사진이 없으면 기본 사진(내 색 바탕 실루엣)을 보여 준다
  const drawPreview = () => (preview.src = photo ?? photoFor(me?.id ?? 'me', color))
  const file = h('input', { type: 'file', accept: 'image/*', id: 'photo-file', style: 'display:none' }) as HTMLInputElement
  const photoNote = h('span', { class: 'muted small' })
  file.addEventListener('change', async () => {
    const f = file.files?.[0]
    if (!f) return
    try {
      photo = await shrinkPhoto(f)
      photoNote.textContent = ''
    } catch {
      photoNote.textContent = '이 그림은 쓸 수 없어요'
    }
    drawPreview()
    drawRemove()
  })
  const removeSlot = h('span', {})
  const drawRemove = () =>
    removeSlot.replaceChildren(photo ? button('기본 사진으로', () => {
      photo = undefined
      drawPreview()
      drawRemove()
    }, { class: 'small' }) : '')
  drawRemove()

  const swatches = h('div', { class: 'swatches' })
  const drawSwatches = () => {
    swatches.replaceChildren(
      ...PLAYER_COLORS.map((c) =>
        h('button', {
          type: 'button', // 폼 안이라 기본이면 제출된다
          class: `swatch${c === color ? ' on' : ''}`,
          style: `background:${c}`,
          title: '내 색',
          onclick: () => {
            color = c
            drawSwatches()
            drawPreview()
          },
        }),
      ),
    )
  }
  drawSwatches()
  drawPreview()
  const submit = (e: Event) => {
    e.preventDefault()
    const n = name.value.trim()
    if (!n) return name.focus()
    onDone(saveMe(n, color, photo))
  }
  return h(
    'form',
    { class: 'card narrow', onsubmit: submit },
    h('h2', {}, '누구세요?'),
    note && h('p', { class: 'muted' }, note),
    h('div', { class: 'row' },
      preview,
      h('div', { class: 'col' },
        h('b', {}, '프로필 사진'),
        h('span', { class: 'muted small' }, '상에 앉은 내 모습으로 보여요. 안 올리면 기본 사진'),
        h('div', { class: 'row' }, button('사진 고르기', () => file.click(), { class: 'small' }), removeSlot),
        photoNote)),
    file,
    name,
    h('p', { class: 'muted' }, '내 색 — 사진 테두리와 이름표에 칠해져요'),
    swatches,
    h('button', { type: 'submit', class: 'primary' }, '들어가기'),
  )
}

export function homeScreen(me: Me, actions: { create(): void; practice(seats: number): void; join(code: string): void; rename(): void; tutorial(): void }): HTMLElement {
  const code = h('input', { id: 'join-code', maxlength: ROOM.codeLength, placeholder: '방 코드 6자리' }) as HTMLInputElement
  const join = (e: Event) => {
    e.preventDefault()
    const c = code.value.trim().toUpperCase()
    if (c.length === ROOM.codeLength) actions.join(c)
  }
  return h(
    'div',
    { class: 'card narrow' },
    h('h1', {}, 'AI 보드게임'),
    h('p', { class: 'row' }, h('img', { class: 'photo', src: me.photo ?? photoFor(me.id, me.color), alt: '' }), ` ${me.name} `, h('a', { href: '#', onclick: (e: Event) => (e.preventDefault(), actions.rename()) }, '바꾸기')),
    h('button', { class: 'primary', id: 'create-room', onclick: () => actions.create() }, '방 만들기'),
    h('form', { class: 'row', onsubmit: join }, code, h('button', { type: 'submit' }, '들어가기')),
    h('p', { class: 'muted' }, '친구가 보낸 초대 링크를 열어도 바로 들어가요.'),
    h('hr', {}),
    h('b', {}, '처음이면'),
    h('button', { id: 'open-tutorial', onclick: () => actions.tutorial() }, '튜토리얼 보기 (1분)'),
    h('hr', {}),
    h('b', {}, 'AI와 바로 하기'),
    h('p', { class: 'muted small' }, '혼자 연습하거나 시험해 볼 때. 나머지 자리는 AI가 앉아요.'),
    h('div', { class: 'row', id: 'practice' },
      ...[2, 3, 4].map((n) => h('button', { 'data-seats': n, onclick: () => actions.practice(n) }, `${n}인 (AI ${n - 1}명)`))),
  )
}
