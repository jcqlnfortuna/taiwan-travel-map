// map/markers.js
// Marker rendering module — Taiwan Travel Explorer
// Depends on: Leaflet ≥1.9, map/init.js (for the L.Map instance)
// Dataset shape: taiwan_travel_dataset.json → { nodes[], routes[] }

// ─── Type catalogue (derived from dataset `type` field) ──────────────────────
// Every value that appears in nodes[].type must have an entry here.
// Colour hex values are intentionally distinct for accessibility at small sizes.

/**
 * @typedef {Object} NodeTypeMeta
 * @property {string} emoji      - Single emoji rendered inside the marker pin.
 * @property {string} color      - Dominant fill colour (hex).
 * @property {string} border     - Border / outline colour (hex).
 * @property {string} label      - Human-readable category label.
 */

/** @type {Record<string, NodeTypeMeta>} */
const NODE_TYPE_META = Object.freeze({
  airport:   { emoji: "✈",  color: "#3b82f6", border: "#1d4ed8", label: "Airport"       },
  transport: { emoji: "🚉", color: "#8b5cf6", border: "#6d28d9", label: "Transport Hub"  },
  hotel:     { emoji: "🏨", color: "#ec4899", border: "#be185d", label: "District"       },
  landmark:  { emoji: "🏛", color: "#f59e0b", border: "#b45309", label: "Landmark"       },
  museum:    { emoji: "🏺", color: "#10b981", border: "#047857", label: "Museum"         },
  food:      { emoji: "🍜", color: "#f97316", border: "#c2410c", label: "Food & Market"  },
  train:     { emoji: "🚂", color: "#64748b", border: "#334155", label: "Train Station"  },
  attraction:{ emoji: "⛩",  color: "#ef4444", border: "#b91c1c", label: "Attraction"    },
  nature:    { emoji: "🌊", color: "#06b6d4", border: "#0e7490", label: "Nature"         },
  easycard:  { emoji: "💳", color: "#8b5cf6", border: "#6d28d9", label: "EasyCard Reload" },
  atm:       { emoji: "🏧", color: "#0ea5e9", border: "#0369a1", label: "ATM"             },
});

/** Fallback for any future node type not yet in the catalogue. */
const FALLBACK_META = { emoji: "📍", color: "#94a3b8", border: "#475569", label: "Location" };

// ─── Icon geometry ────────────────────────────────────────────────────────────

const PIN_SIZE_DEFAULT  = [10, 22]; // [width, height] px — circle head + needle
const PIN_SIZE_ACTIVE   = [14, 30];
const PIN_ANCHOR        = (s) => [s[0] / 2, s[1]];        // tip of the needle
const POPUP_ANCHOR      = (s) => [0, -(s[1] + 4)];        // just above the pin

// ─── SVG pin factory ──────────────────────────────────────────────────────────

/**
 * Generates an inline SVG teardrop pin containing the type emoji.
 * Returns a raw HTML string consumed by L.divIcon.
 *
 * @param {NodeTypeMeta} meta
 * @param {boolean}      active  - Render in highlighted / selected state.
 * @returns {string}  HTML string
 */
function buildPinHTML(meta, active = false) {
  const [w, h] = active ? PIN_SIZE_ACTIVE : PIN_SIZE_DEFAULT;
  const circleSize = active ? 10 : 7;
  const needleHeight = h - circleSize;
  const glow = active ? `filter: drop-shadow(0 0 4px ${meta.color}cc);` : "";

  return `
    <div style="display:flex;flex-direction:column;align-items:center;width:${w}px;height:${h}px;${glow}">
      <div style="
        width:${circleSize}px;height:${circleSize}px;
        border-radius:50%;
        background:${meta.color};
        border:${active ? 2 : 1.5}px solid ${meta.border};
        box-sizing:border-box;
        flex-shrink:0;
      "></div>
      <div style="
        width:${active ? 2.5 : 1.5}px;
        height:${needleHeight}px;
        background:${meta.border};
        flex-shrink:0;
      "></div>
    </div>`.trim();
}

/**
 * Creates a Leaflet DivIcon for a given node type and active state.
 *
 * @param {string}  nodeType
 * @param {boolean} active
 * @returns {L.DivIcon}
 */
function createNodeIcon(nodeType, active = false) {
  const meta = NODE_TYPE_META[nodeType] ?? FALLBACK_META;
  const size = active ? PIN_SIZE_ACTIVE : PIN_SIZE_DEFAULT;

  return L.divIcon({
    html:        buildPinHTML(meta, active),
    className:   "",                          // suppress Leaflet's default white box
    iconSize:    size,
    iconAnchor:  PIN_ANCHOR(size),
    popupAnchor: POPUP_ANCHOR(size),
  });
}

// ─── Popup content factory ────────────────────────────────────────────────────

/**
 * Builds the HTML string shown in the Leaflet popup for a node.
 * Accepts the precomputed list of connected routes for that node so the
 * popup module stays self-contained and does not need to re-query the dataset.
 *
 * @param {import("../taiwan_travel_dataset.json").Node}   node
 * @param {import("../taiwan_travel_dataset.json").Route[]} connectedRoutes
 * @param {number} conversionRate  - TWD → USD rate from dataset root.
 * @returns {string}
 */
function buildPopupHTML(node, connectedRoutes, conversionRate) {
  const meta = NODE_TYPE_META[node.type] ?? FALLBACK_META;

  const routeRows = connectedRoutes.map(r => {
    const dir      = r.from === node.id ? "→" : "←";
    const peerId   = r.from === node.id ? r.to : r.from;
    const fareStr  = r.fare_twd === 0
      ? '<span style="color:#10b981">Free</span>'
      : `<span style="color:#f59e0b">NT$${r.fare_twd}</span>
         <span style="color:#94a3b8;font-size:10px"> / ₱${(r.fare_twd * conversionRate).toFixed(2)}</span>`;

    return `
      <tr>
        <td style="padding:3px 6px 3px 0;color:#94a3b8">${dir}</td>
        <td style="padding:3px 6px;color:#e2e8f0;font-size:12px">${peerId.replace(/_/g," ")}</td>
        <td style="padding:3px 6px;white-space:nowrap">${r.transport.replace(/_/g," ")}</td>
        <td style="padding:3px 0;white-space:nowrap;text-align:right">${r.time_min} min</td>
        <td style="padding:3px 0 3px 8px;white-space:nowrap;text-align:right">${fareStr}</td>
      </tr>`;
  }).join("");

  return `
    <div style="font-family:'Segoe UI',sans-serif;min-width:220px;max-width:280px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="font-size:22px">${meta.emoji}</span>
        <div>
          <div style="font-weight:700;font-size:14px;color:#0f172a">${node.name_en ?? node.name}</div>
          <div style="font-size:11px;color:${meta.color};font-weight:600;text-transform:uppercase;letter-spacing:1px">${meta.label}</div>
        </div>
      </div>
      ${connectedRoutes.length ? `
        <table style="width:100%;border-collapse:collapse;font-size:11px;font-family:monospace">
          <thead>
            <tr style="border-bottom:1px solid #e2e8f0">
              <th colspan="2" style="text-align:left;padding-bottom:3px;color:#64748b;font-weight:600">Connection</th>
              <th style="text-align:left;padding-bottom:3px;color:#64748b;font-weight:600">Via</th>
              <th style="text-align:right;padding-bottom:3px;color:#64748b;font-weight:600">Time</th>
              <th style="text-align:right;padding-bottom:3px;padding-left:8px;color:#64748b;font-weight:600">Fare</th>
            </tr>
          </thead>
          <tbody>${routeRows}</tbody>
        </table>` : `<p style="font-size:12px;color:#94a3b8;margin:0">No direct connections.</p>`}
    </div>`.trim();
}

// ─── Marker layer manager ─────────────────────────────────────────────────────

/**
 * @typedef {Object} MarkersConfig
 * @property {L.Map}   map              - Leaflet map instance from map/init.js.
 * @property {Array}   nodes            - dataset.nodes array.
 * @property {Array}   routes           - dataset.routes array.
 * @property {number}  conversionRate   - dataset.conversion_rate value.
 * @property {Function} [onSelect]      - Callback fired with the node object on click.
 */

/**
 * @typedef {Object} MarkersInstance
 * @property {L.LayerGroup}        layerGroup     - Leaflet LayerGroup containing all markers.
 * @property {Map<string,L.Marker>} markerIndex   - node.id → Leaflet Marker lookup.
 * @property {Function}             setActive     - Highlight a marker by node id; pass null to clear.
 * @property {Function}             showAll       - Add all markers to the map.
 * @property {Function}             filterByTypes - Show only markers whose type is in the supplied Set.
 * @property {Function}             destroy       - Remove layer group and clean up.
 */

/**
 * Renders all dataset nodes as styled Leaflet markers and wires up interactivity.
 *
 * @param {MarkersConfig} config
 * @returns {MarkersInstance}
 *
 * @example
 * import DATA from "../taiwan_travel_dataset.json";
 * import { initMap }    from "./map/init.js";
 * import { initMarkers } from "./map/markers.js";
 *
 * const { map } = initMap({ containerId: "map" });
 * const markers = initMarkers({
 *   map,
 *   nodes:          DATA.nodes,
 *   routes:         DATA.routes,
 *   conversionRate: DATA.conversion_rate,
 *   onSelect: node => console.log("selected", node),
 * });
 * markers.showAll();
 */
export function initMarkers(config) {
  const {
    map,
    nodes,
    routes,
    conversionRate,
    onSelect = null,
  } = config;

  if (!map)    throw new Error("[map/markers] initMarkers() requires a Leaflet `map` instance.");
  if (!nodes)  throw new Error("[map/markers] initMarkers() requires a `nodes` array.");
  if (!routes) throw new Error("[map/markers] initMarkers() requires a `routes` array.");

  // Pre-index routes by node id for O(1) popup construction
  /** @type {Map<string, import("../taiwan_travel_dataset.json").Route[]>} */
  const routesByNode = new Map();
  nodes.forEach(n => routesByNode.set(n.id, []));
  routes.forEach(r => {
    routesByNode.get(r.from)?.push(r);
    routesByNode.get(r.to)?.push(r);
  });

  // Layer group — keeps markers as a single removable unit
  const layerGroup = L.layerGroup();

  // id → marker lookup
  /** @type {Map<string, L.Marker>} */
  const markerIndex = new Map();

  /** Track which node id is currently active (highlighted). */
  let activeId = null;

  // ── Build one marker per node ───────────────────────────────────────────────
  nodes.forEach(node => {
    const marker = L.marker([node.lat, node.lng], {
      icon:  createNodeIcon(node.type, false),
      title: node.name_en ?? node.name,
      alt:   node.name_en ?? node.name,
      riseOnHover: true,
    });

    // Popup — bound lazily; Leaflet only renders it when first opened
    marker.bindPopup(
      () => buildPopupHTML(node, routesByNode.get(node.id) ?? [], conversionRate),
      { maxWidth: 300, className: "tw-popup" }
    );

    // Click handler — update active state then fire consumer callback
    marker.on("click", () => {
      setActive(node.id);
      marker.openPopup();
      if (typeof onSelect === "function") onSelect(node);
    });

    markerIndex.set(node.id, marker);
    layerGroup.addLayer(marker);
  });

  // ── Public methods ──────────────────────────────────────────────────────────

  /**
   * Swap a marker's icon between normal and active state.
   * Passing null / undefined clears the current active marker.
   *
   * @param {string|null} nodeId
   */
  function setActive(nodeId) {
    // Deactivate previous
    if (activeId && activeId !== nodeId) {
      const prev = markerIndex.get(activeId);
      const prevNode = nodes.find(n => n.id === activeId);
      if (prev && prevNode) prev.setIcon(createNodeIcon(prevNode.type, false));
    }
    // Activate new
    if (nodeId) {
      const marker = markerIndex.get(nodeId);
      const node   = nodes.find(n => n.id === nodeId);
      if (marker && node) marker.setIcon(createNodeIcon(node.type, true));
    }
    activeId = nodeId ?? null;
  }

  /** Add the layer group to the map, making all markers visible. */
  function showAll() {
    if (!map.hasLayer(layerGroup)) layerGroup.addTo(map);
  }

  /**
   * Show only markers whose `type` is present in the provided Set.
   * Useful for legend-driven filtering without rebuilding markers.
   *
   * @param {Set<string>} typeSet - e.g. new Set(["landmark","museum"])
   */
  function filterByTypes(typeSet) {
    nodes.forEach(node => {
      const marker = markerIndex.get(node.id);
      if (!marker) return;
      if (typeSet.has(node.type)) {
        if (!layerGroup.hasLayer(marker)) layerGroup.addLayer(marker);
      } else {
        layerGroup.removeLayer(marker);
      }
    });
  }

  /** Remove the layer group from the map and tear down all markers. */
  function destroy() {
    layerGroup.clearLayers();
    if (map.hasLayer(layerGroup)) map.removeLayer(layerGroup);
    markerIndex.clear();
  }

  return { layerGroup, markerIndex, setActive, showAll, filterByTypes, destroy };
}

// ─── POI service loaders ──────────────────────────────────────────────────────

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

/**
 * Returns the best available English name from an OSM tags object.
 * Priority: name:en → brand:en → brand → name
 *
 * @param {Object} tags - OSM element tags
 * @param {string} [fallback]
 * @returns {string}
 */
function getEnglishName(tags, fallback = "Unnamed") {
  return tags?.["name:en"] ?? tags?.["brand:en"] ?? tags?.brand ?? tags?.name ?? fallback;
}

/**
 * Builds an Overpass union query scoped to within 2 km of each itinerary node.
 *
 * @param {string}  filter  - Overpass tag filter, e.g. `["amenity"="atm"]`
 * @param {Array}   nodes   - dataset.nodes[]
 * @returns {string}
 */
function aroundQuery(filter, nodes) {
  const unions = nodes.map(n => `node${filter}(around:2000,${n.lat},${n.lng});`).join("");
  return `[out:json][timeout:25];(${unions});out body;`;
}

/**
 * Queries Overpass for ATMs within 2 km of any itinerary node and adds blue
 * ATM markers. Returns the LayerGroup for external control.
 *
 * @param {L.Map}  map
 * @param {Array}  nodes  - dataset.nodes[]
 * @returns {Promise<L.LayerGroup|null>}
 */
export async function loadATMs(map, nodes) {
  const q = aroundQuery(`["amenity"="atm"]`, nodes);
  try {
    const res  = await fetch(`${OVERPASS_URL}?data=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const cluster = L.markerClusterGroup({
      maxClusterRadius: 40,
      iconCreateFunction: count => L.divIcon({
        html: `<div style="background:#0ea5e9;border:2px solid #0369a1;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;box-shadow:0 2px 6px rgba(0,0,0,0.4)">🏧${count.getChildCount()}</div>`,
        className: "", iconSize: [28, 28], iconAnchor: [14, 14],
      }),
    });
    const seen = new Set();

    data.elements.forEach(el => {
      if (seen.has(el.id)) return;
      seen.add(el.id);
      const label = getEnglishName(el.tags, "ATM");
      const icon  = L.divIcon({
        html: `<div style="background:#0ea5e9;border:2px solid #0369a1;border-radius:50%;width:16px;height:16px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.4)">🏧</div>`,
        className: "", iconSize: [16, 16], iconAnchor: [8, 8],
      });
      L.marker([el.lat, el.lon], { icon, title: label })
        .bindTooltip(`🏧 ${label}`, { className: "tw-route-tooltip", sticky: true })
        .addTo(cluster);
    });

    cluster.addTo(map);
    return cluster;
  } catch (err) {
    console.warn("[markers] loadATMs failed:", err);
    return null;
  }
}

/**
 * Queries Overpass for 7-Eleven / FamilyMart within 2 km of any itinerary
 * node and adds EasyCard reload markers. Returns the LayerGroup.
 *
 * @param {L.Map}  map
 * @param {Array}  nodes  - dataset.nodes[]
 * @returns {Promise<L.LayerGroup|null>}
 */
export async function loadConvenienceStores(map, nodes) {
  // Brand-based query — primary key for TW convenience stores in OSM
  const q = aroundQuery(`["shop"="convenience"]["brand"~"7-Eleven|FamilyMart|Hi-Life|OK",i]`, nodes);
  try {
    const res  = await fetch(`${OVERPASS_URL}?data=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const easyCardLayer = L.markerClusterGroup({
      maxClusterRadius: 40,
      iconCreateFunction: cluster => L.divIcon({
        html: `<div style="background:#8b5cf6;border:2px solid #6d28d9;border-radius:4px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;box-shadow:0 2px 6px rgba(0,0,0,0.4)">💳${cluster.getChildCount()}</div>`,
        className: "", iconSize: [28, 28], iconAnchor: [14, 14],
      }),
    });
    const seen = new Set();

    data.elements.forEach(el => {
      if (seen.has(el.id)) return;
      seen.add(el.id);
      const name = getEnglishName(el.tags, "EasyCard Reload");
      const icon = L.divIcon({
        html: `<div style="background:#8b5cf6;border:2px solid #6d28d9;border-radius:4px;width:16px;height:16px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.4)">💳</div>`,
        className: "", iconSize: [16, 16], iconAnchor: [8, 8],
      });
      L.marker([el.lat, el.lon], { icon, title: name })
        .bindTooltip(`💳 ${name}`, { className: "tw-route-tooltip", sticky: true })
        .addTo(easyCardLayer);
    });

    easyCardLayer.addTo(map);
    return easyCardLayer;
  } catch (err) {
    console.warn("[markers] loadConvenienceStores failed:", err);
    return null;
  }
}

// ─── Named re-exports for downstream modules ──────────────────────────────────
export { NODE_TYPE_META, FALLBACK_META, createNodeIcon, buildPopupHTML };