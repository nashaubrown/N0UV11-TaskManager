-- Freehand drawing overlays on photo comments (client portal markup).
ALTER TABLE comments ADD COLUMN annotation TEXT; -- PNG data URL of the overlay
