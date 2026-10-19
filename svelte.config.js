import autoAdapter from '@sveltejs/adapter-auto';
import netlifyAdapter from '@sveltejs/adapter-netlify';
import vercelAdapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Pick the adapter from the build host's environment. Pinning the adapters
// (instead of adapter-auto alone) avoids it installing an outdated Vercel
// adapter that rejects newer Node versions. Anything else falls back to auto.
function pickAdapter() {
  if (process.env.VERCEL) return vercelAdapter();
  if (process.env.NETLIFY) return netlifyAdapter();
  return autoAdapter();
}

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: pickAdapter()
  }
};

export default config;
