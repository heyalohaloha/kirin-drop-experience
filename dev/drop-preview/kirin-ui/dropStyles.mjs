// Literal presentation styles extracted from the pinned DropScreen; no product imports.
export const dropStyles = Object.freeze({
  "dropTopFrame": {
    "position": "relative",
    "display": "flex",
    "flex": 1,
    "minHeight": 340,
    "width": "100%"
  },
  "dropTopZone": {
    "flex": 1,
    "width": "100%",
    "minHeight": 340,
    "position": "relative",
    "overflow": "hidden",
    "border": "1.5px dashed color-mix(in oklab, var(--tone-gold) 38%, var(--hairline))",
    "borderRadius": 8,
    "background": "linear-gradient(145deg, color-mix(in oklab, var(--color-gold, #c9a84c) 8%, var(--canvas-soft)) 0%, var(--canvas-soft) 100%)",
    "display": "flex",
    "flexDirection": "column",
    "alignItems": "center",
    "justifyContent": "center",
    "cursor": "pointer",
    "padding": 48,
    "isolation": "isolate",
    "transition": "border-color 180ms ease-out, background 180ms ease-out"
  },
  "dropTopRipples": {
    "position": "absolute",
    "inset": 0,
    "zIndex": -1,
    "overflow": "hidden",
    "borderRadius": "inherit",
    "pointerEvents": "none"
  },
  "dropTopChooseFiles": {
    "position": "absolute",
    "left": "50%",
    "bottom": "clamp(18px, 8%, 56px)",
    "transform": "translateX(-50%)",
    "zIndex": 2,
    "display": "inline-flex",
    "alignItems": "center",
    "gap": 8,
    "height": 36,
    "padding": "0 16px",
    "borderRadius": 18,
    "border": "1px solid var(--tone-gold-line)",
    "background": "color-mix(in oklab, var(--canvas-soft) 88%, var(--tone-gold))",
    "color": "var(--tone-gold)",
    "fontFamily": "var(--font-body)",
    "fontSize": 13,
    "cursor": "pointer",
    "whiteSpace": "nowrap"
  },
  "dropTopBrand": {
    "position": "relative",
    "display": "block",
    "marginBottom": 14,
    "color": "color-mix(in oklab, var(--ink-primary) 84%, var(--tone-gold))",
    "fontFamily": "var(--font-display, Georgia, serif)",
    "fontSize": 46,
    "fontWeight": 500,
    "lineHeight": 1.08,
    "letterSpacing": 0,
    "textAlign": "center"
  },
  "dropTopText": {
    "display": "block",
    "fontSize": 21,
    "fontWeight": 500,
    "color": "var(--ink-primary)",
    "letterSpacing": 0,
    "marginBottom": 12,
    "textAlign": "center",
    "lineHeight": 1.6
  },
  "dropTopHint": {
    "display": "block",
    "fontSize": 13,
    "color": "var(--ink-muted)",
    "letterSpacing": 0,
    "fontFamily": "var(--font-mono)",
    "textAlign": "center"
  },
  "dropTopRouteRow": {
    "display": "flex",
    "alignItems": "center",
    "justifyContent": "center",
    "flexWrap": "wrap",
    "gap": 8,
    "marginTop": 20
  },
  "dropTopRoutePill": {
    "borderRadius": 6,
    "padding": "5px 9px",
    "fontFamily": "var(--font-mono)",
    "fontSize": 11,
    "lineHeight": 1,
    "letterSpacing": 0
  },
  "dropTopRouteRead": {
    "color": "var(--tone-gold)",
    "border": "1px solid var(--tone-gold-line)",
    "background": "var(--tone-gold-wash)"
  }
});
