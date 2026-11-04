// 그림 목록 만들기 (기획서 5장, 6단계).
// 실행: npm run art:list → tools/art_spec.json (정리 스크립트·화면이 읽음), docs/그림_목록.md (그릴 목록·프롬프트)
// 카드 이름은 게임 데이터에서 가져오므로 카드 표를 바꾸면 이것도 다시 돌린다.
import { writeFileSync } from 'node:fs'
import { CARDS, COLORS, PATRONS, TIER_NAMES, TOKEN_NAMES, TOKENS } from '../packages/shared/src/hanyang/index.ts'

interface ArtSpec {
  path: string // assets_src/<path>.png → client/public/art/<path>.png
  size: [number, number] // 게임에 들어가는 도트 크기 (가로, 세로)
  group: string
  title: string
  subject: string // 바나나 프로 프롬프트에 넣을 내용
  round?: boolean // 둥글게 잘라 바깥을 투명하게 (토큰)
  tile?: boolean // 이어 붙여 깔 무늬
}

// 모든 그림에 붙이는 공통 화풍 (프롬프트 끝에 붙인다)
const STYLE =
  '16-bit pixel art, chunky clearly visible pixels, limited warm palette, Joseon-era Korea, hanji paper tones, clean dark outlines, no text, no letters'

const COLOR_EN: Record<string, string> = {
  cheong: 'celadon green-blue ceramics',
  jeok: 'red silk fabric',
  hwang: 'golden ginseng roots',
  baek: 'white hanji paper',
  heuk: 'black ink sticks and brushes',
  yeop: 'bronze coin with a square hole (sangpyeong tongbo)',
}

const specs: ArtSpec[] = []

// 거래처 카드: 공방·대상단은 한 장씩, 장터는 색마다 한 장 (기획서 9장 결정)
for (const c of CARDS.filter((c) => c.tier >= 2)) {
  specs.push({
    path: `cards/${c.id}`,
    size: [64, 48],
    group: `카드 · ${TIER_NAMES[c.tier]}`,
    title: `${c.name} (${TOKEN_NAMES[c.color]})`,
    subject: `a Joseon-era ${c.tier === 3 ? 'grand merchant guild scene' : 'craft workshop scene'}: "${c.name}", featuring ${COLOR_EN[c.color]}, wide 4:3 scene`,
  })
}
for (const color of COLORS) {
  specs.push({
    path: `cards/t1_${color}`,
    size: [64, 48],
    group: '카드 · 장터 (색마다 1장)',
    title: `장터 ${TOKEN_NAMES[color]} (${CARDS.filter((c) => c.tier === 1 && c.color === color).map((c) => c.name).join(', ')})`,
    subject: `a small Joseon-era market stall selling ${COLOR_EN[color]}, wide 4:3 scene`,
  })
}
for (const tier of [1, 2, 3] as const) {
  specs.push({
    path: `backs/t${tier}`,
    size: [72, 100],
    group: '카드 뒷면',
    title: `${TIER_NAMES[tier]} 뒷면`,
    subject: `the back of a playing card, symmetric traditional Korean dancheong pattern, ${['', 'brown', 'purple', 'deep blue'][tier]} main color, portrait 18:25`,
  })
}
for (const t of TOKENS) {
  specs.push({
    path: `tokens/${t}`,
    size: [32, 32],
    group: '물건 토큰 (위에서 본 동그란 패)',
    title: TOKEN_NAMES[t],
    subject: `a round game token seen from directly above, showing ${COLOR_EN[t]}, centered, plain background`,
    round: true,
  })
}
for (const p of PATRONS) {
  specs.push({
    path: `patrons/${p.id}`,
    size: [64, 64],
    group: '명사 초상',
    title: p.name,
    subject: `portrait bust of ${p.name}, a famous Joseon-era historical figure, facing front, plain background`,
  })
}
specs.push(
  { path: 'guide/gaekju', size: [64, 64], group: '안내 캐릭터', title: '객주 (튜토리얼)', subject: 'portrait bust of a friendly Joseon-era merchant innkeeper (gaekju), smiling, facing front, plain background' },
  { path: 'room/floor', size: [64, 64], group: '사랑방 (이어 붙이는 무늬)', title: '장판 바닥', subject: 'seamless tileable texture of a yellow oiled-paper ondol floor (jangpan), top-down', tile: true },
  { path: 'room/wall', size: [64, 64], group: '사랑방 (이어 붙이는 무늬)', title: '창호지 벽', subject: 'seamless tileable texture of a hanji paper wall with wooden lattice frame', tile: true },
  { path: 'room/table', size: [64, 64], group: '사랑방 (이어 붙이는 무늬)', title: '상 나뭇결', subject: 'seamless tileable texture of warm brown wooden table top grain, top-down', tile: true },
)

const root = new URL('../', import.meta.url)
writeFileSync(new URL('tools/art_spec.json', root), JSON.stringify({ style: STYLE, items: specs }, null, 2) + '\n')

// 사람이 보는 목록
const groups = [...new Set(specs.map((s) => s.group))]
const md = [
  '# 그림 목록 (6단계)',
  '',
  '> `npm run art:list`가 만든 파일. 직접 고치지 말고 `tools/art_list.ts`를 고친다.',
  '',
  `모두 ${specs.length}장. 아무 순서로, 몇 장씩 나눠 넣어도 된다 — 없는 그림은 지금 코드 그림으로 보인다.`,
  '',
  '## 넣는 법',
  '',
  '1. 바나나 프로로 그린 원본을 `assets_src/<파일 이름>.png`에 넣는다 (아래 표의 "파일"). jpg·webp도 된다.',
  '2. `npm run art` → 가운데를 맞는 비율로 자르고, 도트 크기로 줄이고, 색을 정리해서 `client/public/art/`에 넣는다.',
  '3. `npm run dev`로 확인, 괜찮으면 커밋·올리기.',
  '',
  '원본 크기는 상관없다(1024px 정도면 충분). 비율이 다르면 가운데를 자른다. 토큰은 동그랗게 잘린다.',
  '',
  '## 바나나 프로 프롬프트',
  '',
  '모든 그림 프롬프트 끝에 이 화풍을 붙인다 (그림체가 맞게):',
  '',
  '```',
  STYLE,
  '```',
  '',
  '예: `a small Joseon-era market stall selling red silk fabric, wide 4:3 scene, ' + STYLE + '`',
  '',
  '- 첫 장을 마음에 들게 뽑은 뒤, 그 그림을 참고 이미지로 함께 넣으면 다음 그림의 화풍이 맞는다.',
  '- 글자가 들어가면 빼 달라고 다시 요청한다 (카드 이름·점수는 게임이 따로 쓴다).',
  '',
  ...groups.flatMap((g) => {
    const rows = specs.filter((s) => s.group === g)
    return [
      `## ${g} (${rows.length}장)`,
      '',
      '| 파일 | 크기 | 무엇 | 프롬프트 내용 |',
      '|---|---|---|---|',
      ...rows.map((s) => `| \`${s.path}.png\` | ${s.size[0]}×${s.size[1]} | ${s.title} | ${s.subject} |`),
      '',
    ]
  }),
].join('\n')
writeFileSync(new URL('docs/그림_목록.md', root), md)
console.log(`그림 ${specs.length}장: tools/art_spec.json, docs/그림_목록.md`)
