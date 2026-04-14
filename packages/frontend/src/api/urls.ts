// Central helper for backend asset URLs
// In dev: uses localhost:3001 (via Vite proxy for /uploads, /avatars)
// In production: uses VITE_API_URL base (strip /api/v1 suffix)

const backendBase = (() => {
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (!apiUrl) return ''; // dev: use relative URLs (Vite proxy handles /uploads)
  // Strip trailing /api/v1 or /api to get base
  return apiUrl.replace(/\/api(\/v\d+)?$/, '');
})();

export function uploadUrl(storedFilename: string): string {
  if (!storedFilename) return '';
  if (storedFilename.startsWith('http')) return storedFilename;
  return `${backendBase}/uploads/${storedFilename}`;
}

export function avatarUrl(path: string): string {
  if (!path) return '';
  // path may already be absolute or relative
  if (path.startsWith('http')) return path;
  return `${backendBase}${path}`;
}

/**
 * Route a document image through the backend proxy.
 * This avoids 404/auth issues when the Cloudinary direct URL fails.
 */
export function imageProxyUrl(imageId: string): string {
  return `${backendBase}/api/v1/documents/images/proxy/${imageId}`;
}
