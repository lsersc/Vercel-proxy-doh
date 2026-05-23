/**
 * Vercel Serverless Function
 * DoH forwarding proxy — ported from Cloudflare Workers
 *
 * Path mapping examples:
 *   /google/query-dns?name=example.com  →  https://dns.google/dns-query?name=example.com
 *   /cloudflare/query-dns?name=example.com  →  https://one.one.one.one/dns-query?name=example.com
 *
 * Configure custom mappings via the DOMAIN_MAPPINGS environment variable (JSON string).
 */

// Disable Vercel's default body parser — DoH POST requests carry raw DNS wire format
export const config = {
  api: {
    bodyParser: false,
  },
};

// ─── Default path mappings ────────────────────────────────────────────────────

const DEFAULT_PATH_MAPPINGS = {
  '/google': {
    targetDomain: 'dns.google',
    pathMapping: {
      '/query-dns': '/dns-query',
    },
  },
  '/cloudflare': {
    targetDomain: 'security.cloudflare-dns.com',
    pathMapping: {
      '/query-dns': '/dns-query',
    },
  },
};

// ─── Simple homepage ──────────────────────────────────────────────────────────

const HOMEPAGE_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DoH Proxy</title>
  <style>
    body {
      font-family: system-ui, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: #f5f5f5;
    }
    .card {
      background: #fff;
      border-radius: 8px;
      padding: 2.5rem 3rem;
      box-shadow: 0 2px 12px rgba(0,0,0,.08);
      text-align: center;
      max-width: 420px;
    }
    .status { font-size: 2.5rem; margin-bottom: .5rem; }
    h1 { margin: 0 0 .5rem; font-size: 1.4rem; color: #111; }
    p  { margin: 0; color: #555; font-size: .95rem; line-height: 1.6; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: .9rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="status">✅</div>
    <h1>服务运行成功</h1>
    <p>DoH 转发代理正在正常运行。</p>
    <p style="margin-top:1rem">示例：<br>
      <code>/google/query-dns?name=example.com</code>
    </p>
  </div>
</body>
</html>`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPathMappings() {
  try {
    if (process.env.DOMAIN_MAPPINGS) {
      const parsed = JSON.parse(process.env.DOMAIN_MAPPINGS);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (err) {
    console.error('[doh-proxy] Failed to parse DOMAIN_MAPPINGS:', err.message);
  }
  return DEFAULT_PATH_MAPPINGS;
}

/** Read the raw request body as a Buffer. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Headers that must not be forwarded upstream. */
const HOP_BY_HOP = new Set([
  'host',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
]);

function buildUpstreamHeaders(reqHeaders) {
  const out = {};
  for (const [k, v] of Object.entries(reqHeaders)) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) {
      out[k] = v;
    }
  }
  return out;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // req.url contains path + query string, e.g. "/google/query-dns?name=example.com"
  const rawUrl = req.url ?? '/';
  const qIdx = rawUrl.indexOf('?');
  const pathname = qIdx === -1 ? rawUrl : rawUrl.slice(0, qIdx);
  const queryString = qIdx === -1 ? '' : rawUrl.slice(qIdx); // includes leading '?'

  // ── Homepage ──
  if (pathname === '/' || pathname === '/index.html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(HOMEPAGE_HTML);
  }

  // ── Proxy ──
  const pathMappings = getPathMappings();
  const pathPrefix = Object.keys(pathMappings).find((prefix) =>
    pathname.startsWith(prefix)
  );

  if (pathPrefix) {
    const mapping = pathMappings[pathPrefix];
    const remainingPath = pathname.slice(pathPrefix.length) || '/';

    // Apply per-path rewrite rules
    let targetPath = remainingPath;
    for (const [src, dest] of Object.entries(mapping.pathMapping)) {
      if (remainingPath.startsWith(src)) {
        targetPath = remainingPath.replace(src, dest);
        break;
      }
    }

    const targetUrl = `https://${mapping.targetDomain}${targetPath}${queryString}`;

    try {
      const hasBody = !['GET', 'HEAD'].includes(req.method.toUpperCase());
      const bodyBuffer = hasBody ? await readBody(req) : undefined;

      const upstreamRes = await fetch(targetUrl, {
        method: req.method,
        headers: buildUpstreamHeaders(req.headers),
        body: hasBody && bodyBuffer?.length ? bodyBuffer : undefined,
        redirect: 'follow',
      });

      // Forward response headers
      upstreamRes.headers.forEach((value, key) => {
        // Skip headers that Vercel/Node manages itself
        if (!['transfer-encoding', 'connection'].includes(key.toLowerCase())) {
          res.setHeader(key, value);
        }
      });

      res.status(upstreamRes.status);
      const data = await upstreamRes.arrayBuffer();
      return res.send(Buffer.from(data));
    } catch (err) {
      console.error('[doh-proxy] Upstream fetch error:', err.message);
      res.setHeader('Content-Type', 'text/plain');
      return res.status(502).send('Bad Gateway');
    }
  }

  // ── No mapping matched → show homepage ──
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(HOMEPAGE_HTML);
}
