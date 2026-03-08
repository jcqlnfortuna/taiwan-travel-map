import { useState, useMemo } from "react";

const DATA = {
  conversion_rate: 1.845,
  nodes: [
    {"id":"airport","name":"Taoyuan International Airport","lat":25.0797,"lng":121.2342,"type":"airport"},
    {"id":"taipei_main","name":"Taipei Main Station","lat":25.0478,"lng":121.5170,"type":"transport"},
    {"id":"ximen","name":"Ximending","lat":25.0422,"lng":121.5078,"type":"hotel"},
    {"id":"cks","name":"Chiang Kai Shek Memorial Hall","lat":25.0345,"lng":121.5216,"type":"landmark"},
    {"id":"ntm","name":"National Taiwan Museum","lat":25.0433,"lng":121.5153,"type":"museum"},
    {"id":"sys","name":"Sun Yat Sen Memorial Hall","lat":25.0401,"lng":121.5603,"type":"landmark"},
    {"id":"taipei101","name":"Taipei 101","lat":25.0339,"lng":121.5645,"type":"landmark"},
    {"id":"raohe","name":"Raohe Night Market","lat":25.0503,"lng":121.5753,"type":"food"},
    {"id":"ruifang","name":"Ruifang Station","lat":25.1085,"lng":121.8066,"type":"train"},
    {"id":"houtong","name":"Houtong Cat Village","lat":25.0870,"lng":121.8270,"type":"attraction"},
    {"id":"jiufen","name":"Jiufen Old Street","lat":25.1099,"lng":121.8442,"type":"attraction"},
    {"id":"shifen","name":"Shifen Old Street","lat":25.0497,"lng":121.7750,"type":"attraction"},
    {"id":"waterfall","name":"Shifen Waterfall","lat":25.0490,"lng":121.7815,"type":"nature"}
  ],
  routes: [
    {"from":"airport","to":"taipei_main","transport":"airport_mrt","fare_twd":160,"time_min":35},
    {"from":"taipei_main","to":"ximen","transport":"mrt","fare_twd":20,"time_min":3},
    {"from":"ximen","to":"cks","transport":"mrt","fare_twd":20,"time_min":5},
    {"from":"cks","to":"ntm","transport":"mrt","fare_twd":20,"time_min":5},
    {"from":"ximen","to":"sys","transport":"mrt","fare_twd":25,"time_min":10},
    {"from":"sys","to":"taipei101","transport":"walk","fare_twd":0,"time_min":8},
    {"from":"taipei101","to":"raohe","transport":"mrt","fare_twd":25,"time_min":12},
    {"from":"taipei_main","to":"ruifang","transport":"train","fare_twd":76,"time_min":40},
    {"from":"ruifang","to":"houtong","transport":"train","fare_twd":15,"time_min":10},
    {"from":"ruifang","to":"jiufen","transport":"bus","fare_twd":15,"time_min":20},
    {"from":"jiufen","to":"taipei_main","transport":"bus","fare_twd":90,"time_min":60},
    {"from":"ruifang","to":"shifen","transport":"train","fare_twd":20,"time_min":30},
    {"from":"shifen","to":"waterfall","transport":"walk","fare_twd":0,"time_min":15}
  ]
};

const TYPE_META = {
  airport:    { icon: "✈", color: "#60a5fa", label: "Airport" },
  transport:  { icon: "🚉", color: "#a78bfa", label: "Transport Hub" },
  hotel:      { icon: "🏨", color: "#f472b6", label: "District" },
  landmark:   { icon: "🏛", color: "#fbbf24", label: "Landmark" },
  museum:     { icon: "🏺", color: "#34d399", label: "Museum" },
  food:       { icon: "🍜", color: "#fb923c", label: "Food" },
  train:      { icon: "🚂", color: "#94a3b8", label: "Station" },
  attraction: { icon: "⛩", color: "#f87171", label: "Attraction" },
  nature:     { icon: "🌊", color: "#22d3ee", label: "Nature" },
};

const TRANSPORT_META = {
  airport_mrt: { icon: "🚇", label: "Airport MRT", color: "#60a5fa" },
  mrt:         { icon: "🚇", label: "MRT", color: "#a78bfa" },
  train:       { icon: "🚂", label: "Train", color: "#fbbf24" },
  bus:         { icon: "🚌", label: "Bus", color: "#34d399" },
  walk:        { icon: "🚶", label: "Walk", color: "#94a3b8" },
};

// Dijkstra-based pathfinding (bidirectional routes)
function findPath(fromId, toId) {
  const graph = {};
  DATA.nodes.forEach(n => graph[n.id] = []);
  DATA.routes.forEach(r => {
    graph[r.from] = graph[r.from] || [];
    graph[r.to]   = graph[r.to]   || [];
    graph[r.from].push({ to: r.to,   route: r });
    graph[r.to].push(  { to: r.from, route: r });
  });

  const dist = {}, prev = {}, visited = new Set();
  DATA.nodes.forEach(n => dist[n.id] = Infinity);
  dist[fromId] = 0;
  const queue = [fromId];

  while (queue.length) {
    queue.sort((a, b) => dist[a] - dist[b]);
    const u = queue.shift();
    if (visited.has(u)) continue;
    visited.add(u);
    if (u === toId) break;
    for (const edge of (graph[u] || [])) {
      const alt = dist[u] + edge.route.time_min;
      if (alt < dist[edge.to]) {
        dist[edge.to] = alt;
        prev[edge.to] = { from: u, route: edge.route };
        queue.push(edge.to);
      }
    }
  }

  if (dist[toId] === Infinity) return null;
  const steps = [];
  let cur = toId;
  while (prev[cur]) {
    steps.unshift(prev[cur]);
    cur = prev[cur].from;
  }
  return { steps, totalTime: dist[toId], totalFare: steps.reduce((s, st) => s + st.route.fare_twd, 0) };
}

const nodeById = Object.fromEntries(DATA.nodes.map(n => [n.id, n]));

// SVG Map
function MapView({ selectedId, onSelect, pathNodes }) {
  const lngs = DATA.nodes.map(n => n.lng);
  const lats = DATA.nodes.map(n => n.lat);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const pad = 40;
  const W = 600, H = 340;

  const toX = lng => pad + ((lng - minLng) / (maxLng - minLng)) * (W - 2*pad);
  const toY = lat => H - pad - ((lat - minLat) / (maxLat - minLat)) * (H - 2*pad);

  const pathSet = new Set(pathNodes || []);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", borderRadius: 16, background: "rgba(15,20,40,0.85)" }}>
      {/* Route lines */}
      {DATA.routes.map((r, i) => {
        const a = nodeById[r.from], b = nodeById[r.to];
        const isPath = pathSet.has(r.from) && pathSet.has(r.to);
        return (
          <line key={i}
            x1={toX(a.lng)} y1={toY(a.lat)} x2={toX(b.lng)} y2={toY(b.lat)}
            stroke={isPath ? "#fbbf24" : "rgba(148,163,184,0.18)"}
            strokeWidth={isPath ? 3 : 1.2}
            strokeDasharray={isPath ? "none" : "4 3"}
          />
        );
      })}
      {/* Nodes */}
      {DATA.nodes.map(n => {
        const meta = TYPE_META[n.type] || {};
        const isSelected = n.id === selectedId;
        const isPath = pathSet.has(n.id);
        return (
          <g key={n.id} onClick={() => onSelect(n.id)} style={{ cursor: "pointer" }}>
            <circle cx={toX(n.lng)} cy={toY(n.lat)} r={isSelected ? 14 : isPath ? 12 : 9}
              fill={isSelected ? meta.color : isPath ? meta.color : "rgba(30,40,70,0.9)"}
              stroke={meta.color} strokeWidth={isSelected ? 3 : 1.5}
              style={{ filter: isSelected ? `drop-shadow(0 0 8px ${meta.color})` : "none", transition: "all 0.2s" }}
            />
            <text x={toX(n.lng)} y={toY(n.lat) + 1} textAnchor="middle" dominantBaseline="middle"
              fontSize={isSelected ? 11 : 9} style={{ pointerEvents: "none", userSelect: "none" }}>
              {meta.icon}
            </text>
            {isSelected && (
              <text x={toX(n.lng)} y={toY(n.lat) - 18} textAnchor="middle"
                fill="white" fontSize={9} fontWeight="bold"
                style={{ pointerEvents: "none", textShadow: "0 1px 4px #000" }}>
                {n.name.length > 18 ? n.name.slice(0,17)+"…" : n.name}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState("explore");
  const [selectedId, setSelectedId] = useState(null);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");

  const selectedNode = selectedId ? nodeById[selectedId] : null;
  const connectedRoutes = selectedId
    ? DATA.routes.filter(r => r.from === selectedId || r.to === selectedId)
    : [];

  const pathResult = useMemo(() => {
    if (fromId && toId && fromId !== toId) return findPath(fromId, toId);
    return null;
  }, [fromId, toId]);

  const pathNodes = pathResult
    ? [fromId, ...pathResult.steps.map(s => s.route.to !== fromId ? s.route.to : s.route.from), toId]
    : [];

  const twd = n => `NT$${n}`;
  const usd = n => `$${(n / DATA.conversion_rate).toFixed(2)}`;

  return (
    <div style={{
      minHeight: "100vh", background: "linear-gradient(135deg, #06090f 0%, #0d1526 50%, #080d1a 100%)",
      fontFamily: "'Georgia', 'Times New Roman', serif", color: "#e2e8f0", padding: "0"
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Source+Code+Pro:wght@400;600&display=swap');
        * { box-sizing: border-box; }
        .tab-btn { background: none; border: none; cursor: pointer; padding: 10px 22px; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; transition: all 0.2s; font-family: 'Source Code Pro', monospace; }
        .tab-active { color: #fbbf24; border-bottom: 2px solid #fbbf24; }
        .tab-inactive { color: #64748b; border-bottom: 2px solid transparent; }
        .card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 16px; }
        .route-row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .pill { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-family: 'Source Code Pro', monospace; }
        select { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; color: #e2e8f0; padding: 10px 14px; font-size: 14px; width: 100%; outline: none; cursor: pointer; }
        select option { background: #1e293b; }
        .node-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 20px; font-size: 12px; cursor: pointer; transition: all 0.15s; border: 1px solid transparent; }
        .node-chip:hover { opacity: 0.85; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "20px 28px 0" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 4, color: "#fbbf24", fontFamily: "'Source Code Pro', monospace", marginBottom: 4 }}>
              TAIWAN TRAVEL GUIDE
            </div>
            <h1 style={{ margin: 0, fontSize: 28, fontFamily: "'Playfair Display', serif", fontWeight: 700, letterSpacing: "-0.5px" }}>
              Explorer
            </h1>
          </div>
          <div style={{ fontSize: 11, color: "#475569", fontFamily: "'Source Code Pro', monospace", textAlign: "right" }}>
            {DATA.nodes.length} locations<br/>
            {DATA.routes.length} routes
          </div>
        </div>
        <div style={{ display: "flex", gap: 0 }}>
          {[["explore","Explore"],["route","Route Planner"]].map(([key, label]) => (
            <button key={key} className={`tab-btn ${activeTab === key ? "tab-active" : "tab-inactive"}`}
              onClick={() => setActiveTab(key)}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "20px 28px", maxWidth: 860, margin: "0 auto" }}>
        {activeTab === "explore" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {/* Map */}
            <div style={{ gridColumn: "1 / -1" }}>
              <MapView selectedId={selectedId} onSelect={id => setSelectedId(id === selectedId ? null : id)} pathNodes={[]} />
              <div style={{ fontSize: 11, color: "#475569", textAlign: "center", marginTop: 6, fontFamily: "'Source Code Pro', monospace" }}>
                click any node to explore
              </div>
            </div>

            {/* Nodes grid */}
            <div className="card" style={{ gridColumn: "1 / -1" }}>
              <div style={{ fontSize: 11, letterSpacing: 3, color: "#64748b", marginBottom: 12, fontFamily: "'Source Code Pro', monospace" }}>ALL LOCATIONS</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {DATA.nodes.map(n => {
                  const meta = TYPE_META[n.type] || {};
                  const isSelected = n.id === selectedId;
                  return (
                    <div key={n.id} className="node-chip"
                      onClick={() => setSelectedId(n.id === selectedId ? null : n.id)}
                      style={{
                        background: isSelected ? meta.color + "22" : "rgba(255,255,255,0.04)",
                        borderColor: isSelected ? meta.color : "rgba(255,255,255,0.1)",
                        color: isSelected ? meta.color : "#94a3b8"
                      }}>
                      {meta.icon} <span style={{ fontFamily: "'Source Code Pro', monospace", fontSize: 11 }}>{n.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Node detail */}
            {selectedNode && (
              <div className="card" style={{ gridColumn: "1 / -1", borderColor: (TYPE_META[selectedNode.type]?.color || "#fff") + "44" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                  <div style={{ fontSize: 32 }}>{TYPE_META[selectedNode.type]?.icon}</div>
                  <div>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700 }}>{selectedNode.name}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                      <span className="pill" style={{ background: (TYPE_META[selectedNode.type]?.color || "#fff") + "22", color: TYPE_META[selectedNode.type]?.color }}>
                        {TYPE_META[selectedNode.type]?.label}
                      </span>
                      <span className="pill" style={{ background: "rgba(255,255,255,0.06)", color: "#64748b" }}>
                        {selectedNode.lat.toFixed(4)}, {selectedNode.lng.toFixed(4)}
                      </span>
                    </div>
                  </div>
                </div>

                {connectedRoutes.length > 0 && (
                  <>
                    <div style={{ fontSize: 11, letterSpacing: 3, color: "#64748b", marginBottom: 8, fontFamily: "'Source Code Pro', monospace" }}>CONNECTIONS</div>
                    {connectedRoutes.map((r, i) => {
                      const other = nodeById[r.from === selectedId ? r.to : r.from];
                      const tm = TRANSPORT_META[r.transport] || {};
                      const dir = r.from === selectedId ? "→" : "←";
                      return (
                        <div key={i} className="route-row">
                          <span className="pill" style={{ background: tm.color + "22", color: tm.color }}>{tm.icon} {tm.label}</span>
                          <span style={{ color: "#64748b", fontFamily: "'Source Code Pro', monospace" }}>{dir}</span>
                          <span style={{ flex: 1, cursor: "pointer", color: "#e2e8f0" }}
                            onClick={() => setSelectedId(other.id)}>
                            {other.name}
                          </span>
                          <span style={{ fontFamily: "'Source Code Pro', monospace", fontSize: 12, color: "#94a3b8" }}>
                            {r.time_min} min
                          </span>
                          <span style={{ fontFamily: "'Source Code Pro', monospace", fontSize: 12, color: r.fare_twd === 0 ? "#34d399" : "#fbbf24" }}>
                            {r.fare_twd === 0 ? "Free" : twd(r.fare_twd)}
                          </span>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "route" && (
          <div style={{ display: "grid", gap: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, letterSpacing: 3, color: "#64748b", display: "block", marginBottom: 6, fontFamily: "'Source Code Pro', monospace" }}>FROM</label>
                <select value={fromId} onChange={e => setFromId(e.target.value)}>
                  <option value="">Select origin…</option>
                  {DATA.nodes.map(n => <option key={n.id} value={n.id}>{TYPE_META[n.type]?.icon} {n.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, letterSpacing: 3, color: "#64748b", display: "block", marginBottom: 6, fontFamily: "'Source Code Pro', monospace" }}>TO</label>
                <select value={toId} onChange={e => setToId(e.target.value)}>
                  <option value="">Select destination…</option>
                  {DATA.nodes.map(n => <option key={n.id} value={n.id}>{TYPE_META[n.type]?.icon} {n.name}</option>)}
                </select>
              </div>
            </div>

            {fromId && toId && (
              <MapView selectedId={null} onSelect={() => {}} pathNodes={pathNodes} />
            )}

            {pathResult && (
              <div className="card" style={{ borderColor: "#fbbf2444" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18 }}>Fastest Route</div>
                  <div style={{ display: "flex", gap: 12 }}>
                    <span className="pill" style={{ background: "#fbbf2422", color: "#fbbf24" }}>⏱ {pathResult.totalTime} min</span>
                    <span className="pill" style={{ background: pathResult.totalFare === 0 ? "#34d39922" : "#fb923c22", color: pathResult.totalFare === 0 ? "#34d399" : "#fb923c" }}>
                      {pathResult.totalFare === 0 ? "Free" : `${twd(pathResult.totalFare)} · ${usd(pathResult.totalFare)}`}
                    </span>
                  </div>
                </div>

                {/* Steps */}
                {(() => {
                  const stepNodes = [nodeById[fromId], ...pathResult.steps.map(s => nodeById[s.route.to === (pathResult.steps[0]?.route.from === fromId ? s.route.to : s.route.from)])];
                  // Reconstruct proper node sequence
                  const seq = [fromId];
                  pathResult.steps.forEach(s => {
                    const next = s.route.from === seq[seq.length-1] ? s.route.to : s.route.from;
                    seq.push(next);
                  });
                  return seq.map((nid, i) => {
                    const n = nodeById[nid];
                    const meta = TYPE_META[n.type] || {};
                    const route = pathResult.steps[i];
                    return (
                      <div key={i}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                            background: meta.color + "22", border: `2px solid ${meta.color}`, fontSize: 14, flexShrink: 0
                          }}>{meta.icon}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{n.name}</div>
                            <div style={{ fontSize: 11, color: "#64748b", fontFamily: "'Source Code Pro', monospace" }}>{meta.label}</div>
                          </div>
                          {i === 0 && <span className="pill" style={{ background: "#34d39922", color: "#34d399", fontSize: 10 }}>START</span>}
                          {i === seq.length - 1 && <span className="pill" style={{ background: "#f87171 22", color: "#f87171", fontSize: 10 }}>END</span>}
                        </div>
                        {route && (
                          <div style={{ marginLeft: 16, paddingLeft: 20, borderLeft: "2px dashed rgba(255,255,255,0.1)", margin: "4px 0 4px 15px" }}>
                            <div className="route-row" style={{ paddingLeft: 8 }}>
                              {(() => {
                                const tm = TRANSPORT_META[route.route.transport] || {};
                                return (
                                  <>
                                    <span className="pill" style={{ background: tm.color + "22", color: tm.color }}>{tm.icon} {tm.label}</span>
                                    <span style={{ flex: 1 }}/>
                                    <span style={{ fontFamily: "'Source Code Pro', monospace", fontSize: 11, color: "#94a3b8" }}>{route.route.time_min} min</span>
                                    <span style={{ fontFamily: "'Source Code Pro', monospace", fontSize: 11, color: route.route.fare_twd === 0 ? "#34d399" : "#fbbf24" }}>
                                      {route.route.fare_twd === 0 ? "Free" : twd(route.route.fare_twd)}
                                    </span>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            )}

            {fromId && toId && fromId !== toId && !pathResult && (
              <div className="card" style={{ textAlign: "center", color: "#ef4444", fontFamily: "'Source Code Pro', monospace", fontSize: 13 }}>
                No route found between these locations.
              </div>
            )}

            {/* All routes reference */}
            <div className="card">
              <div style={{ fontSize: 11, letterSpacing: 3, color: "#64748b", marginBottom: 12, fontFamily: "'Source Code Pro', monospace" }}>ALL ROUTES REFERENCE</div>
              {DATA.routes.map((r, i) => {
                const tm = TRANSPORT_META[r.transport] || {};
                const a = nodeById[r.from], b = nodeById[r.to];
                return (
                  <div key={i} className="route-row">
                    <span style={{ fontSize: 12, flex: 1, color: "#cbd5e1" }}>
                      {TYPE_META[a.type]?.icon} {a.name} <span style={{ color: "#475569" }}>→</span> {TYPE_META[b.type]?.icon} {b.name}
                    </span>
                    <span className="pill" style={{ background: tm.color + "22", color: tm.color, flexShrink: 0 }}>{tm.icon} {tm.label}</span>
                    <span style={{ fontFamily: "'Source Code Pro', monospace", fontSize: 11, color: "#94a3b8", flexShrink: 0, minWidth: 52, textAlign: "right" }}>{r.time_min} min</span>
                    <span style={{ fontFamily: "'Source Code Pro', monospace", fontSize: 11, flexShrink: 0, minWidth: 62, textAlign: "right", color: r.fare_twd === 0 ? "#34d399" : "#fbbf24" }}>
                      {r.fare_twd === 0 ? "Free" : twd(r.fare_twd)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}