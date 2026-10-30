// Pictograms for forced-tactic badges, drawn in a 24×24 box in white on the
// purple badge. A tactic without a glyph falls back to its letter.

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
