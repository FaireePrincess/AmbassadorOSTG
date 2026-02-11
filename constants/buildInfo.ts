export const BUILD_MARKER = "2026-02-11-05";
export const BUILD_COMMIT = "img-web";

export function getBuildLabel(appVersion?: string): string {
  const version = appVersion || "unknown";
  return `${version}+${BUILD_MARKER} (${BUILD_COMMIT})`;
}
