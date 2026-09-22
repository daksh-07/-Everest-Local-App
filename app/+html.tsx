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
          content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover"
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
          html {
            width: 100%;
            min-height: 100%;
            -webkit-text-size-adjust: 100%;
            text-size-adjust: 100%;
            touch-action: manipulation;
            background: #f8f7f4;
          }

          body {
            width: 100%;
            min-width: 100%;
            min-height: 100%;
            margin: 0;
            overflow-x: hidden;
            overscroll-behavior-x: none;
            -webkit-text-size-adjust: 100%;
            text-size-adjust: 100%;
            background: #f8f7f4;
          }

          #root {
            width: 100%;
            min-width: 0;
            min-height: 100%;
          }

          input,
          textarea,
          select,
          button {
            font: inherit;
            -webkit-text-size-adjust: 100%;
            text-size-adjust: 100%;
          }

          input,
          textarea,
          select {
            font-size: 16px !important;
          }

          button,
          input,
          textarea,
          select,
          [role="button"] {
            touch-action: manipulation;
          }

          #everest-search-input,
          #everest-search-input:focus,
          #everest-search-input:focus-visible,
          input#everest-search-input,
          input#everest-search-input:focus,
          input#everest-search-input:focus-visible {
            -webkit-appearance: none !important;
            appearance: none !important;
            outline: none !important;
            outline-width: 0 !important;
            outline-color: transparent !important;
            box-shadow: none !important;
            border: 0 !important;
            -webkit-tap-highlight-color: transparent !important;
            -webkit-focus-ring-color: transparent !important;
            caret-color: #111 !important;
          }
        ` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
