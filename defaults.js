// Shared by the popup and the content script. Assigned to globalThis (not `const`)
// so re-injecting the content script into the same page doesn't throw.
globalThis.GRID_DEFAULTS = {
  color: '#ff2d55',
  snap: true,
  spacing: true,
  columns: false,
  columnCount: 12,
  gutter: 24,
  maxWidth: 1200,
  margin: 24,
  baseline: false,
  baselineStep: 8,
};
