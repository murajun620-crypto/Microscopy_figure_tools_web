// The original label remains panelLabel for older projects and image tables.
// Additional labels have stable IDs so batch edits never target a different
// label after an image has added or removed one of its own labels.
export const MAX_PANEL_LABELS = 10;
export const PRIMARY_LABEL_ID = 'primary';
export function panelLabels(settings) {
  return [settings.panelLabel, ...(settings.additionalPanelLabels ?? [])];
}
export function panelLabelId(label, index) { return index === 0 ? PRIMARY_LABEL_ID : label.id; }
export function findPanelLabel(settings, id = PRIMARY_LABEL_ID) {
  return id === PRIMARY_LABEL_ID ? settings.panelLabel : settings.additionalPanelLabels?.find(label => label.id === id);
}
export function nextLabelAnchor(settings) {
  const used = new Set(panelLabels(settings).map(label => label.anchor));
  return ['outside-top-left', 'top-left', 'top-right', 'outside-bottom-left', 'bottom-right', 'outside-bottom-right'].find(anchor => !used.has(anchor)) ?? 'top-left';
}
