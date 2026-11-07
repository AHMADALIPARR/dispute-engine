import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
}

export const repoRoot = fileURLToPath(new URL('..', import.meta.url))

export function startServer(root = repoRoot, port = 0) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1')
      let pathname = decodeURIComponent(url.pathname)
      if (pathname.endsWith('/')) pathname += 'index.html'
      const rel = pathname.replace(/^\/+/, '')
      if (rel.includes('\0') || rel.split('/').includes('..')) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('forbidden')
        return
      }
      const data = await readFile(join(root, rel))
      const type = TYPES[extname(rel)] || 'application/octet-stream'
      res.writeHead(200, {
        'Content-Type': type,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      })
      res.end(data)
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('not found')
    }
  })
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const address = server.address()
      resolve({
        url: `http://127.0.0.1:${address.port}/`,
        close: () => new Promise((done) => server.close(done)),
      })
    })
  })
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT || 4173)
  const running = await startServer(repoRoot, port)
  console.log(running.url)
}
