import { initMap } from "./map_initialization.js";
import { initMarkers, loadATMs, loadConvenienceStores } from "./marker_rendering_module.js";
import { initRoutes, TRANSPORT_META } from "./routes.js";
import { initHighlight } from "./map_highlight.js";

// ── Global error display (shows JS errors on screen instead of blank page) ──
function showError(err) {
  document.body.innerHTML = `
    <div style="padding:24px;font-family:monospace;background:#0f172a;color:#f87171;height:100%;box-sizing:border-box;">
      <div style="font-size:18px;font-weight:700;margin-bottom:12px;">Map failed to load</div>
      <pre style="white-space:pre-wrap;word-break:break-all;color:#fca5a5;font-size:13px;">${err?.stack ?? err}</pre>
      <div style="margin-top:16px;color:#94a3b8;font-size:12px;">Check the browser console for more details.</div>
    </div>`;
}

window.addEventListener("error", e => showError(e.error ?? e.message));
window.addEventListener("unhandledrejection", e => showError(e.reason));

try {

const PHP_PER_TWD = 1.845; // 1 TWD = 1.845 PHP

const DATA = await fetch("./taiwan_travel_dataset.json").then(r => r.json());
DATA.conversion_rate = PHP_PER_TWD;

const { map, fitToNodes } = initMap({ containerId: "map" });

const markers = initMarkers({
  map,
  nodes:          DATA.nodes,
  routes:         DATA.routes,
  conversionRate: DATA.conversion_rate,
});

const routeLayer = initRoutes({
  map,
  nodes:          DATA.nodes,
  routes:         DATA.routes,
  conversionRate: DATA.conversion_rate,
});

const highlight = initHighlight({
  map,
  markersInstance: markers,
  routesInstance:  routeLayer,
  nodes:           DATA.nodes,
  routes:          DATA.routes,
  conversionRate:  DATA.conversion_rate,
  transportMeta:   TRANSPORT_META,
});

markers.markerIndex.forEach((marker, nodeId) => {
  marker.on("click", () => highlight.highlightNode(nodeId));
});

map.on("click", () => highlight.clearHighlight());

markers.showAll();
routeLayer.showAll();
fitToNodes(DATA.nodes);

routeLayer.loadOSRMGeometry();
loadATMs(map, DATA.nodes);
loadConvenienceStores(map, DATA.nodes);

// ── Legend ────────────────────────────────────────────────────────────────
const legend = L.control({ position: "bottomright" });
legend.onAdd = () => {
  const div = L.DomUtil.create("div");
  div.innerHTML = `
    <div style="
      background:rgba(15,23,42,0.93);
      border:1px solid rgba(255,255,255,0.1);
      border-radius:10px;
      padding:12px 14px;
      font-family:'Segoe UI',sans-serif;
      font-size:12px;
      color:#e2e8f0;
      min-width:158px;
      box-shadow:0 4px 20px rgba(0,0,0,0.5);
      user-select:none;
    ">
      <div style="font-weight:700;font-size:10px;letter-spacing:2px;color:#94a3b8;margin-bottom:8px;">LEGEND</div>

      <div style="font-size:10px;letter-spacing:1px;color:#64748b;margin-bottom:5px;text-transform:uppercase;">Transport</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;"><span style="display:inline-block;width:22px;height:3px;background:#a855f7;border-radius:2px;flex-shrink:0;"></span>Airport MRT</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;"><span style="display:inline-block;width:22px;height:3px;background:#3b82f6;border-radius:2px;flex-shrink:0;"></span>MRT</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;"><span style="display:inline-block;width:22px;height:3px;background:#22c55e;border-radius:2px;flex-shrink:0;"></span>Train</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;"><span style="display:inline-block;width:22px;height:3px;background:#f97316;border-radius:2px;flex-shrink:0;"></span>Bus</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;"><span style="display:inline-block;width:22px;height:3px;background:#eab308;border-radius:2px;flex-shrink:0;"></span>Walk</div>

      <div style="font-size:10px;letter-spacing:1px;color:#64748b;margin-bottom:5px;text-transform:uppercase;">Services</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;"><span style="font-size:14px;">💳</span>EasyCard Reload</div>
      <div style="display:flex;align-items:center;gap:8px;"><span style="font-size:14px;">🏧</span>ATM</div>
    </div>`;
  L.DomEvent.disableClickPropagation(div);
  return div;
};
legend.addTo(map);

} catch (err) {
  showError(err);
}
