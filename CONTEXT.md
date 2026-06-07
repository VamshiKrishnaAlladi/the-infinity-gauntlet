# Context

## Glossary

### Screenshot Review Tab

An extension-owned browser tab opened after a full-page screenshot is captured into the Screenshot Library. It loads the persistent Screenshot Library Item, keeps edits active, and opens as an active tab next to the captured source tab.

### Temporary Screenshot

Legacy name for the pre-library review handoff. Temporary screenshots are no longer the normal capture flow; captured PNGs are now stored as Screenshot Library Items.

### Screenshot Library

A persistent extension-owned IndexedDB library of captured screenshots. Items are retained until the user explicitly confirms deletion.

### Screenshot Library Item

A persisted screenshot draft addressed by an opaque screenshot ID. It stores the original PNG Blob, editable Screenshot Edit objects, title, created/updated timestamps, thumbnail Blob, and approximate byte counts.

### Screenshot Edit

A change applied in the Screenshot Review Tab and autosaved with the Screenshot Library Item. The first version supports redaction, highlighting, freehand pen marks, undo, redo, and reset.

### Autosave

The Screenshot Review Tab saves title and editable object changes after 2 seconds of idle time. Thumbnail refresh runs after autosave with a separate 5-second debounce.

### Export Edited

Downloads a flattened PNG rendered from the original screenshot and current editable objects. Export flushes pending autosave before downloading and does not delete the library item.

### Export Original

Downloads the unedited original PNG from a Screenshot Library Item. The library page requires confirmation because the original may contain sensitive content.

### Close Review

Closes the Screenshot Review Tab while keeping the Screenshot Library Item. Pending autosave is flushed before close.

### Redact

A rectangle-based edit intended to obscure information before saving. The Redact tool offers Gaussian Blur and Mosaic modes.

### Blur

A Gaussian visual-obscuring redaction mode. It is available for user convenience, but the UI warns that Mosaic is safer for sensitive text.

### Mosaic

A pixelated rectangle redaction mode. It is the recommended mode for sensitive text because it destroys more visual detail than Gaussian blur.

## Flagged Ambiguities

None.
