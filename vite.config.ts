import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  plugins: [{
    name: 'tagbox-version-define',
    enforce: 'pre',
    transform(code, id) {
      if (!/\.[cm]?[jt]sx?$/.test(id) || !code.includes('__TAGBOX_VERSION__')) return null;
      return code.replace(/\b__TAGBOX_VERSION__\b/g, JSON.stringify(version));
    },
  }],
  define: { __TAGBOX_VERSION__: JSON.stringify(version) },
});
