// Display version; independent of the .mifito file format version.
export const APP_VERSION = '1.9.24';

// View selection, zoom, folder permissions and undo history aren't edits.
export function workspaceSnapshot(items, ui) {
  return JSON.stringify({images:items.map(item=>({id:item.id,name:item.name,bytes:item.file.size,lastModified:item.file.lastModified,enabled:item.enabled,settings:item.settings})),ui});
}

export class WorkSaveState {
  #saved = null;
  markSaved(snapshot) { this.#saved = snapshot; }
  get checkpoint() { return this.#saved; }
  restoreCheckpoint(snapshot) { this.#saved = snapshot; }
  isDirty(snapshot, hasImages) { return hasImages && snapshot !== this.#saved; }
}
