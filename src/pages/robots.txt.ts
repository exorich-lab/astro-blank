import { baseUrl, robotsConfig, sitemapPath } from '../lib/site-config';

export const prerender = true;

export function GET({ request } = {}) {
  const base = request ? new URL(request.url).origin : baseUrl;
  const disallow = Array.isArray(robotsConfig.disallow) ? robotsConfig.disallow : [];
  const disallowLines = disallow
    .filter((path) => typeof path === 'string' && path.trim())
    .map((path) => `Disallow: ${path.trim()}`);

  const lines = ['User-agent: *', ...disallowLines, `Sitemap: ${new URL(sitemapPath, base).toString()}`];

  return new Response(`${lines.join('\n')}\n`, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
