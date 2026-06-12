import { brandName, manifestConfig, siteDescription } from '../lib/site-config';

export const prerender = true;
const manifest = {
  theme_color: manifestConfig.themeColor || '#0f172a',
  background_color: manifestConfig.backgroundColor || '#0f172a',
  display: manifestConfig.display || 'standalone',
  scope: manifestConfig.scope || '/',
  id: manifestConfig.id || '/',
  ...manifestConfig,
  name: manifestConfig.name || brandName,
  short_name: manifestConfig.short_name || brandName,
  description: manifestConfig.description || siteDescription || '',
};

export function GET() {
  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
