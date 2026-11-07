let pendingAttachments: File[] = [];

/** Transfer browser File objects from the welcome screen to the newly opened chat. */
export function setPendingAttachments(files: File[]) {
  pendingAttachments = files.slice(0, 5);
}

export function takePendingAttachments() {
  const files = pendingAttachments;
  pendingAttachments = [];
  return files;
}
