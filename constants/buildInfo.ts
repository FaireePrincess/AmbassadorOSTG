export const BUILD_MARKER = "2026-02-12-08";
export const BUILD_COMMIT = "seasons-reset-fb-feed-rank";

export function getBuildLabel(appVersion?: string): string {
  const version = appVersion || "unknown";
  return `${version}+${BUILD_MARKER} (${BUILD_COMMIT})`;
}
