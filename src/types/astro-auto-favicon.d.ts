declare module 'astro-auto-favicon' {
  interface AutoFaviconOptions {
    siteTitle?: string;
    backgroundColor?: string;
    textColor?: string;
    borderRadius?: number;
  }

  function autoFavicon(options?: AutoFaviconOptions): any;
  export = autoFavicon;
}