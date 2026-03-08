// map/init.js
// Leaflet map initialization module — Taiwan Travel Explorer
// Depends on: Leaflet ≥1.9, dataset shape from taiwan_travel_dataset.json

// ─── Constants ───────────────────────────────────────────────────────────────

/** Geographic centre of the dataset bounding box (pre-computed from nodes). */
const DEFAULT_CENTER = [25.0797, 121.5645]; // roughly mid-Taiwan coverage area
const DEFAULT_ZOOM   = 11;
const MIN_ZOOM       = 9;
const MAX_ZOOM       = 20;

/** Tile provider — OpenStreetMap (no API key required). Swap URL + attribution
 *  to switch to Mapbox, Stadia, etc. without touching other modules.        */
const TILE_URL   = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIBUTION = "&copy; OpenStreetMap contributors";

// ─── Types (JSDoc) ───────────────────────────────────────────────────────────

/**
 * @typedef {Object} MapConfig
 * @property {string}          containerId  - DOM element id to mount the map into.
 * @property {[number,number]} [center]     - Override default lat/lng centre.
 * @property {number}          [zoom]       - Override default zoom level.
 * @property {boolean}         [zoomControl]- Show zoom control widget (default true).
 * @property {boolean}         [scrollWheelZoom] - Allow scroll-wheel zoom (default true).
 */

/**
 * @typedef {Object} MapInstance
 * @property {L.Map}            map         - The underlying Leaflet map object.
 * @property {L.TileLayer}      tileLayer   - Active base tile layer.
 * @property {Function}         destroy     - Unmounts the map and cleans up listeners.
 * @property {Function}         fitToNodes  - Fits the viewport to an array of {lat,lng} nodes.
 */

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Validates that a DOM container exists before Leaflet tries to mount.
 * Throws a descriptive error rather than letting Leaflet produce a cryptic one.
 *
 * @param {string} id
 * @returns {HTMLElement}
 */
function requireContainer(id) {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(
      `[map/init] Container #${id} not found in DOM. ` +
      `Ensure the element exists before calling initMap().`
    );
  }
  return el;
}

/**
 * Builds the Leaflet TileLayer from module-level constants.
 * Isolated so callers can swap tile providers by replacing this function.
 *
 * @returns {L.TileLayer}
 */
function buildTileLayer() {
  return L.tileLayer(TILE_URL, {
    attribution: TILE_ATTRIBUTION,
    maxZoom: MAX_ZOOM,
    subdomains: "abcd",
    detectRetina: true,
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Initialises a Leaflet map inside the given container.
 *
 * @param {MapConfig} config
 * @returns {MapInstance}
 *
 * @example
 * import { initMap } from "./map/init.js";
 * import DATA from "../taiwan_travel_dataset.json";
 *
 * const { map, fitToNodes } = initMap({ containerId: "map" });
 * fitToNodes(DATA.nodes);
 */
export function initMap(config = {}) {
  const {
    containerId,
    center           = DEFAULT_CENTER,
    zoom             = DEFAULT_ZOOM,
    zoomControl      = true,
    scrollWheelZoom  = true,
  } = config;

  if (!containerId) {
    throw new Error("[map/init] initMap() requires a `containerId` option.");
  }

  requireContainer(containerId);

  // ── Create map ─────────────────────────────────────────────────────────────
  const maxBounds = L.latLngBounds([24.80, 121.10], [25.30, 122.10]);

  const map = L.map(containerId, {
    center,
    zoom,
    minZoom:        MIN_ZOOM,
    maxZoom:        MAX_ZOOM,
    maxBounds,
    maxBoundsViscosity: 1.0,   // hard stop at boundary
    zoomControl,
    scrollWheelZoom,
    preferCanvas:        true,
    inertia:             true,
    inertiaDeceleration: 3000,
    touchZoom:           true,
    bounceAtZoomLimits:  false,
    tap:                 true,
    tapTolerance:        15,
    rotate:              true,   // leaflet-rotate: two-finger rotation on mobile
    rotateControl:       false,  // no on-screen widget
  });

  // ── Attach tile layer ──────────────────────────────────────────────────────
  const tileLayer = buildTileLayer();
  tileLayer.addTo(map);

  // ── Public helpers ─────────────────────────────────────────────────────────

  /**
   * Pans and zooms the map to contain all supplied nodes.
   * Accepts the `nodes` array directly from taiwan_travel_dataset.json.
   *
   * @param {Array<{lat: number, lng: number}>} nodes
   * @param {L.FitBoundsOptions} [options]
   */
  function fitToNodes(nodes = [], options = { padding: [40, 40] }) {
    if (!nodes.length) return;
    const bounds = L.latLngBounds(nodes.map(n => [n.lat, n.lng]));
    map.fitBounds(bounds, options);
  }

  /**
   * Fully removes the map and unbinds all Leaflet event listeners.
   * Call this on component unmount (React useEffect cleanup, etc.).
   */
  function destroy() {
    map.remove();
  }

  return { map, tileLayer, fitToNodes, destroy };
}

// ─── Named re-exports (constants) for use by other map sub-modules ────────────
export { DEFAULT_CENTER, DEFAULT_ZOOM, MIN_ZOOM, MAX_ZOOM };