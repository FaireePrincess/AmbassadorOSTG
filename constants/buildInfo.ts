export const BUILD_MARKER = "2026-02-12-10";
export const BUILD_COMMIT = "post-reset-cleanup-web-tabs";

export function getBuildLabel(appVersion?: string): string {
  const version = appVersion || "unknown";
  return `${version}+${BUILD_MARKER} (${BUILD_COMMIT})`;
}
