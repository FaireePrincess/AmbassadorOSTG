export const BUILD_MARKER = "2026-02-12-11";
export const BUILD_COMMIT = "web-click-reliability";

export function getBuildLabel(appVersion?: string): string {
  const version = appVersion || "unknown";
  return `${version}+${BUILD_MARKER} (${BUILD_COMMIT})`;
}
