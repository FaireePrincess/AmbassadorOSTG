export const BUILD_MARKER = "2026-02-11-03";
export const BUILD_COMMIT = "8df9478";

export function getBuildLabel(appVersion?: string): string {
  const version = appVersion || "unknown";
  return `${version}+${BUILD_MARKER} (${BUILD_COMMIT})`;
}
