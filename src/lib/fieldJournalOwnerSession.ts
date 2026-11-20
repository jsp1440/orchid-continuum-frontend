/** True when a Field Journal sync failed because the backend rejected the owner session. */
export function isOwnerSessionRejection(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return status === 401 || status === 403;
}
