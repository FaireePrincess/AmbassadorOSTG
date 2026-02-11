export const BUILD_MARKER = "2026-02-11-02";
export const BUILD_COMMIT = "333b9dd";

export function getBuildLabel(appVersion?: string): string {
  const version = appVersion || "unknown";
  return `${version}+${BUILD_MARKER} (${BUILD_COMMIT})`;
}
