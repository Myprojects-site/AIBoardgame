# 보드게임 사랑방 — 작업 기준

친구들이 3D 테이블에 둘러앉아 미니 보드게임을 하는 웹사이트. 첫 게임은 조선 시전 상인 테마의 확대 재생산 카드 게임 「한양 상단」. 지인 2~4명용.

- 기획서: `docs/기획서.md` (지시할 때 "기획서 3.4장대로"처럼 장 번호로 가리킨다)
- 개발 단계: 기획서 6장. 한 단계 = 한 세션. 만든 뒤 실행해서 확인하고 커밋한다.

## 실행

- Node 24 이상 (`.ts`를 그대로 실행한다. 빌드 단계 없음)
- `npm test` — 규칙 테스트 (node:test)
- `npm run typecheck` — 타입 확인
- `npm run cards` — 카드 표 다시 만들기 (`tools/make_cards.ts` → `data/cards.gen.ts`)
- `npm run sim -- 300` — 봇 밸런스 시뮬레이션 (기획서 4.6장)

## 폴더

```
packages/shared/   규칙 모듈. 서버(판정)·클라이언트(미리보기)·시뮬레이션이 같이 쓴다
  src/core/        모든 게임 공통: GameRules 모양, 시드 난수
  src/hanyang/     한양 상단: constants(수치), types, rules, bot, data/
  test/
server/            (2단계) 로비·방·판정·재접속, Socket.IO
client/            (3단계) Vite + Three.js 테이블
tools/             카드 표 생성, 시뮬레이션, 그림 정리
assets/            최종 그림 / assets_src/ 바나나 프로 원본
docs/              기획 문서
```

## 코딩 규칙

- TypeScript strict. Node가 타입을 지우고 바로 실행하므로 `enum`·`namespace` 금지(`erasableSyntaxOnly`), import에 `.ts` 확장자를 붙이고, 타입만 가져올 때는 `import type`.
- 규칙 모듈은 순수 함수. `apply`는 상태를 바꾸지 않고 새 상태를 돌려주며, 틀린 행동은 `IllegalAction`을 던진다. 난수는 `setup`의 시드로만.
- 수치는 `constants.ts`의 `RULES`에 모은다. 카드 표는 `cards.gen.ts`를 직접 고치지 말고 `tools/make_cards.ts`를 고쳐 다시 만든다.
- 규칙이나 수치를 바꾸면 `npm test`와 `npm run sim`을 돌리고, 바뀐 결과를 기획서 4.6장에 적는다.
- 카드 id(`t2_jeok_3`)는 그림 파일 이름과 맞으니 바꾸지 않는다.
- 주석은 한국어로, "왜"가 필요한 곳에만 짧게.

## 저작권 기준 (기획서 8장)

장르의 뼈대(토큰 모으기, 영구 할인, 단계별 카드, 조건 보너스 타일)만 쓴다. 이름·그림·카드 비용 표·보너스 조건·수치는 이 프로젝트 것으로 만들고, 다른 게임의 표를 옮겨 오지 않는다.

## 작업 기록

- 11/4 만든 것: 기획서, 프로젝트 뼈대, 한양 상단 규칙 모듈(테스트 14개), 카드 85장·명사 10명, 봇, 밸런스 시뮬레이션. 선 플레이어 보정(뒷자리 시작 물건), 카드 75→85장, 명사 조건 조정.
- 11/4 결정: 4인은 목표 31점을 못 고른다(카드 소진 30%). 인원별로 막는 값은 `OptionSpec.choices[].players`로 표시하고 `choiceAllowed()`로 확인한다.
- 11/4 남은 문제: 5점 대상단이 덜 팔림(사람 테스트에서 확인), 선택 규칙(4.7장) 미구현, 튜토리얼 데이터는 5단계에서.
