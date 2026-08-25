import { currentWorkingTreeFingerprint } from "../../../core/working-tree.js";

export function currentSidecarWorkingTreeHash(directory: string): string {
  return currentWorkingTreeFingerprint(directory);
}
