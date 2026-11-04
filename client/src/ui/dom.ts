// 프레임워크 없이 화면을 그리는 작은 도우미
type Child = Node | string | number | null | undefined | false
type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined>

export function h(tag: string, attrs: Attrs = {}, ...children: (Child | Child[])[]): HTMLElement {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, '').toLowerCase(), v)
    else if (k === 'class') el.className = String(v)
    else if (k === 'style') el.setAttribute('style', String(v))
    else if (v === true) el.setAttribute(k, '')
    else if (k in el && k !== 'list') (el as unknown as Record<string, unknown>)[k] = v
    else el.setAttribute(k, String(v))
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue
    el.append(c instanceof Node ? c : String(c))
  }
  return el
}

export function button(label: string, onClick: () => void, opts: { disabled?: boolean; class?: string; title?: string } = {}) {
  return h('button', { class: opts.class ?? '', disabled: !!opts.disabled, title: opts.title, onclick: () => onClick() }, label)
}

export function dot(color: string) {
  return h('span', { class: 'dot', style: `background:${color}` })
}

/** 같은 JSON이면 같은 행동 (규칙 모듈의 행동은 순수 데이터) */
export const sameAction = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
