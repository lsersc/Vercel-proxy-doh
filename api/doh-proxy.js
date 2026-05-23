/**
 * Vercel Edge Function that forwards requests based on path instead of subdomain
 * Example: doh.example.com/google/query-dns → dns.google/dns-query
 * Supports configuration via Vercel Environment Variables
 */
// 默认路径映射（确保无空值）
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

const HOMEPAGE_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DoH 转发代理</title>
  <style>
    body { font-family: sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
    h1 { color: #f6821f; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 4px; }
    pre { background: #f8f8f8; padding: 1rem; border-radius: 5px; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>DoH 转发代理服务</h1>
  <p>可用地址：</p>
  <ul>
    <li>Google：<code>/google/query-dns</code></li>
    <li>Cloudflare：<code>/cloudflare/query-dns</code></li>
  </ul>
</body>
</html>`;

// 读取映射配置（加容错）
function getPathMappings() {
  try {
    if (process.env.DOMAIN_MAPPINGS && typeof process.env.DOMAIN_MAPPINGS === 'string') {
      return JSON.parse(process.env.DOMAIN_MAPPINGS);
    }
  } catch (e) {
    console.error('配置解析失败，使用默认配置', e);
  }
  return DEFAULT_PATH_MAPPINGS;
}

// 返回主页
function serveHomepage() {
  return new Response(HOMEPAGE_HTML, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// ✅ 关键：校验 URL 合法性，防止崩溃
function isValidUrl(urlStr) {
  try {
    new URL(urlStr);
    return true;
  } catch {
    return false;
  }
}

export default async function (request) {
  const url = new URL(request.url);
  const path = url.pathname;
  const queryString = url.search;

  // 根路径/首页直接返回主页
  if (path === '/' || path === '/index.html') {
    return serveHomepage();
  }

  const pathMappings = getPathMappings();
  const pathPrefix = Object.keys(pathMappings).find(prefix => path.startsWith(prefix));

  if (!pathPrefix) return serveHomepage();

  const mapping = pathMappings[pathPrefix];
  const targetDomain = mapping.targetDomain;
  let remainingPath = path.slice(pathPrefix.length);

  // 路径映射替换
  let targetPath = remainingPath;
  for (const [src, dest] of Object.entries(mapping.pathMapping)) {
    if (remainingPath.startsWith(src)) {
      targetPath = remainingPath.replace(src, dest);
      break;
    }
  }

  // ✅ 关键：拼接时去重斜杠，避免 https:///xxx
  const cleanPath = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
  const newUrl = `https://${targetDomain}${cleanPath}${queryString}`;

  // ✅ 关键：非法 URL 直接返回 400，不崩溃
  if (!isValidUrl(newUrl)) {
    return new Response('Invalid DoH URL', { status: 400 });
  }

  // 转发请求
  try {
    const newRequest = new Request(newUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'follow',
    });
    return await fetch(newRequest);
  } catch (e) {
    console.error('转发失败：', e);
    return new Response('Proxy Error', { status: 502 });
  }
}
