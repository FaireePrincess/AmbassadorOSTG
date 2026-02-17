export const BUILD_MARKER = "2026-02-17-01";
export const BUILD_COMMIT = "stability-ux-patch";

export function getBuildLabel(appVersion?: string): string {
  const version = appVersion || "unknown";
  return `${version}+${BUILD_MARKER} (${BUILD_COMMIT})`;
}
