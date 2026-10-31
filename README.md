# Plumb

Plumb is a Chrome extension for drawing guide lines over any website, so you can see its layout grid and check whether its spacing is consistent.

## Install

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick this folder.
4. Pin **Plumb** to the toolbar.

To share it or upload it to the Chrome Web Store, use `dist/plumb-1.0.0.zip`. It holds only the extension files. Rebuild it after making changes:

```bash
rm -f dist/plumb-1.0.0.zip && zip -r dist/plumb-1.0.0.zip manifest.json background.js content.js defaults.js popup.html popup.css popup.js icons/*.png
```

The source drawing for the icon is `icons/icon.svg`.

## Use

Press **⌥⇧G** (Alt+Shift+G) on any page, or open the popup and click **Draw lines**.

| In draw mode | Does |
| --- | --- |
| Click | Vertical line (hold and drag to position it) |
| ⇧ Shift + click | Horizontal line |
| ⌥ Alt + click | Lines on all 4 edges of the element under the cursor |
| ⌥ Alt + scroll | Pick the parent / child element instead |
| Drag a line | Move it |
| Right-click or double-click a line | Delete it |
| Arrow keys | Nudge the selected line 1px (⇧ for 10px) |
| Delete / Backspace | Delete the selected line |
| Z | Undo |
| C | Clear all lines |
| G | Toggle the column grid |
| H | Hide the overlay |
| Esc | Stop drawing (lines stay visible) |

While you move the cursor, it snaps to the nearest element edge, center or text edge within 6px. The tooltip says "snapped" when it does.

The gap between each pair of neighboring lines is labeled at the top and left edges. A gap whose size appears more than once (±1px) gets a filled label, so a consistent spacing system stands out.

Lines are saved per page (origin + path) and come back the next time you turn the overlay on there.

### Popup settings

- **Line color**: pick a preset or a custom color.
- **Snap to element edges** and **Show spacing**: turn either on or off.
- **Column grid**: a centered overlay with column count, gutter, max width and side margin (e.g. 12 / 24 / 1200 / 24).
- **Baseline grid**: horizontal rows every N px, for checking vertical rhythm.

You can change the shortcuts at `chrome://extensions/shortcuts`.

## Limitations

- Chrome blocks extensions on `chrome://` pages, the Chrome Web Store, and some other built-in pages.
- Vertical lines are saved in page pixels, so on a centered layout they drift if you resize the window.
- While drawing, the overlay captures clicks, so the page underneath isn't interactive. Press Esc to use the page again.
