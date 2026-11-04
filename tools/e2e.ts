// 2단계 확인 (기획서 6장): 창 없이(헤드리스 Edge) 세 사람이 실제 PeerJS로 한 판.
// 방장 새로고침 뒤 이어지는지, 방장 넘기기가 되는지도 본다.
// 실행: npm run build && npm run e2e
import { spawn } from 'node:child_process'
import { chromium, type Page } from 'playwright-core'

const PORT = 4173
// 스크린샷을 남길 폴더 (없으면 안 찍음): npm run e2e -- <폴더>
const OUT = process.argv[2]
const BASE = `http://localhost:${PORT}/`
const TIMEOUT = 60_000

function log(...args: unknown[]) {
  console.log(`[${new Date().toLocaleTimeString()}]`, ...args)
}

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(BASE)).ok) return
    } catch {
      // 아직
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('미리보기 서버가 안 뜸')
}

const view = (p: Page) => p.evaluate(() => (globalThis as any).__aibg.view)

async function enterName(p: Page, name: string) {
  await p.fill('#name', name)
  await p.click('form button[type=submit]')
}

/** 내 차례면 둔다: 살 수 있으면 사기, 아니면 첫 번째 행동. 같은 상태에서는 한 번만. */
async function autoplay(p: Page) {
  await p.evaluate(() => {
    const w = globalThis as any
    clearInterval(w.__auto)
    let lastKey = ''
    let lastAt = 0
    w.__auto = setInterval(() => {
      const v = w.__aibg.view
      if (!v || v.phase !== 'playing' || v.current !== v.you || v.legal.length === 0) return
      // 방장이 새로고침하는 순간 보낸 수는 사라질 수 있다 → 3초 지나도 그대로면 다시 보낸다
      const key = JSON.stringify(v.game)
      if (key === lastKey && Date.now() - lastAt < 3000) return
      lastKey = key
      lastAt = Date.now()
      const act = v.legal.find((a: any) => a.type === 'buy' || a.type === 'buyReserved') ?? v.legal[0]
      w.__aibg.send({ t: 'act', action: act })
    }, 150)
  })
}

async function main() {
  const server = spawn(`npx vite preview --port ${PORT} --strictPort`, {
    cwd: new URL('../client/', import.meta.url),
    shell: true,
    stdio: 'ignore',
  })
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    await waitForServer()
    const [a, b, c] = await Promise.all([0, 1, 2].map(async () => (await browser.newContext()).newPage()))
    for (const p of [a!, b!, c!]) {
      p.setDefaultTimeout(TIMEOUT)
      p.on('pageerror', (e) => log('페이지 오류:', e.message))
    }

    // 방장: 이름 → 방 만들기
    await a!.goto(BASE)
    await enterName(a!, '방장')
    await a!.click('#create-room')
    await a!.waitForFunction(() => (globalThis as any).__aibg.view?.code)
    const code: string = (await view(a!)).code
    log('방 코드', code)

    // 참가자 둘: 초대 링크로
    for (const [p, name] of [[b!, '둘째'], [c!, '셋째']] as const) {
      await p.goto(`${BASE}#/room/${code}`)
      await enterName(p, name)
    }
    await a!.waitForFunction(() => (globalThis as any).__aibg.view?.members.length === 3)
    log('세 명 입장')

    // 화면으로 설정·자리·시작
    await a!.selectOption('#set-seats', '3')
    await a!.waitForFunction(() => (globalThis as any).__aibg.view.settings.seats === 3)
    await a!.selectOption('#set-target', '16')
    for (const p of [a!, b!, c!]) {
      await p.locator('button', { hasText: '앉기' }).first().click()
      await p.waitForFunction(() => {
        const v = (globalThis as any).__aibg.view
        return v.seats.includes(v.you)
      })
    }
    // 4인으로 늘리면 31점이 막히는지 화면에서 확인
    const disabled31 = await a!.locator('#set-target option[value="31"]').evaluate((o) => (o as any).disabled)
    if (disabled31) throw new Error('3인인데 31점이 막혀 있음')
    await a!.click('button:has-text("게임 시작")')
    await Promise.all([a!, b!, c!].map((p) => p.waitForFunction(() => (globalThis as any).__aibg.view?.phase === 'playing')))
    log('게임 시작')

    // 첫 차례는 3D 테이블을 마우스로: 물건 더미 세 개를 눌러 고르고 가져오기
    const pages = [a!, b!, c!]
    const ids = await Promise.all(pages.map(async (p) => (await view(p)).you as string))
    const pageOf = async () => pages[ids.indexOf((await view(a!)).current)]!
    const clickOn = async (p: Page, pick: unknown) => {
      const pos = await p.evaluate((k) => (globalThis as any).__aibgTable.screenOf(k), pick)
      if (!pos) throw new Error(`3D에서 못 찾음: ${JSON.stringify(pick)}`)
      await p.mouse.move(pos.x, pos.y)
      await p.mouse.click(pos.x, pos.y)
    }
    let fp = await pageOf()
    await fp.waitForSelector('.table3d canvas')
    if (OUT) await fp.screenshot({ path: `${OUT}/table-start.png` })
    for (const token of ['cheong', 'jeok', 'hwang']) {
      await clickOn(fp, { kind: 'supply', token })
      await fp.waitForFunction((t) => [...(globalThis as any).document.querySelectorAll('.pickbar .tok')].some((e: any) => e.className.includes(t)), token)
    }
    const firstId = (await view(fp)).you
    await fp.click('.pickbar button:has-text("가져오기")')
    await a!.waitForFunction((f) => (globalThis as any).__aibg.view.current !== f, firstId)
    log('3D: 물건 세 개 눌러 가져옴')

    // 다음 사람: 거래처 카드를 눌러 뜬 창에서 찜하기
    fp = await pageOf()
    const who = (await view(fp)).you
    await clickOn(fp, { kind: 'market', tier: 2, slot: 1 })
    await fp.waitForSelector('.popup.on')
    await fp.click('.popup button:has-text("찜하기")')
    await fp.waitForFunction((w) => (globalThis as any).__aibg.view.game.players.find((p: any) => p.id === w).reserved.length === 1, who)
    log('3D: 카드 눌러 찜함')
    if (OUT) {
      await fp.screenshot({ path: `${OUT}/table-reserved.png` })
      await fp.keyboard.press('v')
      await fp.screenshot({ path: `${OUT}/table-top.png` })
      await fp.keyboard.press('v')
    }

    // 숨긴 정보: 다른 사람 화면에서 더미 순서는 숫자뿐
    const bv = await view(b!)
    if (typeof bv.game.decks[1] !== 'number') throw new Error('더미가 가려지지 않음')

    // 같이 하는 느낌: 방장이 카드 위에 마우스를 올리면 둘째 화면에 손과 "보는 중"
    const aId = (await view(a!)).you
    const hoverPick = { kind: 'market', tier: 1, slot: 2 }
    const pos = await a!.evaluate((k) => (globalThis as any).__aibgTable.screenOf(k), hoverPick)
    await a!.mouse.move(pos.x - 5, pos.y - 5)
    await a!.mouse.move(pos.x, pos.y, { steps: 4 })
    await b!.waitForFunction(
      ([id, key]) => (globalThis as any).__aibgTable.othersDebug().others.some((o: any) => o.id === id && o.hand && o.hover === key && o.ring),
      [aId, JSON.stringify(hoverPick)] as const,
    )
    log('손·보는 중: 방장 손이 둘째 화면 카드 위에 보임')
    if (OUT) await b!.screenshot({ path: `${OUT}/presence.png` })

    // 반응: 셋째가 👏 → 방장 화면에 말풍선
    await c!.click('.reactbar button:has-text("👏")')
    await a!.waitForFunction(() => (globalThis as any).__aibgTable.othersDebug().bubbles > 0)
    log('반응: 셋째 👏 가 방장 화면에 뜸')

    for (const p of pages) await autoplay(p)
    // 움직임: 누가 두면 다른 화면에서 토큰·카드가 날아간다
    await b!.waitForFunction(() => (globalThis as any).__aibgTable.othersDebug().flying > 0, undefined, { timeout: 30_000, polling: 20 })
    log('움직임: 토큰·카드가 날아감')
    if (OUT) await b!.screenshot({ path: `${OUT}/flying.png` })
    await a!.waitForFunction(() => (globalThis as any).__aibg.view.game.round >= 6, undefined, { timeout: 120_000 })
    log('6바퀴 진행, 방장 새로고침')
    const before = (await view(a!)).game
    await a!.reload()
    await a!.waitForFunction(() => (globalThis as any).__aibg.view?.phase === 'playing', undefined, { timeout: 90_000 })
    const after = (await view(a!)).game
    if (after.round < before.round) throw new Error('새로고침 뒤 판이 되돌아감')
    await b!.waitForFunction(() => (globalThis as any).__aibg.view?.members.every((m: any) => m.connected), undefined, { timeout: 90_000 })
    await c!.waitForFunction(() => (globalThis as any).__aibg.view?.members.every((m: any) => m.connected), undefined, { timeout: 90_000 })
    log('방장 다시 열림, 두 사람 다시 붙음')
    await autoplay(a!)

    const dump = async () => {
      for (const [i, p] of pages.entries()) {
        const d = await p.evaluate(() => {
          const w = globalThis as any
          const v = w.__aibg.view
          return {
            status: (globalThis as any).document.getElementById('net-status')?.textContent,
            host: w.__aibg.isHost,
            phase: v?.phase,
            round: v?.game?.round,
            current: v?.current?.slice(0, 4),
            you: v?.you?.slice(0, 4),
            legal: v?.legal?.length,
            members: v?.members.map((m: any) => `${m.name}:${m.connected ? 'on' : 'off'}`).join(' '),
          }
        })
        log(`  [${i}]`, JSON.stringify(d))
      }
    }
    const watch = setInterval(dump, 15_000)
    try {
      await Promise.all(pages.map((p) => p.waitForFunction(() => (globalThis as any).__aibg.view?.phase === 'over', undefined, { timeout: 180_000 })))
    } finally {
      clearInterval(watch)
    }
    const results = await Promise.all(pages.map(async (p) => JSON.stringify((await view(p)).result)))
    if (new Set(results).size !== 1) throw new Error('결과가 사람마다 다름')
    const v = await view(a!)
    log('게임 끝:', v.result.ranking.map((r: any) => `${r.place}등 ${r.score}점 ${v.ranks[r.player]}`).join(', '))
    if (!Object.values(v.ranks).includes('왕')) throw new Error('1등이 왕이 아님')
    // 신분 연출: 끝나는 순간 왕 알림 (방장은 새로고침해서 앞선 신분 변화를 못 봤을 수 있어 둘째·셋째 중 하나)
    const banners = await Promise.all([b!, c!].map((p) => p.evaluate(() => (globalThis as any).document.querySelector('.banner')?.textContent ?? '')))
    if (!banners.some((t) => t.includes('왕'))) throw new Error(`왕 알림이 안 뜸: ${JSON.stringify(banners)}`)
    log('신분 연출: 왕 알림', banners.find((t) => t.includes('왕')))
    if (OUT) await b!.screenshot({ path: `${OUT}/over.png` })

    // 다시 하기 → 대기실, 방장 넘기기
    await a!.click('button:has-text("다시 하기")')
    await b!.waitForFunction(() => (globalThis as any).__aibg.view?.phase === 'lobby')
    await a!.click('button:has-text("나가기")')
    await b!.waitForFunction(() => (globalThis as any).__aibg.isHost, undefined, { timeout: 90_000 })
    await c!.waitForFunction(
      () => {
        const v = (globalThis as any).__aibg.view
        return v && v.hostId === v.members.find((m: any) => m.name === '둘째')?.id && v.members.find((m: any) => m.name === '셋째')?.connected
      },
      undefined,
      { timeout: 90_000 },
    )
    log('방장 넘기기: 둘째가 방장, 셋째가 새 방장에게 다시 붙음')
    log('통과')
  } finally {
    await browser.close()
    server.kill()
    if (process.platform === 'win32' && server.pid) spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  }
}

main().catch((e) => {
  console.error('실패:', e.message)
  process.exit(1)
})
