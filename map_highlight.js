// map/highlight.js
// Route highlighting interaction module — Taiwan Travel Explorer
// Depends on: map/init.js, map/markers.js, map/routes.js
// Dataset shape: taiwan_travel_dataset.json → { nodes[], routes[], conversion_rate }

// ─── Constants ────────────────────────────────────────────────────────────────

/** z-index bump applied to highlighted polylines so they render above all others. */
const Z_ACTIVE   = 600;
const Z_INACTIVE = 200;

/** Opacity applied to non-selected routes when a path is active. */
const DIM_OPACITY = 0.12;

/** Animation duration (ms) for the "marching ants" dash-offset CSS animation. */
const MARCH_DURATION_MS = 900;

/** Pulse ring radius multiplier relative to the marker's default icon size. */
const PULSE_SCALE = 2.2;

// ─── Highlight state machine ──────────────────────────────────────────────────
// Three mutually-exclusive modes:
//   IDLE      — nothing selected, all routes at default appearance
//   NODE      — a single node is selected; its direct connections are emphasised
//   PATH      — an ordered node-id sequence is active (from pathfinder output)

/** @enum {string} */
const Mode = Object.freeze({
  IDLE: "IDLE",
  NODE: "NODE",
  PATH: "PATH",
});

// ─── CSS injection (marching ants + pulse ring) ───────────────────────────────

const STYLE_ID = "tw-highlight-styles";

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes tw-march {
      to { stroke-dashoffset: -24; }
    }
    @keyframes tw-pulse {
      0%   { transform: scale(1);              opacity: 0.8; }
      70%  { transform: scale(${PULSE_SCALE}); opacity: 0;   }
      100% { transform: scale(${PULSE_SCALE}); opacity: 0;   }
    }
    .tw-marching path {
      animation: tw-march ${MARCH_DURATION_MS}ms linear infinite;
    }
    .tw-pulse-ring {
      animation: tw-pulse 1.4s ease-out infinite;
      transform-origin: center;
      pointer-events: none;
    }
    .tw-route-tooltip {
      background: rgba(15,23,42,0.95);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 8px;
      color: #e2e8f0;
      padding: 8px 10px;
      font-size: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
      pointer-events: none;
    }
    .tw-route-tooltip .leaflet-tooltip-tip { display: none; }
    .tw-segment-label {
      background: transparent;
      border: none;
      box-shadow: none;
    }
    .leaflet-overlay-pane svg path {
      transition: stroke-width 0.15s ease, opacity 0.15s ease, filter 0.15s ease;
    }
  `;
  document.head.appendChild(style);
}

// ─── Segment label factory ────────────────────────────────────────────────────

/**
 * Creates a DivIcon label for a midpoint, showing time and fare for a route
 * segment. Used on active path legs only.
 *
 * @param {Object} route          - Single entry from dataset.routes[].
 * @param {string} transportColor - Hex colour for the badge background tint.
 * @param {number} conversionRate
 * @returns {L.DivIcon}
 */
function buildSegmentLabelIcon(route, transportColor, conversionRate) {
  const fareStr = route.fare_twd === 0
    ? "Free"
    : `NT$${route.fare_twd} · ₱${(route.fare_twd * conversionRate).toFixed(2)}`;

  return L.divIcon({
    className: "tw-segment-label",
    html: `
      <div style="
        background: rgba(15,23,42,0.90);
        border: 1.5px solid ${transportColor};
        border-radius: 6px;
        padding: 3px 7px;
        font-family: 'Segoe UI', monospace, sans-serif;
        font-size: 10px;
        white-space: nowrap;
        color: #e2e8f0;
        box-shadow: 0 2px 8px rgba(0,0,0,0.5);
        pointer-events: none;
      ">
        <span style="color:${transportColor};font-weight:700">⏱ ${route.time_min} min</span>
        <span style="color:#64748b;margin: 0 4px">·</span>
        <span style="color:#fbbf24">${fareStr}</span>
      </div>`.trim(),
    iconAnchor: [0, 0],   // caller offsets to midpoint
  });
}

// ─── Pulse ring factory ───────────────────────────────────────────────────────

/**
 * Creates a pulsing ring DivIcon to draw attention to active nodes
 * (start / end / junction points on a highlighted path).
 *
 * @param {string} color  - Ring colour.
 * @param {number} size   - Diameter in px.
 * @returns {L.DivIcon}
 */
function buildPulseIcon(color, size) {
  const half = size / 2;
  return L.divIcon({
    className: "",
    html: `<div class="tw-pulse-ring" style="
      width:${size}px; height:${size}px;
      border-radius: 50%;
      border: 2.5px solid ${color};
      background: ${color}22;
      box-sizing: border-box;
    "></div>`,
    iconSize:   [size, size],
    iconAnchor: [half, half],
  });
}

// ─── Internal geometry helpers ────────────────────────────────────────────────

/**
 * Returns the geographic midpoint between two L.LatLng values.
 *
 * @param {L.LatLng} a
 * @param {L.LatLng} b
 * @returns {L.LatLng}
 */
function midpoint(a, b) {
  return L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2);
}

// ─── Highlight manager ────────────────────────────────────────────────────────

/**
 * @typedef {Object} HighlightConfig
 * @property {L.Map}           map             - Leaflet map from map/init.js.
 * @property {Object}          markersInstance - Return value of initMarkers().
 * @property {Object}          routesInstance  - Return value of initRoutes().
 * @property {Array}           nodes           - dataset.nodes[].
 * @property {Array}           routes          - dataset.routes[].
 * @property {number}          conversionRate  - dataset.conversion_rate.
 * @property {Object}          transportMeta   - TRANSPORT_META re-export from map/routes.js.
 * @property {Function}        [onModeChange]  - Fired whenever the mode transitions: (mode, payload) => void.
 */

/**
 * @typedef {Object} HighlightInstance
 * @property {Function} highlightNode   - Enter NODE mode for the given node id.
 * @property {Function} highlightPath   - Enter PATH mode for an ordered node-id array.
 * @property {Function} clearHighlight  - Return to IDLE; remove all decorators.
 * @property {Function} getMode        - Returns the current Mode string.
 * @property {Function} destroy        - Remove all layers and injected styles.
 */

/**
 * Manages all highlight interactions between the marker and route layers.
 * Acts as the single coordinator so markers.js and routes.js stay decoupled.
 *
 * @param {HighlightConfig} config
 * @returns {HighlightInstance}
 *
 * @example
 * import DATA from "../taiwan_travel_dataset.json";
 * import { initMap }       from "./map/init.js";
 * import { initMarkers, NODE_TYPE_META } from "./map/markers.js";
 * import { initRoutes, TRANSPORT_META }  from "./map/routes.js";
 * import { initHighlight } from "./map/highlight.js";
 *
 * const { map }    = initMap({ containerId: "map" });
 * const markers    = initMarkers({ map, ...DATA });
 * const routeLayer = initRoutes({ map, ...DATA });
 * markers.showAll();
 * routeLayer.showAll();
 *
 * const highlight = initHighlight({
 *   map, markersInstance: markers, routesInstance: routeLayer,
 *   nodes: DATA.nodes, routes: DATA.routes,
 *   conversionRate: DATA.conversion_rate,
 *   transportMeta: TRANSPORT_META,
 *   onModeChange: (mode, payload) => console.log(mode, payload),
 * });
 *
 * // Select a node
 * highlight.highlightNode("taipei101");
 *
 * // Highlight a computed path
 * highlight.highlightPath(["airport", "taipei_main", "ximen", "cks"]);
 *
 * // Reset
 * highlight.clearHighlight();
 */
export function initHighlight(config) {
  const {
    map,
    markersInstance,
    routesInstance,
    nodes,
    routes,
    conversionRate,
    transportMeta,
    onModeChange = null,
  } = config;

  if (!map)             throw new Error("[map/highlight] requires `map`.");
  if (!markersInstance) throw new Error("[map/highlight] requires `markersInstance`.");
  if (!routesInstance)  throw new Error("[map/highlight] requires `routesInstance`.");

  ensureStyles();

  // ── Pre-index ──────────────────────────────────────────────────────────────
  /** @type {Map<string, Object>} node id → node object */
  const nodeIndex = new Map(nodes.map(n => [n.id, n]));

  /**
   * Map from node id → array of { routeIdx, route } for all routes that
   * touch that node (as origin or destination).
   * @type {Map<string, Array<{routeIdx:number, route:Object}>>}
   */
  const connectionIndex = new Map(nodes.map(n => [n.id, []]));
  routes.forEach((route, routeIdx) => {
    connectionIndex.get(route.from)?.push({ routeIdx, route });
    connectionIndex.get(route.to)?.push({ routeIdx, route });
  });

  // ── Transient decoration layer ─────────────────────────────────────────────
  // Segment labels and pulse rings live in their own layer group so they can
  // be wiped atomically without touching the main route / marker layers.
  const decoratorLayer = L.layerGroup().addTo(map);

  // ── State ──────────────────────────────────────────────────────────────────
  let currentMode    = Mode.IDLE;
  let currentPayload = null;   // nodeId string | nodeId[] path

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Emit the mode-change callback if provided. */
  function emit(mode, payload) {
    currentMode    = mode;
    currentPayload = payload;
    if (typeof onModeChange === "function") onModeChange(mode, payload);
  }

  /** Remove all transient decorators (labels + pulse rings). */
  function clearDecorators() {
    decoratorLayer.clearLayers();
  }

  /**
   * Add a segment label at the midpoint of a route leg.
   *
   * @param {Object} route
   * @param {string} transportColor
   */
  function addSegmentLabel(route, transportColor) {
    const fromNode = nodeIndex.get(route.from);
    const toNode   = nodeIndex.get(route.to);
    if (!fromNode || !toNode) return;

    const mid  = midpoint(
      L.latLng(fromNode.lat, fromNode.lng),
      L.latLng(toNode.lat,   toNode.lng)
    );
    const icon = buildSegmentLabelIcon(route, transportColor, conversionRate);
    L.marker(mid, { icon, interactive: false, keyboard: false })
      .addTo(decoratorLayer);
  }

  /**
   * Add a pulsing ring around a node's marker position.
   *
   * @param {string} nodeId
   * @param {string} color
   */
  function addPulseRing(nodeId, color) {
    const node = nodeIndex.get(nodeId);
    if (!node) return;
    const size = 28;
    L.marker([node.lat, node.lng], {
      icon:        buildPulseIcon(color, size),
      interactive: false,
      keyboard:    false,
      zIndexOffset: -200,
    }).addTo(decoratorLayer);
  }

  /**
   * Enable the "marching ants" CSS class on a Leaflet polyline.
   * Leaflet stores the SVG path inside the polyline's _path property.
   *
   * @param {L.Polyline} polyline
   * @param {boolean}    enable
   */
  function setMarchingAnts(polyline, enable) {
    const el = polyline.getElement?.();
    if (!el) return;
    if (enable) {
      el.classList.add("tw-marching");
      // Ensure a dash pattern exists for the animation to be visible
      const path = el.querySelector("path") ?? el;
      if (!path.style.strokeDasharray) {
        path.style.strokeDasharray = "12 6";
      }
    } else {
      el.classList.remove("tw-marching");
    }
  }

  /**
   * Dim every polyline that is NOT in the active set.
   *
   * @param {Set<number>} activeRouteIndices
   */
  function dimInactiveRoutes(activeRouteIndices) {
    routesInstance.entries.forEach((entry, idx) => {
      if (!activeRouteIndices.has(idx)) {
        entry.polyline.setStyle({ opacity: DIM_OPACITY, weight: 1 });
        entry.polyline.getElement?.()?.classList.remove("tw-marching");
        // Lower z-index so active routes render on top
        entry.polyline.setZIndexOffset?.(Z_INACTIVE);
      }
    });
  }

  /** Restore every polyline to its canonical default appearance. */
  function restoreAllRoutes() {
    routesInstance.resetHighlight();
    routesInstance.entries.forEach(entry => {
      setMarchingAnts(entry.polyline, false);
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Enter NODE mode.
   * Dims every route except those directly touching `nodeId`.
   * Adds pulse rings on both endpoint nodes of each connected route.
   * Applies marching-ants animation to connected polylines.
   *
   * @param {string} nodeId
   */
  function highlightNode(nodeId) {
    if (!nodeIndex.has(nodeId)) {
      console.warn(`[map/highlight] highlightNode: unknown node id "${nodeId}"`);
      return;
    }

    clearDecorators();
    restoreAllRoutes();

    const connections = connectionIndex.get(nodeId) ?? [];
    const activeSet   = new Set(connections.map(c => c.routeIdx));

    // Dim everything outside the active set first
    dimInactiveRoutes(activeSet);

    // Brighten + animate connected routes
    connections.forEach(({ routeIdx, route }) => {
      const entry = routesInstance.entries[routeIdx];
      if (!entry) return;
      const meta = transportMeta[route.transport] ?? { color: "#94a3b8", activeColor: "#e2e8f0", weight: 3, activeWeight: 5, dashArray: null, opacity: 1 };

      entry.polyline.setStyle({
        color:   meta.activeColor,
        weight:  meta.activeWeight,
        opacity: 1,
      });
      entry.polyline.bringToFront();
      setMarchingAnts(entry.polyline, true);

      // Pulse rings on both endpoints
      addPulseRing(route.from, meta.activeColor);
      addPulseRing(route.to,   meta.activeColor);
    });

    // Activate the selected node's marker
    markersInstance.setActive(nodeId);

    emit(Mode.NODE, nodeId);
  }

  /**
   * Enter PATH mode.
   * Accepts an ordered array of node ids (e.g. from the Dijkstra pathfinder).
   * Dims off-path routes, brightens each path leg with marching-ants animation,
   * adds per-segment time/fare labels, and places pulse rings on every path node.
   *
   * @param {string[]} nodeIdPath  - e.g. ["airport","taipei_main","ximen","cks"]
   */
  function highlightPath(nodeIdPath) {
    if (!Array.isArray(nodeIdPath) || nodeIdPath.length < 2) {
      console.warn("[map/highlight] highlightPath: path must contain ≥ 2 node ids.");
      return;
    }

    clearDecorators();
    restoreAllRoutes();

    // Build edge lookup for this path (order-agnostic)
    /** @type {Set<string>} */
    const pathEdgeKeys = new Set();
    for (let i = 0; i < nodeIdPath.length - 1; i++) {
      const a = nodeIdPath[i], b = nodeIdPath[i + 1];
      pathEdgeKeys.add(`${a}|${b}`);
      pathEdgeKeys.add(`${b}|${a}`);
    }

    /** @type {Set<number>} */
    const activeSet = new Set();
    routes.forEach((route, idx) => {
      if (pathEdgeKeys.has(`${route.from}|${route.to}`)) activeSet.add(idx);
    });

    // Dim off-path routes
    dimInactiveRoutes(activeSet);

    // Style each active leg
    activeSet.forEach(idx => {
      const entry = routesInstance.entries[idx];
      if (!entry) return;
      const route = entry.route;
      const meta  = transportMeta[route.transport] ?? { color: "#fbbf24", activeColor: "#fde68a", weight: 4, activeWeight: 6, dashArray: null, opacity: 1 };

      entry.polyline.setStyle({
        color:   meta.activeColor,
        weight:  meta.activeWeight,
        opacity: 1,
      });
      entry.polyline.bringToFront();
      setMarchingAnts(entry.polyline, true);

      // Per-segment cost/time label
      addSegmentLabel(route, meta.activeColor);
    });

    // Pulse rings on every node in the path
    // Start = green, end = red, intermediates = amber
    const last = nodeIdPath.length - 1;
    nodeIdPath.forEach((id, i) => {
      const color = i === 0 ? "#34d399" : i === last ? "#f87171" : "#fbbf24";
      addPulseRing(id, color);
    });

    // Activate start + end markers
    markersInstance.setActive(nodeIdPath[0]);

    // Delegate full path dimming to routesInstance for arrow consistency
    routesInstance.setActivePath(nodeIdPath);

    emit(Mode.PATH, nodeIdPath);
  }

  /**
   * Return to IDLE mode.
   * Restores all routes to their default appearance and clears all decorators.
   */
  function clearHighlight() {
    clearDecorators();
    restoreAllRoutes();
    markersInstance.setActive(null);
    emit(Mode.IDLE, null);
  }

  /** Returns the current Mode value ("IDLE" | "NODE" | "PATH"). */
  function getMode() {
    return currentMode;
  }

  /**
   * Remove the decorator layer, clear all styles, and clean up injected CSS.
   * Call on component unmount or SPA route change.
   */
  function destroy() {
    clearDecorators();
    restoreAllRoutes();
    markersInstance.setActive(null);
    decoratorLayer.remove();

    const styleEl = document.getElementById(STYLE_ID);
    if (styleEl) styleEl.remove();

    currentMode    = Mode.IDLE;
    currentPayload = null;
  }

  return {
    highlightNode,
    highlightPath,
    clearHighlight,
    getMode,
    destroy,
  };
}

// ─── Named re-exports ─────────────────────────────────────────────────────────
export { Mode, DIM_OPACITY, MARCH_DURATION_MS };