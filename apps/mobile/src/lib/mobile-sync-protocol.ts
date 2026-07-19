export const hasMobileSyncCursorRewound = (localCursor: number, serverCursor?: number) =>
  typeof serverCursor === "number" && Number.isFinite(serverCursor) && serverCursor < localCursor;

export const hasMobileSyncIdentityChanged = (localIdentity: string, serverIdentity?: string) =>
  typeof serverIdentity === "string" && serverIdentity.length > 0 && serverIdentity !== localIdentity;
