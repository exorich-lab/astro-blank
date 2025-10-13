// @ts-check

import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import autoFavicon from 'astro-auto-favicon';

// https://astro.build/config
export default defineConfig({
  vite: {
    // @ts-ignore
    plugins: [tailwindcss()],
  },

  integrations: [
    react(),
    autoFavicon({
      siteTitle: 'Awesome Site',    // Название вашего сайта
      backgroundColor: '#4f46e5',       // Цвет фона фавиконки
      textColor: '#ffffff',             // Цвет буквы
      borderRadius: 8                   // Радиус скругления углов
    })
  ],
});
