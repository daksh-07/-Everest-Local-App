import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

// Web-only root HTML document used for static Expo Router rendering.
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="theme-color" content="#f8f7f4" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Everest Local" />
        <meta
          name="description"
          content="A local services and products marketplace for discovering verified businesses, requesting services, booking work and shopping locally."
        />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: `
          input[aria-label="Search Everest Local"],
          input[aria-label="Search Everest Local"]:focus,
          input[aria-label="Search Everest Local"]:focus-visible {
            -webkit-appearance: none !important;
            appearance: none !important;
            outline: none !important;
            outline-width: 0 !important;
            outline-color: transparent !important;
            box-shadow: none !important;
            border: 0 !important;
            -webkit-tap-highlight-color: transparent !important;
          }
        ` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
