import React, { useState } from 'react';

/**
 * Renders a scan preview image with absolutely-positioned bounding-box
 * overlays for each detected stamp region. The bounding boxes come from
 * the AI service's `stampAnalysis.stampRegions[]` (Tier-3 #14) and are
 * expressed in pixel coordinates on the preprocessed image, so we
 * normalize them against the rendered `<img>`'s natural dimensions.
 *
 * Boxes are color-coded by detected stamp color:
 *   - red  → red border (most common for Nepali government docs)
 *   - blue → blue border
 *   - both → amber border (two-color documents)
 * Hovering a box shows circularity + confidence as a native tooltip.
 *
 * Reused on both the registration form (`DocumentChecklistItem`) and the
 * officer dashboard's `ScanDetailRow` so officers see the same overlay
 * whether the file is being registered or has been registered.
 *
 * Props:
 *  - src (string) — data URL or blob URL for the scan preview
 *  - stampAnalysis (object|null) — the full AI service stampAnalysis blob
 *  - alt (string) — accessibility label for the image
 *  - className (string) — extra classes for the outer wrapper
 *  - overlayClassName (string) — extra classes for the box overlays
 */
export function StampOverlayImage({ src, stampAnalysis, alt, className, overlayClassName }) {
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const regions = Array.isArray(stampAnalysis?.stampRegions) ? stampAnalysis.stampRegions : [];
  const color = stampAnalysis?.stampColor;

  // Color-coded border so officers can distinguish red vs. blue stamps at a glance.
  const borderClass =
    color === 'red' ? 'border-red-500'
    : color === 'blue' ? 'border-blue-500'
    : color === 'both' ? 'border-amber-500'
    : 'border-emerald-500';

  const confidence = Math.round((stampAnalysis?.stampConfidence || 0) * 100);

  return (
    <div className={`relative inline-block ${className || ''}`}>
      <img
        src={src}
        alt={alt}
        onLoad={(e) => setImgSize({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
        className="block max-w-full h-auto rounded-lg border border-border bg-white"
      />
      {imgSize.w > 0 && imgSize.h > 0 && regions.map((r, i) => {
        const bb = r.boundingBox || {};
        // Normalize pixel coordinates to percentages so the overlay tracks
        // the rendered image regardless of how the browser scales it.
        const left = (bb.x / imgSize.w) * 100;
        const top = (bb.y / imgSize.h) * 100;
        const width = (bb.w / imgSize.w) * 100;
        const height = (bb.h / imgSize.h) * 100;
        const circPct = Math.round((r.circularity || 0) * 100);
        const stampNumber = i + 1;
        return (
          <div
            key={i}
            className={`absolute border-2 ${borderClass} ${overlayClassName || ''}`}
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: `${width}%`,
              height: `${height}%`,
              boxShadow: '0 0 0 1px rgba(255,255,255,0.65)',
              borderRadius: '4px',
              pointerEvents: 'auto',
            }}
            title={`Stamp #${stampNumber} · ${circPct}% circularity · ${confidence}% confidence`}
            aria-label={`Detected stamp region ${stampNumber}, ${circPct} percent circularity, ${confidence} percent confidence`}
          />
        );
      })}
    </div>
  );
}

export default StampOverlayImage;
