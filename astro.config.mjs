// @ts-check

import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import indexnow from 'astro-indexnow';

// https://astro.build/config
import siteConfig from './site.config.json' assert { type: 'json' };

const normalizeSiteUrl = (value) => {
  const cleaned = value.trim().replace(/\/+$/, '');
  const withProtocol = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;

  return withProtocol;
};

const indexNowConfig = siteConfig.indexNow || {};
const indexNowKey = process.env.INDEXNOW_KEY || indexNowConfig.key || '';

export default defineConfig({
  site: normalizeSiteUrl(siteConfig.domain),
  vite: {
    // @ts-ignore
    plugins: [tailwindcss()],
  },

  integrations: [
    react(),
    sitemap(),
    indexnow({ enabled: !!(indexNowConfig.enabled && indexNowKey), key: indexNowKey }),
  ],
});
