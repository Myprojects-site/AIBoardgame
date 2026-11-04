// 그림 (6단계): client/public/art/manifest.json에 있는 그림만 불러온다. 없는 그림은 코드가 그린 그림 그대로.
// 그림 파일은 tools/import_art.py (npm run art)가 만든다.
const base = import.meta.env.BASE_URL

let files = new Set<string>()
const images = new Map<string, HTMLImageElement>()
const listeners = new Set<() => void>()

/** 시작할 때 한 번: 어떤 그림이 있는지 */
export const artReady: Promise<void> = fetch(`${base}art/manifest.json`)
  .then((r) => (r.ok ? r.json() : { files: [] }))
  .then((m: { files?: string[] }) => {
    files = new Set(m.files ?? [])
  })
  .catch(() => {})

export const hasArt = (path: string) => files.has(path)
export const artUrl = (path: string) => `${base}art/${path}.webp`

/** 불러온 그림. 아직 불러오는 중이면 null이고, 다 불러오면 onArt로 알린다 */
export function artImage(path: string): HTMLImageElement | null {
  if (!files.has(path)) return null
  let img = images.get(path)
  if (!img) {
    img = new Image()
    img.onload = () => {
      for (const f of listeners) f()
    }
    img.src = artUrl(path)
    images.set(path, img)
  }
  return img.complete && img.naturalWidth ? img : null
}

export function onArt(f: () => void): void {
  listeners.add(f)
}
