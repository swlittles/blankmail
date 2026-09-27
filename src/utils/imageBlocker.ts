/**
 * Utility functions for blocking/restoring remote images in email HTML.
 * Preserves data: and cid: URIs, only blocks remote (http, https and
 * protocol-relative `//host/...`) images.
 *
 * Runs on already-sanitized HTML (see sanitizeHtml), which strips srcset,
 * poster, background and media/input tags, so `src` and inline `url()` are
 * the remaining ways an email can load a remote resource.
 */

// http://, https:// or protocol-relative //
const REMOTE_URL = String.raw`(?:https?:)?\/\/`;

/**
 * Strip remote images from HTML by moving src to data-blocked-src.
 * Also strips remote url() references in inline styles.
 */
export function stripRemoteImages(html: string): string {
  // Replace <img src="http..."> with data-blocked-src
  let result = html.replace(
    new RegExp(String.raw`(<img\b[^>]*?)(\ssrc\s*=\s*)(["'])(${REMOTE_URL}[^"']*)\3`, "gi"),
    '$1 data-blocked-src=$3$4$3 src=$3$3',
  );

  // Replace background-image: url(http...) in inline styles
  result = result.replace(
    new RegExp(String.raw`url\(\s*(["']?)(${REMOTE_URL}[^)"']*)\1\s*\)`, "gi"),
    'url($1$1)',
  );

  return result;
}

/**
 * Restore previously blocked remote images by moving data-blocked-src back to src.
 */
export function restoreRemoteImages(html: string): string {
  return html.replace(
    new RegExp(
      String.raw`(<img\b[^>]*?)\sdata-blocked-src\s*=\s*(["'])(${REMOTE_URL}[^"']*)\2([^>]*?)\ssrc\s*=\s*(["'])\5`,
      "gi",
    ),
    '$1 src=$2$3$2$4',
  );
}

/**
 * Check if an HTML string contains any blocked images.
 */
export function hasBlockedImages(html: string): boolean {
  return new RegExp(String.raw`data-blocked-src\s*=\s*["']${REMOTE_URL}`, "i").test(html);
}
