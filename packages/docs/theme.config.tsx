import type { DocsThemeConfig } from 'nextra-theme-docs';
import React from 'react';

const config: DocsThemeConfig = {
  logo: <span style={{ fontWeight: 600 }}>contextd</span>,
  project: { link: 'https://github.com/danfarrdotcom/contextd' },
  docsRepositoryBase: 'https://github.com/danfarrdotcom/contextd/tree/main/packages/docs',
  footer: {
    content: 'contextd — the context layer for AI-assisted development',
  },
  head: (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="description" content="contextd — the context layer for AI-assisted development" />
    </>
  ),
  darkMode: true,
  nextThemes: {
    defaultTheme: 'system',
  },
};

export default config;
