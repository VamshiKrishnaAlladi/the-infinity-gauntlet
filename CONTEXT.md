# Context

## Glossary

### Screenshot Review Tab

An extension-owned browser tab opened after a full-page screenshot is captured and before anything is saved to the filesystem. It is mandatory for the screenshot capture workflow and opens as an active tab next to the captured source tab.

### Temporary Screenshot

An unsaved captured PNG stored in extension IndexedDB for a review session. It is addressed by an opaque screenshot ID, deleted on save or cancel, deleted when the review tab closes, and removed by stale cleanup after 24 hours.

### Screenshot Edit

A session-local change applied in the Screenshot Review Tab before saving. The first version supports redaction, highlighting, freehand pen marks, undo, redo, and reset.

### Redact

A rectangle-based edit intended to obscure information before saving. The Redact tool offers Gaussian Blur and Mosaic modes.

### Blur

A Gaussian visual-obscuring redaction mode. It is available for user convenience, but the UI warns that Mosaic is safer for sensitive text.

### Mosaic

A pixelated rectangle redaction mode. It is the recommended mode for sensitive text because it destroys more visual detail than Gaussian blur.

## Flagged Ambiguities

None.
