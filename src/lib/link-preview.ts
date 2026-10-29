import type { CardLink } from '@/types';

/**
 * Normalizes input URL string ensuring it has http:// or https:// protocol
 */
export function normalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/**
 * Extracts hostname domain from a URL without 'www.' prefix
 */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(normalizeUrl(url));
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

/**
 * Fetches rich OpenGraph metadata for a URL (title, description, preview image, favicon, domain, siteName)
 * Features cascading fallbacks (Cloudflare API -> Microlink -> Google Favicon / Heuristics)
 */
export async function fetchLinkPreview(rawUrl: string): Promise<CardLink> {
  const url = normalizeUrl(rawUrl);
  const domain = extractDomain(url) || url;
  const defaultFavicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

  // Baseline fallback
  const fallback: CardLink = {
    url,
    title: domain,
    description: url,
    domain,
    siteName: domain,
    favicon: defaultFavicon,
    preview: undefined,
  };

  if (!url || !/^https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(url)) {
    return fallback;
  }

  // 1. Try our own edge API endpoint
  try {
    const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (res.ok) {
      const data = await res.json();
      if (data && (data.title || data.preview || data.description)) {
        return {
          url,
          title: data.title || domain,
          description: data.description || '',
          preview: data.preview || undefined,
          favicon: data.favicon || defaultFavicon,
          domain: data.domain || domain,
          siteName: data.siteName || domain,
        };
      }
    }
  } catch (err) {
    console.warn('Local link-preview endpoint failed, trying fallback...', err);
  }

  // 2. Try Microlink public metadata API
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const mRes = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (mRes.ok) {
      const json = await mRes.json();
      if (json?.status === 'success' && json.data) {
        const d = json.data;
        return {
          url,
          title: d.title || domain,
          description: d.description || '',
          preview: d.image?.url || undefined,
          favicon: d.logo?.url || defaultFavicon,
          domain: domain,
          siteName: d.publisher || domain,
        };
      }
    }
  } catch (mErr) {
    console.warn('Microlink fallback error:', mErr);
  }

  return fallback;
}
