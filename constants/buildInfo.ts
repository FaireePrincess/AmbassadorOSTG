export const BUILD_MARKER = "2026-02-11-07";
export const BUILD_COMMIT = "sorts-feed";

export function getBuildLabel(appVersion?: string): string {
  const version = appVersion || "unknown";
  return `${version}+${BUILD_MARKER} (${BUILD_COMMIT})`;
}
