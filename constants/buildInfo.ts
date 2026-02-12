export const BUILD_MARKER = "2026-02-12-13";
export const BUILD_COMMIT = "web-onclick-fallback";

export function getBuildLabel(appVersion?: string): string {
  const version = appVersion || "unknown";
  return `${version}+${BUILD_MARKER} (${BUILD_COMMIT})`;
}
