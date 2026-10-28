/**
 * Universal fetcher for Nothing Cloud API.
 * Automatically routes through /api/proxy to bypass CORS in browsers and Cloudflare Pages.
 */
export async function nothingFetch(
  targetUrl: string,
  options: RequestInit = {}
): Promise<Response> {
  const isServer = typeof window === 'undefined';

  // On server runtime with direct network access, we can fetch directly.
  // In browser, we route through /api/proxy to bypass CORS.
  if (isServer) {
    return fetch(targetUrl, options);
  }

  const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
  return fetch(proxyUrl, options);
}
