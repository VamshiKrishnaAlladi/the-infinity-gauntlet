# ADR 0001: Screenshot Library Retention

## Status

Accepted

## Context

The screenshot workflow now stores every capture as a persistent draft. These drafts can include sensitive original screenshots, redacted edits, titles, and thumbnails. The first library version needs predictable behavior without surprising users by deleting captures before they finish reviewing or exporting them.

## Decision

Screenshot Library Items are retained until the user explicitly confirms deletion. The application will not auto-delete items by age, count, or storage usage in this version.

The library shows approximate tracked bytes and browser quota information when available so users can make informed deletion decisions.

## Consequences

Users have full control over whether a capture remains available for reopening and editing. Storage can grow over time, so retention customization, cleanup reminders, or automatic deletion controls should be considered in a future version.
