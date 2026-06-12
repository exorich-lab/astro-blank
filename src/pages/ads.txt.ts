import { adsConfig } from '../lib/site-config';

export const prerender = true;

const hasValidPublisherId = typeof adsConfig.publisherId === 'string' && adsConfig.publisherId.trim();

export function GET() {
  if (!adsConfig.enabled || !hasValidPublisherId) {
    return new Response('', {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  const provider = adsConfig.provider || 'google.com';
  const relationship = (adsConfig.relationship || 'DIRECT').toUpperCase();
  const cert = adsConfig.certificationId;
  const line = `${provider}, ${adsConfig.publisherId.trim()}, ${relationship}${
    cert ? `, ${cert}` : ''
  }`;

  return new Response(`${line}\n`, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
