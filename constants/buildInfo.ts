export const BUILD_MARKER = "2026-02-11-04";
export const BUILD_COMMIT = "flicker-hotfix";

export function getBuildLabel(appVersion?: string): string {
  const version = appVersion || "unknown";
  return `${version}+${BUILD_MARKER} (${BUILD_COMMIT})`;
}
