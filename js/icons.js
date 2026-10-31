// Pictograms for forced-tactic badges, drawn in a 24×24 box in white on the
// badge. Cut-outs use var(--badge-bg) so they match a purple or red badge.
// A tactic without a glyph falls back to its letter.

const GLYPHS = {
  // Dinner fork: four tines joined into a curved head on a handle.
  fork: `<g fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7 3v5a5 5 0 0 0 10 0V3"/><path d="M10.3 3v6M13.7 3v6"/><path d="M12 13v8.5"/></g>`,
  // Push pin: round cap, collar and a needle, tilted.
  pin: `<g transform="rotate(35 12 12)"><g fill="#fff">
    <rect x="8" y="2.5" width="8" height="3" rx="1.5"/><path d="M10 5.5h4v5l3 3H7l3-3z"/></g>
    <path d="M12 13.5v8.5" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></g>`,
  // Shish kebab: a stick with three chunks and a pointed tip.
  skewer: `<path d="M3.5 20.5L20 4" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M20 4l1-3-3 1z" fill="#fff"/>
    <g fill="#fff"><rect x="4.6" y="13.4" width="6" height="6" rx="1.6" transform="rotate(45 7.6 16.4)"/>
    <circle cx="12" cy="12" r="3"/><rect x="13.4" y="4.6" width="6" height="6" rx="1.6" transform="rotate(45 16.4 7.6)"/></g>`,
  // Magnifying glass, for discovered attacks and checks.
  discovered: `<circle cx="10" cy="10" r="6" fill="none" stroke="#fff" stroke-width="2.2"/>
    <path d="M14.6 14.6L20.5 20.5" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>`,
  // Flame, for a sound sacrifice.
  sacrifice: `<path d="M12 2c.8 3.6 6 6.2 6 11.6A6 6 0 0 1 6 13.6c0-2.9 1.6-4.8 3-6 .2 2 1.1 3.3 2.4 3.9C11 8.6 11 5.2 12 2z" fill="#fff"/>
    <path d="M12 21.2a2.7 2.7 0 0 1-2.7-2.7c0-1.7 1.3-2.7 2.7-4.6 1.4 1.9 2.7 2.9 2.7 4.6a2.7 2.7 0 0 1-2.7 2.7z" style="fill:var(--badge-bg)"/>`,
  // Cracked shield, for removing the defender.
  defender: `<path d="M12 2.5l7.5 2.8v5.9c0 4.8-3.2 8.6-7.5 10.3-4.3-1.7-7.5-5.5-7.5-10.3V5.3z" fill="#fff"/>
    <path d="M13.2 4.5l-3 5.5 3.3 1.2-2.6 6.5" fill="none" style="stroke:var(--badge-bg)" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>`,
  // Cartoon ton weight (tapered body, small handle), for an overloaded piece.
  overload: `<circle cx="12" cy="5.2" r="2.3" fill="none" stroke="#fff" stroke-width="1.8"/>
    <path d="M8.6 7.6h6.8l5.6 13.4H3z" fill="#fff"/>
    <text x="12" y="18.6" text-anchor="middle" font-size="7" font-weight="800" font-family="system-ui, sans-serif" style="fill:var(--badge-bg)">T</text>`,
  // Birdcage: domed bars on a base, with a hanging ring.
  trap: `<path d="M5 9a7 6 0 0 1 14 0v10H5z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>
    <path d="M9.5 4.6V19M14.5 4.6V19" stroke="#fff" stroke-width="1.8"/>
    <path d="M3.5 19.5h17" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="12" cy="2.8" r="1.4" fill="none" stroke="#fff" stroke-width="1.4"/>`,
};

export function hasGlyph(icon) {
  return !!GLYPHS[icon?.glyph];
}

// SVG children for a 24×24 box (for use inside an existing <svg>).
export function glyphMarkup(icon) {
  return GLYPHS[icon.glyph];
}

// Purple for a tactic that works; red when it's there but doesn't pay off.
export function iconTitle(icon) {
  return icon.sound === false ? `${icon.label} available, but it doesn't pay off` : `${icon.label} can be forced`;
}

export function badgeHtml(icon) {
  const cls = 'legend-icon' + (icon.sound === false ? ' is-unsound' : '');
  const inner = hasGlyph(icon) ? `<svg viewBox="0 0 24 24" aria-hidden="true">${glyphMarkup(icon)}</svg>` : icon.letter;
  return `<span class="${cls}" title="${iconTitle(icon)}">${inner}</span>`;
}
