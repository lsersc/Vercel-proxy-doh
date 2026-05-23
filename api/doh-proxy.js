// 保留你的路径映射需求 + 彻底修复Invalid URL错误
export default async function (request) {
  try {
    const url = new URL(request.url);
    const path = url.pathname;

    // --------------------------
    // 关键修复：访问根路径 / 直接返回主页，不构造任何URL！
    // --------------------------
    if (path === '/') {
      return new Response(`
        <h1>DoH Proxy</h1>
        <p>Google: /google/dns-query</p>
        <p>Cloudflare: /cloudflare/dns-query</p>
      `, { headers: { 'Content-Type': 'text/html' } });
    }

    // 路径映射规则（你的核心需求）
    if (path.startsWith('/google/')) {
      const upstream = new URL('https://dns.google' + path.replace('/google', ''));
      return fetch(new Request(upstream, request));
    }

    if (path.startsWith('/cloudflare/')) {
      const upstream = new URL('https://cloudflare-dns.com' + path.replace('/cloudflare', ''));
      return fetch(new Request(upstream, request));
    }

    // 非法路径：返回404，不构造URL
    return new Response('Not Found', { status: 404 });

  } catch (err) {
    // 全局兜底：任何错误都不崩溃
    console.error('Error:', err);
    return new Response('Proxy Error', { status: 500 });
  }
}
