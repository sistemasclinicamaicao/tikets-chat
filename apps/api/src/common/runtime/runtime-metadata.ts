function normalizeOptional(raw: string | undefined): string | null {
  const value = raw?.trim();
  return value ? value : null;
}

export function getBuildMetadata() {
  return {
    build_git_sha: normalizeOptional(process.env.BUILD_GIT_SHA),
    build_time: normalizeOptional(process.env.BUILD_TIME),
    build_source: normalizeOptional(process.env.BUILD_SOURCE),
    node_env: normalizeOptional(process.env.NODE_ENV) ?? 'development',
  };
}
