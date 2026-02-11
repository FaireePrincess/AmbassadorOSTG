import { Html, Head, Body, Main, NextScript } from 'expo-router/html';

export default function RootHtml() {
  return (
    <Html lang="en">
      <Head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
        />
        <script src="https://telegram.org/js/telegram-web-app.js?59" />
      </Head>
      <Body>
        <Main />
        <NextScript />
      </Body>
    </Html>
  );
}
