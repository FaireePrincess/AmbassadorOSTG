import { PropsWithChildren } from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';

export default function RootHtml({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
        />
        <ScrollViewStyleReset />
        <script src="https://telegram.org/js/telegram-web-app.js?59" />
      </head>
      <body>{children}</body>
    </html>
  );
}
