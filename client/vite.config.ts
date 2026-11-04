import { defineConfig } from 'vite'

// 깃허브 페이지는 저장소 이름 아래 경로에 올라가므로 상대 경로로 만든다
export default defineConfig({
  base: './',
  server: { port: 5173 },
  build: { outDir: 'dist', emptyOutDir: true },
})
