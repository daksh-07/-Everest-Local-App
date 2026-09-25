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
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Everest Local" />
        <meta
          name="description"
          content="A local services and products marketplace for discovering verified businesses, requesting services, booking work and shopping locally."
        />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <ScrollViewStyleReset />
        <script dangerouslySetInnerHTML={{__html:`(function(){try{var p=localStorage.getItem('everest-local-theme');var d=p==='DARK'||(p!=='LIGHT'&&matchMedia('(prefers-color-scheme: dark)').matches);var c=d?'#151513':'#f8f7f4';document.documentElement.style.setProperty('--everest-canvas',c);document.documentElement.style.setProperty('--everest-text',d?'#f7f1e8':'#171715');document.documentElement.style.background=c;document.documentElement.style.colorScheme=d?'dark':'light';var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',c)}catch(e){}})();`}} />
        <style dangerouslySetInnerHTML={{ __html: `
          html {
            width: 100%;
            min-height: 100%;
            min-height: 100dvh;
            -webkit-text-size-adjust: 100%;
            text-size-adjust: 100%;
            touch-action: manipulation;
            background: var(--everest-canvas, #f8f7f4);
          }

          body {
            width: 100%;
            min-width: 100%;
            min-height: 100%;
            min-height: 100dvh;
            margin: 0;
            overflow-x: hidden;
            overscroll-behavior-x: none;
            -webkit-text-size-adjust: 100%;
            text-size-adjust: 100%;
            background: var(--everest-canvas, #f8f7f4);
          }


          #root {
            width: 100%;
            min-width: 0;
            min-height: 100%;
            min-height: 100dvh;
            background: var(--everest-canvas, #f8f7f4);
          }

          #everest-chat-shell {
            min-height: 0 !important;
            height: 100dvh !important;
            max-height: 100dvh !important;
            overflow: hidden !important;
            transform: none !important;
          }

          @supports not (height: 100dvh) {
            #everest-chat-shell {
              height: 100% !important;
              max-height: 100% !important;
            }
          }

          html.android-mobile-viewport-fallback,
          html.android-mobile-viewport-fallback body {
            width: var(--everest-device-width) !important;
            min-width: var(--everest-device-width) !important;
            max-width: var(--everest-device-width) !important;
            overflow-x: hidden !important;
          }

          html.android-mobile-viewport-fallback body {
            zoom: var(--everest-mobile-compensation);
          }

          html.android-mobile-viewport-fallback #root {
            width: var(--everest-device-width) !important;
            max-width: var(--everest-device-width) !important;
            overflow-x: hidden !important;
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

          #everest-composer-shell,
          #everest-composer-shell:focus,
          #everest-composer-shell:focus-visible,
          #everest-composer-shell:focus-within,
          #everest-composer-shell *,
          #everest-composer-shell *:focus,
          #everest-composer-shell *:focus-visible,
          #everest-composer-shell textarea,
          #everest-composer-shell textarea:focus,
          #everest-composer-shell textarea:focus-visible,
          #everest-composer-shell input,
          #everest-composer-shell input:focus,
          #everest-composer-shell input:focus-visible,
          #everest-composer-shell [contenteditable="true"],
          #everest-composer-shell [contenteditable="true"]:focus,
          #everest-composer-shell [role="textbox"],
          #everest-composer-shell [role="textbox"]:focus,
          #everest-message-composer,
          #everest-message-composer:focus,
          #everest-message-composer:focus-visible,
          textarea#everest-message-composer,
          textarea#everest-message-composer:focus,
          textarea#everest-message-composer:focus-visible {
            -webkit-appearance: none !important;
            appearance: none !important;
            outline: none !important;
            outline-style: none !important;
            outline-width: 0 !important;
            outline-color: transparent !important;
            box-shadow: none !important;
            -webkit-box-shadow: none !important;
            -webkit-tap-highlight-color: transparent !important;
            -webkit-focus-ring-color: transparent !important;
            border-image: none !important;
          }

          #everest-composer-shell textarea,
          #everest-composer-shell input,
          #everest-message-composer {
            border: 0 !important;
            border-color: transparent !important;
            background: transparent !important;
            caret-color: var(--everest-text, #111) !important;
          }

          #everest-composer-shell {
            transition: border-color 180ms cubic-bezier(.2,.8,.2,1),
                        box-shadow 180ms cubic-bezier(.2,.8,.2,1),
                        transform 180ms cubic-bezier(.2,.8,.2,1);
          }

          #everest-composer-shell:focus-within {
            border-color: #d8c3a5 !important;
            box-shadow: 0 0 0 1px rgba(216,195,165,.14), 0 8px 22px rgba(0,0,0,.12) !important;
          }

          #everest-composer-shell *,
          #everest-composer-shell *:focus,
          #everest-composer-shell *:focus-visible,
          #everest-messages-search-shell *,
          #everest-messages-search-shell *:focus,
          #everest-messages-search-shell *:focus-visible {
            outline: 0 !important;
            outline-color: transparent !important;
            box-shadow: none !important;
            -webkit-box-shadow: none !important;
            -webkit-focus-ring-color: transparent !important;
            -webkit-tap-highlight-color: transparent !important;
          }

          #everest-messages-search-shell input,
          #everest-messages-search-shell input:focus,
          #everest-messages-search-shell input:focus-visible {
            -webkit-appearance: none !important;
            appearance: none !important;
            border: 0 !important;
            background: transparent !important;
          }

          [data-everest-conversation-row="true"],
          [data-everest-conversation-row="true"] * {
            -webkit-user-select: none !important;
            user-select: none !important;
            -webkit-touch-callout: none !important;
            -webkit-tap-highlight-color: transparent !important;
          }

          [data-everest-message-bubble="true"],
          [data-everest-message-bubble="true"] * {
            -webkit-user-select: none !important;
            user-select: none !important;
            -webkit-touch-callout: none !important;
            -webkit-tap-highlight-color: transparent !important;
          }

          [data-everest-message-bubble="true"] {
            touch-action: manipulation;
          }

          #everest-message-action-overlay,
          #everest-message-action-overlay * {
            -webkit-user-select: none !important;
            user-select: none !important;
            -webkit-touch-callout: none !important;
            -webkit-tap-highlight-color: transparent !important;
          }

          #everest-search-input,
          #everest-search-input:focus,
          #everest-search-input:focus-visible,
          input#everest-search-input,
          input#everest-search-input:focus,
          input#everest-search-input:focus-visible,
          #everest-assistant-input,
          #everest-assistant-input:focus,
          #everest-assistant-input:focus-visible,
          input#everest-assistant-input,
          input#everest-assistant-input:focus,
          input#everest-assistant-input:focus-visible {
            -webkit-appearance: none !important;
            appearance: none !important;
            outline: none !important;
            outline-width: 0 !important;
            outline-color: transparent !important;
            box-shadow: none !important;
            border: 0 !important;
            -webkit-tap-highlight-color: transparent !important;
            -webkit-focus-ring-color: transparent !important;
            caret-color: var(--everest-text, #111) !important;
          }
        ` }} />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                function normalizeAndroidViewport() {
                  var ua = navigator.userAgent || '';
                  if (!/Android/i.test(ua)) return;

                  var root = document.documentElement;
                  var screenWidth = Number(window.screen && window.screen.width) || 0;
                  var viewportWidth = Number(window.innerWidth) || 0;

                  if (screenWidth > 0 && screenWidth <= 600 && viewportWidth > screenWidth * 1.35) {
                    var compensation = viewportWidth / screenWidth;
                    root.style.setProperty('--everest-device-width', screenWidth + 'px');
                    root.style.setProperty('--everest-mobile-compensation', String(compensation));
                    root.classList.add('android-mobile-viewport-fallback');
                  } else {
                    root.classList.remove('android-mobile-viewport-fallback');
                    root.style.removeProperty('--everest-device-width');
                    root.style.removeProperty('--everest-mobile-compensation');
                  }
                }

                normalizeAndroidViewport();
                window.addEventListener('resize', normalizeAndroidViewport, { passive: true });
                window.addEventListener('orientationchange', normalizeAndroidViewport, { passive: true });
              })();
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
