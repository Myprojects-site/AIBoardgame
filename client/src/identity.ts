// 회원가입 없이 브라우저에 저장하는 나 (기획서 2.1장).
// 주소 끝에 ?p=2 를 붙이면 저장 칸이 따로 생긴다 — 한 브라우저에서 여러 사람을 시험할 때.
const suffix = new URLSearchParams(location.search).get('p') ?? ''

export const PLAYER_COLORS = ['#c0392b', '#e67e22', '#d4a017', '#27ae60', '#16a085', '#2980b9', '#8e44ad', '#d35480']

export interface Me {
  id: string
  name: string
  color: string
}

export const storageKey = (key: string) => `aibg.${key}${suffix ? `.p${suffix}` : ''}`

// 사생활 보호 창 등에서는 저장이 막힐 수 있다
export function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(storageKey(key))
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function store(key: string, value: unknown): void {
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(value))
  } catch {
    // 저장 못 해도 이번 판은 계속된다
  }
}

export function forget(key: string): void {
  try {
    localStorage.removeItem(storageKey(key))
  } catch {
    // 무시
  }
}

export function loadMe(): Me | null {
  return load<Me>('me')
}

export function saveMe(name: string, color: string): Me {
  const me: Me = { id: loadMe()?.id ?? crypto.randomUUID(), name, color }
  store('me', me)
  return me
}

export const hostKey = (code: string) => `host.${code}`
