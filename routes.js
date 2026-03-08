// map/routes.js
// Transport route layer module — Taiwan Travel Explorer
// Depends on: Leaflet ≥1.9, map/init.js (L.Map instance)
// Dataset shape: taiwan_travel_dataset.json → { nodes[], routes[], conversion_rate }

// ─── Transport type catalogue ─────────────────────────────────────────────────
// Keyed on every value that appears in routes[].transport.
// Visual properties drive both polyline rendering and the legend.

/**
 * @typedef {Object} TransportMeta
 * @property {string}   color       - Stroke colour (hex).
 * @property {string}   activeColor - Colour when the route is highlighted.
 * @property {number}   weight      - Default polyline stroke width (px).
 * @property {number}   activeWeight- Stroke width when highlighted.
 * @property {number[]|null} dashArray - SVG dash pattern; null = solid line.
 * @property {number}   opacity     - Default polyline opacity.
 * @property {string}   emoji       - Icon shown in tooltips and legend.
 * @property {string}   label       - Human-readable name used in legend / tooltips.
 */

/** @type {Record<string, TransportMeta>} */
const TRANSPORT_META = Object.freeze({
  airport_mrt: {
    color:        "#a855f7",
    activeColor:  "#d8b4fe",
    weight:       4,
    activeWeight: 6,
    dashArray:    null,
    opacity:      0.85,
    emoji:        "🚇",
    label:        "Airport MRT",
  },
  mrt: {
    color:        "#3b82f6",
    activeColor:  "#93c5fd",
    weight:       4,
    activeWeight: 6,
    dashArray:    null,
    opacity:      0.85,
    emoji:        "🚇",
    label:        "MRT",
  },
  train: {
    color:        "#22c55e",
    activeColor:  "#86efac",
    weight:       3,
    activeWeight: 5,
    dashArray:    [8, 4],
    opacity:      0.80,
    emoji:        "🚂",
    label:        "Train",
  },
  bus: {
    color:        "#f97316",
    activeColor:  "#fdba74",
    weight:       3,
    activeWeight: 5,
    dashArray:    [5, 6],
    opacity:      0.75,
    emoji:        "🚌",
    label:        "Bus",
  },
  walk: {
    color:        "#eab308",
    activeColor:  "#facc15",
    weight:       2,
    activeWeight: 4,
    dashArray:    [3, 5],
    opacity:      0.65,
    emoji:        "🚶",
    label:        "Walk",
  },
});

/** Fallback for transport types not yet in the catalogue. */
const FALLBACK_TRANSPORT_META = {
  color:        "#64748b",
  activeColor:  "#cbd5e1",
  weight:       2,
  activeWeight: 4,
  dashArray:    [4, 4],
  opacity:      0.70,
  emoji:        "🔀",
  label:        "Unknown",
};

// ─── OSRM geometry fetcher ────────────────────────────────────────────────────

/**
 * Fetches real road/rail geometry from the public OSRM API.
 * Returns null on network error or empty response (fallback: keep straight line).
 *
 * @param {L.LatLng} fromLL
 * @param {L.LatLng} toLL
 * @returns {Promise<L.LatLng[]|null>}
 */
async function fetchOSRMGeometry(fromLL, toLL) {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${fromLL.lng},${fromLL.lat};${toLL.lng},${toLL.lat}` +
    `?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const coords = data.routes?.[0]?.geometry?.coordinates;
    if (!coords?.length) return null;
    return coords.map(([lng, lat]) => L.latLng(lat, lng));
  } catch {
    return null;
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Resolves a node's { lat, lng } from the pre-built node index.
 * Throws early with a descriptive message if the id is missing — catches
 * dataset inconsistencies at init time rather than silently dropping routes.
 *
 * @param {Map<string,Object>} nodeIndex
 * @param {string}             id
 * @returns {{ lat: number, lng: number }}
 */
function resolveLatLng(nodeIndex, id) {
  const node = nodeIndex.get(id);
  if (!node) {
    throw new Error(
      `[map/routes] Route references unknown node id "${id}". ` +
      `Check dataset consistency between nodes[] and routes[].`
    );
  }
  return { lat: node.lat, lng: node.lng };
}

/**
 * Builds the HTML string shown inside a Leaflet tooltip on route hover.
 *
 * @param {Object} route           - Single entry from dataset.routes[].
 * @param {Object} fromNode        - Resolved origin node object.
 * @param {Object} toNode          - Resolved destination node object.
 * @param {TransportMeta} meta
 * @param {number} conversionRate  - TWD → USD from dataset root.
 * @returns {string}
 */
function buildTooltipHTML(route, fromNode, toNode, meta, conversionRate) {
  const fareStr = route.fare_twd === 0
    ? `<span style="color:#10b981;font-weight:700">Free</span>`
    : `<span style="color:#f59e0b;font-weight:700">NT$${route.fare_twd}</span>`
      + `<span style="color:#94a3b8;font-size:10px"> · ₱${(route.fare_twd * conversionRate).toFixed(2)}</span>`;

  return `
    <div style="font-family:'Segoe UI',sans-serif;font-size:12px;line-height:1.6;min-width:180px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;font-weight:700;font-size:13px;color:#0f172a">
        <span>${meta.emoji}</span>
        <span style="color:${meta.color}">${meta.label}</span>
      </div>
      <div style="color:#374151">
        <span style="font-weight:600">${fromNode.name_en ?? fromNode.name}</span>
        <span style="color:#9ca3af;margin:0 4px">→</span>
        <span style="font-weight:600">${toNode.name_en ?? toNode.name}</span>
      </div>
      <div style="display:flex;gap:16px;margin-top:4px;font-size:11px;font-family:monospace">
        <span>⏱ ${route.time_min} min</span>
        <span>${fareStr}</span>
      </div>
    </div>`.trim();
}

/**
 * Returns the L.Polyline options object for a given transport type and state.
 *
 * @param {TransportMeta} meta
 * @param {boolean}       active
 * @returns {L.PolylineOptions}
 */
function polylineOptions(meta, active) {
  return {
    color:       active ? meta.activeColor : meta.color,
    weight:      active ? meta.activeWeight : meta.weight,
    opacity:     active ? 1 : meta.opacity,
    dashArray:   meta.dashArray ? meta.dashArray.join(" ") : null,
    dashOffset:  "0",
    lineCap:     "round",
    lineJoin:    "round",
    interactive: true,          // required for tooltip / click events
  };
}

// ─── Directional decorator: midpoint arrow ────────────────────────────────────

/**
 * Computes the bearing (degrees) between two LatLng points.
 *
 * @param {L.LatLng} a
 * @param {L.LatLng} b
 * @returns {number} bearing 0–360
 */
function bearing(a, b) {
  const toRad = d => (d * Math.PI) / 180;
  const toDeg = r => (r * 180) / Math.PI;
  const dLng  = toRad(b.lng - a.lng);
  const lat1  = toRad(a.lat);
  const lat2  = toRad(b.lat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2)
            - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Creates a small rotated arrow DivIcon placed at the midpoint of a polyline
 * to indicate direction of travel (from → to).
 *
 * @param {L.LatLng} from
 * @param {L.LatLng} to
 * @param {TransportMeta} meta
 * @param {boolean} active
 * @returns {L.Marker}  A non-interactive marker acting as a decorator.
 */
function createArrowDecorator(from, to, meta, active) {
  const midLat = (from.lat + to.lat) / 2;
  const midLng = (from.lng + to.lng) / 2;
  const deg    = bearing(from, to);
  const color  = active ? meta.activeColor : meta.color;
  const size   = active ? 14 : 10;

  const icon = L.divIcon({
    html: `<div style="
      width:0;height:0;
      border-left:${size * 0.5}px solid transparent;
      border-right:${size * 0.5}px solid transparent;
      border-bottom:${size}px solid ${color};
      transform:rotate(${deg}deg);
      transform-origin:center;
      opacity:${active ? 1 : meta.opacity + 0.1};
      filter:${active ? `drop-shadow(0 0 4px ${color}99)` : "none"};
    "></div>`,
    className:  "",
    iconSize:   [size, size],
    iconAnchor: [size * 0.5, size * 0.5],
  });

  return L.marker([midLat, midLng], {
    icon,
    interactive: false,
    keyboard:    false,
    zIndexOffset: -100,
  });
}

// ─── Route layer manager ──────────────────────────────────────────────────────

/**
 * @typedef {Object} RoutesConfig
 * @property {L.Map}   map              - Leaflet map from map/init.js.
 * @property {Array}   nodes            - dataset.nodes[].
 * @property {Array}   routes           - dataset.routes[].
 * @property {number}  conversionRate   - dataset.conversion_rate.
 * @property {Function} [onRouteClick]  - Callback fired with the route object on click.
 */

/**
 * @typedef {Object} RouteEntry
 * @property {Object}   route       - Original route object from the dataset.
 * @property {L.Polyline} polyline  - The rendered Leaflet polyline.
 * @property {L.Marker}  arrow      - Midpoint direction decorator marker.
 * @property {boolean}   visible    - Whether this route is currently in the layer group.
 */

/**
 * @typedef {Object} RoutesInstance
 * @property {L.LayerGroup}   layerGroup        - Contains all polylines and decorators.
 * @property {RouteEntry[]}   entries           - Parallel array to dataset.routes[].
 * @property {Function}       showAll           - Add layer group to the map.
 * @property {Function}       setActiveRoute    - Highlight a single route by index; null to clear.
 * @property {Function}       setActivePath     - Highlight an ordered array of node ids (path result).
 * @property {Function}       filterByTransport - Show only routes whose transport is in the given Set.
 * @property {Function}       resetHighlight    - Clear all active highlights.
 * @property {Function}       destroy           - Remove layer and tear down references.
 */

/**
 * Renders all dataset routes as styled Leaflet polylines with directional
 * arrow decorators and interactive tooltips.
 *
 * @param {RoutesConfig} config
 * @returns {RoutesInstance}
 *
 * @example
 * import DATA from "../taiwan_travel_dataset.json";
 * import { initMap }    from "./map/init.js";
 * import { initRoutes } from "./map/routes.js";
 *
 * const { map }    = initMap({ containerId: "map" });
 * const routeLayer = initRoutes({
 *   map,
 *   nodes:          DATA.nodes,
 *   routes:         DATA.routes,
 *   conversionRate: DATA.conversion_rate,
 *   onRouteClick:   route => console.log("clicked", route),
 * });
 * routeLayer.showAll();
 */
export function initRoutes(config) {
  const {
    map,
    nodes,
    routes,
    conversionRate,
    onRouteClick = null,
  } = config;

  if (!map)    throw new Error("[map/routes] initRoutes() requires a Leaflet `map` instance.");
  if (!nodes)  throw new Error("[map/routes] initRoutes() requires a `nodes` array.");
  if (!routes) throw new Error("[map/routes] initRoutes() requires a `routes` array.");

  // ── Pre-index nodes by id ──────────────────────────────────────────────────
  /** @type {Map<string, Object>} */
  const nodeIndex = new Map(nodes.map(n => [n.id, n]));

  // ── Layer group ────────────────────────────────────────────────────────────
  const layerGroup = L.layerGroup();

  // ── Active state tracking ──────────────────────────────────────────────────
  /** @type {Set<number>} indices of currently active (highlighted) entries */
  const activeIndices = new Set();

  // ── Build one RouteEntry per dataset route ─────────────────────────────────
  /** @type {RouteEntry[]} */
  const entries = routes.map((route, idx) => {
    const fromNode = resolveLatLng(nodeIndex, route.from);
    const toNode   = resolveLatLng(nodeIndex, route.to);
    const meta     = TRANSPORT_META[route.transport] ?? FALLBACK_TRANSPORT_META;

    const fromLL = L.latLng(fromNode.lat, fromNode.lng);
    const toLL   = L.latLng(toNode.lat,   toNode.lng);

    // ── Polyline ────────────────────────────────────────────────────────────
    const polyline = L.polyline([fromLL, toLL], polylineOptions(meta, false));

    // Tooltip — sticky so it tracks the cursor along the line
    polyline.bindTooltip(
      () => buildTooltipHTML(
        route,
        nodeIndex.get(route.from),
        nodeIndex.get(route.to),
        meta,
        conversionRate
      ),
      { sticky: true, opacity: 0.97, className: "tw-route-tooltip" }
    );

    // Hover — glow + brighten
    polyline.on("mouseover", () => {
      if (!activeIndices.has(idx)) {
        polyline.setStyle({ color: meta.activeColor, weight: 7, opacity: 1 });
        polyline.bringToFront();
        const el = polyline.getElement();
        if (el) el.style.filter = `drop-shadow(0 0 8px ${meta.activeColor}cc)`;
      }
    });
    polyline.on("mouseout", () => {
      if (!activeIndices.has(idx)) {
        polyline.setStyle(polylineOptions(meta, false));
        const el = polyline.getElement();
        if (el) el.style.filter = "";
      }
    });

    // Click — popup with route details
    polyline.on("click", (e) => {
      const from = nodeIndex.get(route.from);
      const to   = nodeIndex.get(route.to);
      const phpFare = (route.fare_twd * conversionRate).toFixed(2);
      const fareStr = route.fare_twd === 0
        ? '<span style="color:#22c55e;font-weight:700">Free</span>'
        : `<span style="color:#f59e0b;font-weight:700">NT$${route.fare_twd}</span> <span style="color:#94a3b8">· ₱${phpFare}</span>`;

      L.popup({ className: "tw-route-tooltip", maxWidth: 260 })
        .setLatLng(e.latlng)
        .setContent(`
          <div style="font-family:'Segoe UI',sans-serif;padding:2px;">
            <div style="font-weight:700;font-size:13px;color:#0f172a;margin-bottom:8px;">
              ${from.name_en ?? from.name} → ${to.name_en ?? to.name}
            </div>
            <table style="font-size:12px;border-collapse:collapse;width:100%;">
              <tr><td style="color:#64748b;padding:3px 10px 3px 0;">Transport</td><td>${meta.emoji} ${meta.label}</td></tr>
              <tr><td style="color:#64748b;padding:3px 10px 3px 0;">Fare</td><td>${fareStr}</td></tr>
              <tr><td style="color:#64748b;padding:3px 10px 3px 0;">Duration</td><td>⏱ ${route.time_min} min</td></tr>
            </table>
          </div>`)
        .openOn(map);

      setActiveRoute(idx);
      if (typeof onRouteClick === "function") onRouteClick(route);
    });

    // ── Arrow decorator ─────────────────────────────────────────────────────
    const arrow = createArrowDecorator(fromLL, toLL, meta, false);

    layerGroup.addLayer(polyline);
    layerGroup.addLayer(arrow);

    return { route, polyline, arrow, visible: true };
  });

  // ── Internal state updater ─────────────────────────────────────────────────

  /**
   * Apply or remove the active visual style from a single entry.
   *
   * @param {RouteEntry} entry
   * @param {boolean}    active
   */
  function applyStyle(entry, active) {
    const meta = TRANSPORT_META[entry.route.transport] ?? FALLBACK_TRANSPORT_META;
    entry.polyline.setStyle(polylineOptions(meta, active));
    if (active) entry.polyline.bringToFront();

    // Rebuild arrow — use first/last point to support multi-point OSRM geometry
    layerGroup.removeLayer(entry.arrow);
    const latlngs = entry.polyline.getLatLngs();
    const fromLL  = latlngs[0];
    const toLL    = latlngs[latlngs.length - 1];
    entry.arrow   = createArrowDecorator(fromLL, toLL, meta, active);
    if (entry.visible) layerGroup.addLayer(entry.arrow);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Add the layer group to the map, making all routes visible. */
  function showAll() {
    if (!map.hasLayer(layerGroup)) layerGroup.addTo(map);
  }

  /**
   * Highlight a single route by its index in the entries array (mirrors
   * the dataset routes[] order). Pass null to clear all highlights.
   *
   * @param {number|null} idx
   */
  function setActiveRoute(idx) {
    // Clear previous highlights
    activeIndices.forEach(i => {
      applyStyle(entries[i], false);
    });
    activeIndices.clear();

    if (idx !== null && idx !== undefined && entries[idx]) {
      activeIndices.add(idx);
      applyStyle(entries[idx], true);
    }
  }

  /**
   * Highlight every route that forms part of an ordered node-id path
   * (e.g. the output of the Dijkstra pathfinder).
   * All non-path routes are dimmed for contrast.
   *
   * @param {string[]} nodeIdPath  - Ordered array of node ids, e.g. ["airport","taipei_main","ximen"]
   */
  function setActivePath(nodeIdPath) {
    // Build a set of (from,to) pairs that belong to the path (order-agnostic
    // since dataset routes are directional but travel can reverse them)
    /** @type {Set<string>} */
    const pathEdges = new Set();
    for (let i = 0; i < nodeIdPath.length - 1; i++) {
      const a = nodeIdPath[i], b = nodeIdPath[i + 1];
      pathEdges.add(`${a}|${b}`);
      pathEdges.add(`${b}|${a}`);          // accept either direction
    }

    activeIndices.clear();

    entries.forEach((entry, idx) => {
      const key = `${entry.route.from}|${entry.route.to}`;
      const onPath = pathEdges.has(key);
      if (onPath) activeIndices.add(idx);

      const meta = TRANSPORT_META[entry.route.transport] ?? FALLBACK_TRANSPORT_META;

      // Dim non-path routes; brighten path routes
      if (onPath) {
        entry.polyline.setStyle({ ...polylineOptions(meta, true) });
        entry.polyline.bringToFront();
      } else {
        entry.polyline.setStyle({
          color:   meta.color,
          weight:  meta.weight,
          opacity: 0.18,          // near-invisible to focus attention on path
          dashArray: meta.dashArray ? meta.dashArray.join(" ") : null,
        });
      }

      // Rebuild arrows — use first/last to support OSRM multi-point geometry
      layerGroup.removeLayer(entry.arrow);
      const latlngs = entry.polyline.getLatLngs();
      const fromLL  = latlngs[0];
      const toLL    = latlngs[latlngs.length - 1];
      entry.arrow   = createArrowDecorator(fromLL, toLL, meta, onPath);
      if (entry.visible) layerGroup.addLayer(entry.arrow);
    });
  }

  /**
   * Reset all route highlights back to their default appearance.
   */
  function resetHighlight() {
    activeIndices.clear();
    entries.forEach(entry => applyStyle(entry, false));
  }

  /**
   * Show only routes whose transport mode is present in the supplied Set.
   * Matching routes are added to the layer group; non-matching are removed.
   * Does not affect active highlight state.
   *
   * @param {Set<string>} transportSet - e.g. new Set(["mrt","train"])
   */
  function filterByTransport(transportSet) {
    entries.forEach(entry => {
      const shouldShow = transportSet.has(entry.route.transport);
      const hasPolyline = layerGroup.hasLayer(entry.polyline);

      if (shouldShow && !hasPolyline) {
        layerGroup.addLayer(entry.polyline);
        layerGroup.addLayer(entry.arrow);
        entry.visible = true;
      } else if (!shouldShow && hasPolyline) {
        layerGroup.removeLayer(entry.polyline);
        layerGroup.removeLayer(entry.arrow);
        entry.visible = false;
      }
    });
  }

  /**
   * Fetches real road geometry from OSRM for every route and replaces the
   * straight-line polylines in-place. Falls back to the original straight line
   * if OSRM is unavailable for a segment. Safe to call after showAll().
   *
   * @returns {Promise<void>}
   */
  async function loadOSRMGeometry() {
    await Promise.all(entries.map(async (entry) => {
      const latlngs = entry.polyline.getLatLngs();
      const fromLL  = latlngs[0];
      const toLL    = latlngs[latlngs.length - 1];
      const geometry = await fetchOSRMGeometry(fromLL, toLL);
      if (!geometry || geometry.length < 2) return;

      entry.polyline.setLatLngs(geometry);

      // Reposition arrow decorator to real start → end
      layerGroup.removeLayer(entry.arrow);
      const meta   = TRANSPORT_META[entry.route.transport] ?? FALLBACK_TRANSPORT_META;
      entry.arrow  = createArrowDecorator(geometry[0], geometry[geometry.length - 1], meta, false);
      if (entry.visible) layerGroup.addLayer(entry.arrow);
    }));
  }

  /**
   * Remove the layer group from the map and release all references.
   */
  function destroy() {
    layerGroup.clearLayers();
    if (map.hasLayer(layerGroup)) map.removeLayer(layerGroup);
    entries.length = 0;
    activeIndices.clear();
  }

  return {
    layerGroup,
    entries,
    showAll,
    loadOSRMGeometry,
    setActiveRoute,
    setActivePath,
    filterByTransport,
    resetHighlight,
    destroy,
  };
}

// ─── Named re-exports for legend / other modules ──────────────────────────────
export { TRANSPORT_META, FALLBACK_TRANSPORT_META };