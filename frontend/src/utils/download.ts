/**
 * Unified file download utility.
 * Extracts filename from Content-Disposition header or uses fallback.
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function extractFilename(
  headers: Record<string, string>,
  fallback: string
): string {
  const cd = headers["content-disposition"] || "";
  const match = cd.match(/filename\*=UTF-8''(.+)/);
  return match ? decodeURIComponent(match[1]) : fallback;
}
