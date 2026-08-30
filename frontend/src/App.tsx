import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, AlertTriangle, ArrowRight, BarChart3, Bot, Boxes, CheckCircle2,
  ChevronRight, CircleGauge, Clock3, Cog, Database, Gauge, HeartPulse, History,
  Layers3, Menu, Moon, Network, Pause, Play, Radar, RefreshCcw, Route, Satellite,
  Settings2, ShieldAlert, SlidersHorizontal, Sparkles, Thermometer, Video, Wrench,
  X, Zap,
} from 'lucide-react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { VideoCarousel } from './VideoCarousel'

const DigitalTwin3DPanel = lazy(() => import('./twin3d/DigitalTwin3DPanel').then(module => ({ default: module.DigitalTwin3DPanel })))

type Twin = Record<string, any>
// During Vite development use the configured same-origin proxy. This keeps the
// REST and WebSocket twin link local, avoids cross-origin browser restrictions,
// and mirrors the production Nginx setup. A deployed build may still supply an
// explicit API URL when it is not hosted behind that proxy.
const API_BASE = (import.meta as any).env?.DEV ? '' : (import.meta as any).env?.VITE_API_URL || ''
const api = (path: string) => `${API_BASE}${path}`

const navigation = [
  ['Dashboard', '/dashboard', CircleGauge], ['Digital Twin', '/digital-twin', Boxes],
  ['Telemetry', '/telemetry', Activity], ['Health', '/health', HeartPulse],
  ['Fault Prediction', '/prediction', Bot], ['Mission Reliability', '/mission', Route],
  ['Maintenance', '/maintenance', Wrench], ['History', '/history', History],
  ['Simulation', '/simulation', SlidersHorizontal], ['Project Video', '/video', Video],
  ['Architecture', '/architecture', Network], ['About', '/about', Sparkles],
] as const

const faultOptions = [
  ['normal', 'Normal operation', 'Healthy synthetic baseline'],
  ['overheating', 'Overheating', 'Thermal signal escalation'],
  ['low_oil_pressure', 'Low oil pressure', 'Lubrication risk trend'],
  ['excessive_vibration', 'Excessive vibration', 'Mechanical condition signal'],
  ['abnormal_fuel_flow', 'Fuel abnormality', 'Fuel-flow / pressure deviation'],
  ['cooling_degradation', 'Cooling degradation', 'Progressive thermal-management loss'],
  ['sensor_anomaly', 'Sensor anomaly', 'Telemetry consistency deviation'],
  ['progressive_degradation', 'Progressive degradation', 'Multi-system health decline'],
]

function useTwin() {
  const [twin, setTwin] = useState<Twin | null>(null)
  const [history, setHistory] = useState<Twin[]>([])
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')

  const hydrate = useCallback(async () => {
    try {
      const [engine, health, telemetry, prediction, mission, maintenance, alerts, snapshots] = await Promise.all(
        ['/api/engine', '/api/health', '/api/telemetry/latest', '/api/prediction', '/api/mission', '/api/maintenance', '/api/alerts', '/api/history?limit=180']
          .map(path => fetch(api(path)).then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      )
      setTwin({ ...engine, health, telemetry, prediction, mission, maintenance, alerts: alerts.live || [] })
      setHistory(Array.isArray(snapshots) ? snapshots.slice(-180) : [])
      setError('')
    } catch {
      setError('Backend unavailable. Start the local FastAPI service to enable the live twin.')
    }
  }, [])

  useEffect(() => {
    hydrate()
    let socket: WebSocket | undefined
    let retry: number | undefined
    const connect = () => {
      const base = API_BASE ? API_BASE.replace(/^http/, 'ws') : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
      socket = new WebSocket(`${base}/ws/telemetry`)
      socket.onopen = () => { setConnected(true); setError('') }
      socket.onmessage = event => {
        const incoming = JSON.parse(event.data)
        setTwin(incoming)
        setHistory(previous => [...previous, incoming].slice(-180))
      }
      socket.onerror = () => socket?.close()
      socket.onclose = () => { setConnected(false); retry = window.setTimeout(connect, 2500) }
    }
    connect()
    return () => { if (retry) clearTimeout(retry); socket?.close() }
  }, [hydrate])

  const command = useCallback(async (path: string, body?: unknown) => {
    const response = await fetch(api(path), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    if (!response.ok) throw new Error(`Command failed (${response.status})`)
    const result = await response.json()
    setTwin(result)
    setHistory(previous => {
      const latest = previous[previous.length - 1]
      return latest?.updated_at === result.updated_at ? previous : [...previous, result].slice(-180)
    })
    return result
  }, [])

  return { twin, history, connected, error, hydrate, command }
}

function navigate(path: string) {
  history.pushState({}, '', path)
  window.dispatchEvent(new Event('popstate'))
}

function usePath() {
  const [path, setPath] = useState(location.pathname)
  useEffect(() => { const change = () => setPath(location.pathname); addEventListener('popstate', change); return () => removeEventListener('popstate', change) }, [])
  return path
}

function formatTime(timestamp?: string) {
  if (!timestamp) return '—'
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(timestamp))
}

function severityClass(value = '') { return value.toLowerCase().replaceAll(' ', '-') }
function riskColor(value?: number) { return (value || 0) >= 75 ? '#f16673' : (value || 0) >= 50 ? '#efb45e' : '#48d5b1' }
function healthColor(value?: number) { return (value || 0) >= 90 ? '#49d7b1' : (value || 0) >= 75 ? '#68b9f5' : (value || 0) >= 50 ? '#f4bc62' : '#f16673' }

function Badge({ value }: { value: string }) { return <span className={`badge ${severityClass(value)}`}>{value}</span> }

function MetricCard({ label, value, unit, icon: Icon, tone = 'cyan', caption }: { label: string, value: string | number, unit?: string, icon: any, tone?: string, caption?: string }) {
  return <article className={`metric-card tone-${tone}`}>
    <div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={17} /></span></div>
    <div className="metric-value">{value}<small>{unit}</small></div>
    {caption && <p>{caption}</p>}
  </article>
}

function Panel({ title, action, children, className = '' }: { title?: string, action?: any, children: any, className?: string }) {
  return <section className={`panel ${className}`}>{title && <div className="panel-heading"><h2>{title}</h2>{action}</div>}{children}</section>
}

function EngineSchematic({ twin, hero = false }: { twin: Twin, hero?: boolean }) {
  const tel = twin?.telemetry || {}
  const health = twin?.health?.overall || 96
  const heat = Math.max(0, Math.min(1, ((tel.cylinder_temperature || 148) - 125) / 75))
  const fault = activeFault(twin)
  const marker = imageFaultMarkers[fault]
  return <div className={`engine-scene ${hero ? 'hero-engine' : ''}`} aria-label="Animated synthetic generic aero piston engine schematic">
    <div className="scene-grid" />
    <div className="orbital orbital-a" /><div className="orbital orbital-b" />
    <div className="engine-halo" style={{ '--health': healthColor(health) } as any} />
    <div className="engine-core" style={{ '--heat': `hsl(${190 - heat * 175} 78% 58%)` } as any}>
      <div className="propeller"><i /><i /><i /></div>
      <div className="engine-block"><span /><span /><span /><span /></div>
      <div className="engine-label">APT<br /><b>SIM</b></div>
    </div>
    <div className="node node-rpm"><b>{Math.round(tel.rpm || 2240)}</b><small>RPM</small></div>
    <div className="node node-temp"><b>{Math.round(tel.cylinder_temperature || 148)}°</b><small>CYL TEMP</small></div>
    <div className="node node-oil"><b>{tel.oil_pressure || 4.1}</b><small>OIL BAR</small></div>
    <div className="node node-health"><b>{health}%</b><small>HEALTH</small></div>
    {!hero && marker && <div className={`fault-marker ${marker.position}`}><i /><span>{marker.label}</span></div>}
  </div>
}

function activeFault(twin: Twin) {
  const scenario = twin?.settings?.active_fault
  return scenario && scenario !== 'normal' ? scenario : twin?.prediction?.predicted_fault
}

const imageFaultMarkers: Record<string, { label: string, position: string }> = {
  overheating: { label: 'THERMAL FAULT', position: 'thermal' },
  low_oil_pressure: { label: 'OIL FAULT', position: 'oil' },
  excessive_vibration: { label: 'MECHANICAL FAULT', position: 'mechanical' },
  abnormal_fuel_flow: { label: 'FUEL FAULT', position: 'fuel' },
  cooling_degradation: { label: 'COOLING FAULT', position: 'thermal' },
  sensor_anomaly: { label: 'SENSOR FAULT', position: 'sensor' },
  progressive_degradation: { label: 'SYSTEM FAULT', position: 'system' },
}

const faultModelTargets: Record<string, { label: string, parts: string[] }> = {
  overheating: { label: 'Thermal / cylinder assembly', parts: ['cylinders', 'cooling'] },
  low_oil_pressure: { label: 'Lubrication pump', parts: ['oil-pump'] },
  excessive_vibration: { label: 'Crankcase / propeller assembly', parts: ['crankcase', 'propeller'] },
  abnormal_fuel_flow: { label: 'Fuel rail', parts: ['fuel-rail'] },
  cooling_degradation: { label: 'Cooling manifold', parts: ['cooling', 'cylinders'] },
  sensor_anomaly: { label: 'Telemetry sensor module', parts: ['sensor'] },
  progressive_degradation: { label: 'Multi-system engine assembly', parts: ['cylinders', 'crankcase', 'oil-pump', 'fuel-rail'] },
}

function CadEngineModel({ twin }: { twin: Twin }) {
  const drag = useRef<{ x: number, y: number, rotateX: number, rotateY: number } | null>(null)
  const [rotation, setRotation] = useState({ rotateX: -13, rotateY: -28 })
  const fault = activeFault(twin)
  const target = faultModelTargets[fault] || null
  const isFaulty = (part: string) => target?.parts.includes(part) || false

  const moveModel = (event: React.PointerEvent<HTMLElement>) => {
    if (!drag.current) return
    setRotation({
      rotateX: Math.max(-58, Math.min(30, drag.current.rotateX - (event.clientY - drag.current.y) * .28)),
      rotateY: drag.current.rotateY + (event.clientX - drag.current.x) * .38,
    })
  }

  const startDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    drag.current = { x: event.clientX, y: event.clientY, ...rotation }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const stopDrag = () => { drag.current = null }
  const modelStyle = { '--cad-x': `${rotation.rotateX}deg`, '--cad-y': `${rotation.rotateY}deg` } as any

  return <section
    className="cad-engine-viewer"
    aria-label="Interactive three-dimensional CAD-style engine model"
    onPointerMove={moveModel}
    onPointerDown={startDrag}
    onPointerUp={stopDrag}
    onPointerCancel={stopDrag}
    onPointerLeave={stopDrag}
  >
    <div className="cad-viewer-bar"><span><Boxes size={15} /> 3D CAD TWIN</span><small>{target ? <><i className="fault-dot" /> FAULT: {target.label}</> : 'LEFT-CLICK + DRAG TO ROTATE'}</small></div>
    <div className="cad-stage">
      <div className="cad-grid" />
      <div className="cad-assembly" style={modelStyle}>
        <div className={`cad-part cad-propeller ${isFaulty('propeller') ? 'faulty' : ''}`}><i /><i /><i /><i /><b>PROP</b></div>
        <div className={`cad-part cad-crankcase ${isFaulty('crankcase') ? 'faulty' : ''}`}><span className="cad-case-face" /><span className="cad-case-side" /><b>CRANKCASE</b></div>
        <div className={`cad-part cad-cylinder-bank left ${isFaulty('cylinders') ? 'faulty' : ''}`}><i /><i /><i /><b>CYL A</b></div>
        <div className={`cad-part cad-cylinder-bank right ${isFaulty('cylinders') ? 'faulty' : ''}`}><i /><i /><i /><b>CYL B</b></div>
        <div className={`cad-part cad-cooling ${isFaulty('cooling') ? 'faulty' : ''}`}><i /><i /><i /><i /><b>COOLING</b></div>
        <div className={`cad-part cad-oil-pump ${isFaulty('oil-pump') ? 'faulty' : ''}`}><i /><b>OIL</b></div>
        <div className={`cad-part cad-fuel-rail ${isFaulty('fuel-rail') ? 'faulty' : ''}`}><i /><i /><i /><b>FUEL</b></div>
        <div className={`cad-part cad-sensor ${isFaulty('sensor') ? 'faulty' : ''}`}><i /><b>SENSOR</b></div>
      </div>
      <p className="cad-instruction">Left-click and drag to rotate</p>
    </div>
  </section>
}

function LiveChart({ data, lines, height = 260 }: { data: Twin[], lines: { key: string, name: string, color: string }[], height?: number }) {
  const cleaned = data.map((entry: any, index) => ({ t: formatTime(entry.telemetry?.timestamp || entry.timestamp) || `${index}`, ...(entry.telemetry || entry) }))
  return <div className="chart" style={{ height }}><ResponsiveContainer width="100%" height="100%"><LineChart data={cleaned} margin={{ left: -18, right: 8, top: 12, bottom: 0 }}>
    <CartesianGrid vertical={false} stroke="#213641" strokeDasharray="3 5" />
    <XAxis dataKey="t" minTickGap={52} tick={{ fill: '#88a6b2', fontSize: 10 }} axisLine={false} tickLine={false} />
    <YAxis tick={{ fill: '#88a6b2', fontSize: 10 }} axisLine={false} tickLine={false} width={38} />
    <Tooltip contentStyle={{ background: '#0d202b', border: '1px solid #34515c', borderRadius: 8 }} labelStyle={{ color: '#c7d9e0' }} />
    {lines.map(line => <Line key={line.key} type="monotone" dataKey={line.key} name={line.name} stroke={line.color} strokeWidth={2} dot={false} />)}
  </LineChart></ResponsiveContainer></div>
}

function Shell({ path, twin, connected, onMenu, children }: any) {
  const [menuOpen, setMenuOpen] = useState(false)
  const activeTitle = navigation.find(n => n[1] === path)?.[0] || 'AeroTwin'
  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
      <button className="brand" onClick={() => navigate('/')} aria-label="Go to AeroTwin home"><span className="brand-mark"><Satellite size={20} /></span><span>AERO<span>TWIN</span><small>DIGITAL TWIN SYSTEM</small></span></button>
      <div className="demo-flag"><span className="pulse" /> DEMO MODE <small>SYNTHETIC DATA</small></div>
      <nav aria-label="Primary navigation">{navigation.map(([label, href, Icon]) => <button key={href} className={path === href ? 'active' : ''} onClick={() => { navigate(href); setMenuOpen(false) }}><Icon size={17} />{label}</button>)}</nav>
      <div className="side-bottom"><span><span className={`connection-dot ${connected ? '' : 'off'}`} />{connected ? 'LIVE LINK' : 'RECONNECTING'}</span><small>Generic aero piston engine<br />MALE UAV simulation</small></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation"><Menu size={20} /></button><div><div className="breadcrumb">AEROTWIN / <span>{activeTitle.toUpperCase()}</span></div><h1>{activeTitle}</h1></div><div className="top-status"><span className={`live-pill ${connected ? '' : 'offline'}`}><i />{connected ? 'LIVE' : 'DISCONNECTED'}</span><span className="time-stamp">{formatTime(twin?.updated_at)}</span><button aria-label="Settings" onClick={() => navigate('/simulation')}><Settings2 size={18} /></button></div></header>
      <div className="page-content">{children}</div>
    </main>
  </div>
}

function Landing({ twin }: { twin: Twin | null }) {
  return <div className="landing">
    <header className="landing-nav"><button className="brand" onClick={() => navigate('/')}><span className="brand-mark"><Satellite size={20} /></span><span>AERO<span>TWIN</span><small>DIGITAL TWIN SYSTEM</small></span></button><div className="landing-links"><button onClick={() => navigate('/about')}>Overview</button><button onClick={() => navigate('/architecture')}>Architecture</button><button onClick={() => navigate('/video')}>Project Demo</button><button className="button primary compact" onClick={() => navigate('/dashboard')}>Launch Twin <ArrowRight size={15} /></button></div></header>
    <section className="hero"><div className="hero-copy"><div className="eyebrow"><span className="pulse" /> REAL-TIME SYNTHETIC DEMONSTRATOR</div><h1>AI-enabled<br /><em>digital twin</em><br />for engine health.</h1><p>Continuous health monitoring, explainable fault prediction, and simulated mission reliability for a <b>generic aero piston engine</b> in a MALE UAV simulation.</p><div className="hero-buttons"><button className="button primary" onClick={() => navigate('/dashboard')}>Launch Digital Twin <ArrowRight size={17} /></button><button className="button ghost" onClick={() => navigate('/video')}><Play size={16} /> Watch demonstration</button></div><div className="hero-stats"><span><b>LIVE</b> sensor telemetry</span><span><b>AI</b> fault classification</span><span><b>RUL</b> condition indicator</span></div></div><EngineSchematic twin={twin || {}} hero /></section>
    <section className="landing-strip"><div><Radar /><span><b>Detect</b> anomaly signals against an Isolation Forest baseline.</span></div><div><Bot /><span><b>Predict</b> fault classes with explainable ML confidence.</span></div><div><Route /><span><b>Assess</b> health-driven simulated mission reliability.</span></div></section>
    <section className="landing-features"><div className="section-intro"><span>ENGINEERING INTELLIGENCE</span><h2>One connected health narrative.</h2><p>Every screen reads the same continuously evolving synthetic twin—not static dashboard values.</p></div><div className="feature-grid"><Feature icon={Activity} title="Live telemetry" text="Correlated RPM, thermal, pressure, fuel, vibration, altitude and flight-state signals." /><Feature icon={ShieldAlert} title="Early warning" text="Dynamic alert severity and affected-parameter explanations keep risk understandable." /><Feature icon={Wrench} title="Predictive maintenance" text="High-level condition recommendations are generated from twin health and AI evidence." /></div></section>
    <footer>© 2026 AeroTwin • Software research & monitoring demonstrator • All values are simulated/synthetic</footer>
  </div>
}

function Feature({ icon: Icon, title, text }: any) { return <article className="feature"><span><Icon size={22} /></span><h3>{title}</h3><p>{text}</p><button onClick={() => navigate('/dashboard')}>Explore <ChevronRight size={15} /></button></article> }

function Dashboard({ twin, data, command }: any) {
  const tel = twin.telemetry, pred = twin.prediction, health = twin.health, mission = twin.mission
  return <><div className="page-intro"><div><span className="eyebrow">DEMO MODE · SYNTHETIC ENGINE ID {twin.engine_id}</span><h2>Operational overview</h2><p>Live virtual representation of the generic aero piston engine.</p></div><button className="button ghost compact" onClick={() => command(twin.settings.running ? '/api/simulation/pause' : '/api/simulation/start')} >{twin.settings.running ? <Pause size={15} /> : <Play size={15} />}{twin.settings.running ? 'Pause simulation' : 'Resume simulation'}</button></div>
    <div className="metrics-grid"><MetricCard label="Overall health" value={health.overall} unit="%" icon={HeartPulse} tone={health.state === 'HEALTHY' ? 'green' : 'orange'} caption={health.state} /><MetricCard label="Fault risk" value={pred.risk} icon={ShieldAlert} tone={pred.risk === 'LOW' ? 'cyan' : 'red'} caption={`${pred.confidence}% model confidence`} /><MetricCard label="Anomaly score" value={pred.anomaly_score} unit=" / 100" icon={Radar} tone={pred.anomaly_score < 35 ? 'cyan' : 'orange'} caption={pred.anomaly_status} /><MetricCard label="Estimated RUL" value={twin.estimated_rul_hours} unit=" h" icon={Clock3} tone="blue" caption="Simulated condition indicator" /><MetricCard label="Mission reliability" value={mission.reliability_score} unit="%" icon={Route} tone={mission.reliability_score > 78 ? 'green' : 'red'} caption={`${mission.mission_risk} mission risk`} /><MetricCard label="Current RPM" value={Math.round(tel.rpm)} unit=" rpm" icon={Gauge} tone="cyan" caption={`${tel.load}% engine load`} /></div>
    <div className="dashboard-main"><Panel title="Live telemetry" action={<span className="panel-note"><i className="signal" /> 1-second stream</span>}><LiveChart data={data} lines={[{ key: 'rpm', name: 'RPM', color: '#51d6e5' }, { key: 'cylinder_temperature', name: 'Cylinder °C', color: '#efad5d' }]} /></Panel><Panel title="Digital twin status" className="twin-summary"><EngineSchematic twin={twin} /><div className="twin-status-line"><span>OPERATING STATE</span><b>{twin.operating_state}</b></div><div className="twin-status-line"><span>ACTIVE SCENARIO</span><b>{twin.settings.fault_label}</b></div><div className="twin-status-line"><span>LAST UPDATE</span><b>{formatTime(twin.updated_at)}</b></div><button className="text-button" onClick={() => navigate('/digital-twin')}>Inspect virtual twin <ArrowRight size={14} /></button></Panel></div>
    <div className="dashboard-bottom"><Panel title="AI fault assessment"><div className="assessment"><div className="prediction-orb" style={{ '--progress': `${pred.confidence}%`, '--color': riskColor(pred.confidence) } as any}><b>{pred.confidence}%</b><small>CONFIDENCE</small></div><div><Badge value={pred.risk} /><h3>{pred.predicted_fault_label}</h3><p>{pred.affected_parameters?.length ? `Signals requiring attention: ${pred.affected_parameters.slice(0, 3).join(', ')}.` : 'All monitored signals match the learned normal operating baseline.'}</p><button className="text-button" onClick={() => navigate('/prediction')}>View explainable AI <ArrowRight size={14} /></button></div></div></Panel><Alerts alerts={twin.alerts} command={command} /></div>
  </>
}

function Alerts({ alerts, command }: any) { return <Panel title="Recent alerts" action={<button className="text-button" onClick={() => navigate('/history')}>Timeline <ArrowRight size={14} /></button>}><div className="alerts-list">{alerts?.length ? alerts.slice(0, 5).map((alert: any) => <article className={`alert-row ${severityClass(alert.severity)}`} key={alert.id}><span className="alert-symbol"><AlertTriangle size={15} /></span><div><div><Badge value={alert.severity} /><time>{formatTime(alert.timestamp)}</time></div><p>{alert.message}</p></div>{!alert.acknowledged && <button aria-label="Acknowledge alert" onClick={() => command(`/api/alerts/${alert.id}/acknowledge`)}><CheckCircle2 size={16} /></button>}</article>) : <Empty text="No active alerts — monitoring live baseline." />}</div></Panel> }

function DigitalTwinPage({ twin }: any) { return <><div className="page-intro"><div><span className="eyebrow">LIVE 3D ENGINE INSPECTION · CC0 REFERENCE MODEL</span><h2>Digital Twin</h2><p>Real scanned aero piston engine geometry, synchronized with this application’s existing WebSocket telemetry and AI condition state.</p></div><Badge value={twin.health.state} /></div><Suspense fallback={<Panel title="Interactive 3D engine inspection"><div className="empty"><Boxes size={18} /><span>Loading 3D inspection workspace…</span></div></Panel>}><DigitalTwin3DPanel twin={twin} /></Suspense><ComponentHealth components={twin.component_health} /><div className="two-col"><Panel title="Twin health rationale"><p className="info-copy">The overall health index combines virtual component condition, temperature and pressure deviations, vibration, fuel behavior, anomaly evidence, model confidence, and operating-hour age. It is a synthetic demonstrator indicator, not a certified airworthiness metric.</p></Panel><Panel title="Current state transitions"><div className="state-track"><span className={twin.health.overall >= 90 ? 'active' : ''}>Healthy</span><span className={twin.health.overall < 90 && twin.health.overall >= 75 ? 'active' : ''}>Watch</span><span className={twin.health.overall < 75 && twin.health.overall >= 50 ? 'active' : ''}>Degraded</span><span className={twin.health.overall < 50 ? 'active critical' : ''}>Critical</span></div><p className="muted">Current degradation rate: {twin.health.degradation_rate} index points / simulated minute</p></Panel></div></> }

function ComponentHealth({ components }: { components: Record<string, number> }) { return <Panel title="Virtual component health"><div className="component-grid">{Object.entries(components || {}).map(([key, value]) => <article key={key} className="component"><div><span>{key.replaceAll('_', ' ')}</span><b style={{ color: healthColor(value) }}>{value}%</b></div><div className="progress"><i style={{ width: `${value}%`, background: healthColor(value) }} /></div></article>)}</div></Panel> }

function TelemetryPage({ twin, data, command }: any) { const tel = twin.telemetry; const sensorCards = [['RPM', tel.rpm, 'rpm', Gauge], ['Cylinder temperature', tel.cylinder_temperature, '°C', Thermometer], ['Exhaust temperature', tel.exhaust_temperature, '°C', Thermometer], ['Oil temperature', tel.oil_temperature, '°C', Thermometer], ['Oil pressure', tel.oil_pressure, 'bar', Activity], ['Vibration', tel.vibration, 'mm/s', Activity], ['Fuel flow', tel.fuel_flow, 'L/h', Zap], ['Fuel pressure', tel.fuel_pressure, 'bar', Activity], ['Manifold pressure', tel.manifold_pressure, 'kPa', Gauge], ['Airspeed', tel.airspeed, 'kt', Satellite]] as any[]; return <><div className="page-intro"><div><span className="eyebrow">SENSOR TELEMETRY · BOUNDED STREAM</span><h2>Telemetry console</h2><p>Latest synthetic sensor values with continuously updating time-series evidence.</p></div><div className="button-group"><button className="button ghost compact" onClick={() => command(twin.settings.running ? '/api/simulation/pause' : '/api/simulation/start')}>{twin.settings.running ? <Pause size={15} /> : <Play size={15} />}{twin.settings.running ? 'Pause' : 'Live'}</button><span className="panel-note">Range: live / 3 min buffer</span></div></div><div className="sensor-grid">{sensorCards.map(([label, value, unit, Icon]) => <article className="sensor-card" key={label}><span><Icon size={16} /></span><small>{label}</small><b>{value}<em>{unit}</em></b></article>)}</div><div className="two-col telemetry-charts"><Panel title="Thermal state"><LiveChart data={data} lines={[{ key: 'cylinder_temperature', name: 'Cylinder temp', color: '#f4a960' }, { key: 'oil_temperature', name: 'Oil temp', color: '#e76d78' }, { key: 'exhaust_temperature', name: 'Exhaust temp', color: '#d799e8' }]} /></Panel><Panel title="Mechanical and lubrication"><LiveChart data={data} lines={[{ key: 'oil_pressure', name: 'Oil pressure', color: '#55d8e7' }, { key: 'vibration', name: 'Vibration', color: '#f4b95f' }]} /></Panel></div><Panel title="Signal operating envelope"><div className="threshold-table"><div><span>RPM</span><b>{Math.round(tel.rpm)} rpm</b><small>Expected 1,500–2,900 rpm</small></div><div><span>Cylinder temperature</span><b>{tel.cylinder_temperature} °C</b><small>Expected 118–168 °C</small></div><div><span>Oil pressure</span><b>{tel.oil_pressure} bar</b><small>Expected 3.5–5.0 bar</small></div><div><span>Vibration</span><b>{tel.vibration} mm/s</b><small>Expected &lt; 4.5 mm/s</small></div></div></Panel></> }

function HealthPage({ twin, data }: any) { const healthData = data.map((x: any) => ({ time: formatTime(x.updated_at), health: x.health?.overall, anomaly: x.prediction?.anomaly_score })); return <><div className="page-intro"><div><span className="eyebrow">MULTI-FACTOR CONDITION INDEX</span><h2>Engine health</h2><p>Explainable component and system-level condition tracking.</p></div><div className="health-ring" style={{ '--progress': `${twin.health.overall}%`, '--color': healthColor(twin.health.overall) } as any}><b>{twin.health.overall}</b><small>HEALTH</small></div></div><ComponentHealth components={twin.component_health} /><div className="two-col"><Panel title="Health & anomaly trend"><div className="chart" style={{ height: 285 }}><ResponsiveContainer><AreaChart data={healthData}><defs><linearGradient id="healthFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#49d7b1" stopOpacity={.4} /><stop offset="100%" stopColor="#49d7b1" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#213641" strokeDasharray="3 5" /><XAxis dataKey="time" minTickGap={52} tick={{ fill: '#88a6b2', fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis domain={[0, 100]} tick={{ fill: '#88a6b2', fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: '#0d202b', border: '1px solid #34515c', borderRadius: 8 }} /><Area dataKey="health" name="Health index" stroke="#49d7b1" fill="url(#healthFill)" strokeWidth={2} /><Line dataKey="anomaly" name="Anomaly score" stroke="#efb45e" strokeWidth={2} dot={false} /></AreaChart></ResponsiveContainer></div></Panel><Panel title="Index interpretation"><div className="interpretation"><div><b>90–100</b><span>Healthy</span></div><div><b>75–89</b><span>Watch</span></div><div><b>50–74</b><span>Degraded</span></div><div><b>25–49</b><span>Critical</span></div><div><b>0–24</b><span>Severe</span></div></div><p className="info-copy">Index calculation weights component health, telemetry deviation, anomaly score, ML fault probability, engine age, and degradation trend. Thresholds are visible to keep the synthetic decision path auditable.</p><span className="fact-line">Estimated RUL <b>{twin.estimated_rul_hours} h</b></span></Panel></div></> }

function PredictionPage({ twin }: any) { const pred = twin.prediction; const probabilities = Object.entries(pred.probabilities || {}).map(([name, value]) => ({ name, value })); return <><div className="page-intro"><div><span className="eyebrow">RANDOM FOREST + ISOLATION FOREST</span><h2>Fault prediction</h2><p>Model results trained exclusively on reproducible, project-generated synthetic data.</p></div><Badge value={pred.risk} /></div><div className="prediction-hero"><Panel className="current-prediction"><span className="prediction-kicker">CURRENT PREDICTED FAULT</span><h2>{pred.predicted_fault_label}</h2><div className="prediction-numbers"><div><b>{pred.confidence}%</b><span>model confidence</span></div><div><b>{pred.anomaly_score}</b><span>anomaly / 100</span></div><div><b>{pred.risk}</b><span>risk tier</span></div></div><p>Classification probability is generated by the saved local model; anomaly status is independently evaluated against a normal-operation Isolation Forest baseline.</p></Panel><Panel title="Fault probability distribution"><div className="chart probability-chart"><ResponsiveContainer><BarChart data={probabilities} layout="vertical" margin={{ left: 14, right: 20 }}><XAxis type="number" domain={[0, 100]} hide /><YAxis type="category" dataKey="name" width={142} tick={{ fill: '#b9cad2', fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: '#0d202b', border: '1px solid #34515c', borderRadius: 8 }} formatter={(v: any) => `${v}%`} /><Bar dataKey="value" radius={[0, 5, 5, 0]}>{probabilities.map((item, i) => <Cell key={i} fill={item.name === pred.predicted_fault_label ? '#f2b861' : '#397e93'} />)}</Bar></BarChart></ResponsiveContainer></div></Panel></div><Panel title="Explainable AI · contributing signals" action={<span className="panel-note">Expected ranges are synthetic monitoring baselines</span>}><div className="explain-grid">{pred.explanations?.map((item: any) => <article key={item.parameter} className={`explain-card ${severityClass(item.deviation)}`}><div><h3>{item.parameter}</h3><Badge value={item.deviation} /></div><b>{item.current_value} <em>{item.unit}</em></b><p>Expected: {item.expected_range}</p><div className="contribution"><span>Risk contribution</span><i><b style={{ width: `${Math.max(4, item.contribution)}%` }} /></i><strong>{item.contribution}%</strong></div></article>)}</div></Panel><div className="model-note"><Bot size={17} /><span>Model card: Random Forest classifier plus Isolation Forest detector • synthetic-data evaluation • not certified for operational use.</span></div></> }

function MissionPage({ twin }: any) { const mission = twin.mission; const pie = [{ name: 'Reliability', value: mission.reliability_score }, { name: 'Risk', value: 100 - mission.reliability_score }]; return <><div className="page-intro"><div><span className="eyebrow">SIMULATED MISSION RELIABILITY</span><h2>Mission impact</h2><p>Transparent, load-weighted reliability effects across a non-operational UAV simulation.</p></div><Badge value={mission.mission_risk} /></div><div className="mission-summary"><Panel title="Mission reliability score"><div className="mission-gauge"><ResponsiveContainer><PieChart><Pie data={pie} dataKey="value" startAngle={180} endAngle={0} innerRadius="65%" outerRadius="88%" paddingAngle={2}>{pie.map((item, i) => <Cell key={i} fill={i ? '#233b46' : healthColor(mission.reliability_score)} />)}</Pie></PieChart></ResponsiveContainer><div><b>{mission.reliability_score}%</b><span>SIMULATED RELIABILITY</span></div></div></Panel><MetricCard label="Mission risk" value={mission.mission_risk} icon={ShieldAlert} tone={mission.mission_risk === 'LOW' ? 'green' : 'red'} caption="Load-weighted health risk" /><MetricCard label="Engine failure risk" value={mission.engine_failure_risk} unit="%" icon={AlertTriangle} tone="orange" caption="Synthetic risk indicator" /><MetricCard label="Completion probability" value={mission.mission_completion_probability} unit="%" icon={CheckCircle2} tone="cyan" caption="Current twin state" /></div><Panel title="Simulated mission phases" action={<span className="panel-note">{mission.method}</span>}><div className="mission-table"><div className="table-head"><span>Phase</span><span>Load</span><span>Duration</span><span>Health</span><span>Risk</span><span>Reliability</span></div>{mission.phases.map((phase: any) => <div className="table-row" key={phase.phase}><b>{phase.phase}</b><span>{phase.engine_load}%</span><span>{phase.expected_duration_min} min</span><span>{phase.engine_health}%</span><span><Badge value={phase.risk} /></span><strong style={{ color: healthColor(phase.reliability_contribution) }}>{phase.reliability_contribution}%</strong></div>)}</div></Panel><div className="model-note"><Route size={17} /><span>Method: phase risk = health deficit × load factor + anomaly adjustment; mission reliability is a duration-weighted mean. It is a planning demonstrator, not an operational flight or combat system.</span></div></> }

function MaintenancePage({ twin, command }: any) { const item = twin.maintenance; return <><div className="page-intro"><div><span className="eyebrow">CONDITION-BASED MAINTENANCE</span><h2>Maintenance recommendation</h2><p>High-level, non-procedural condition guidance derived from current twin evidence.</p></div><Badge value={item.priority} /></div><Panel className="maintenance-card"><div className="maintenance-icon"><Wrench size={31} /></div><div><span className="prediction-kicker">{item.priority} PRIORITY</span><h2>{item.title}</h2><p>{item.reason}</p><dl className="maintenance-details"><div><dt>Recommended action</dt><dd>{item.recommended_action}</dd></div><div><dt>Most affected indicator</dt><dd>{item.weakest_subsystem}</dd></div><div><dt>Estimated RUL</dt><dd>{twin.estimated_rul_hours} simulated hours</dd></div></dl><button className="button ghost compact" onClick={() => command('/api/simulation/fault', { fault: 'normal' })}><RefreshCcw size={15} /> Return to normal scenario</button></div></Panel><div className="two-col"><Panel title="Maintenance decision evidence"><div className="evidence-list"><span><Thermometer /> Thermal state and cooling trend</span><span><Activity /> Pressure and vibration condition</span><span><Bot /> ML prediction and anomaly evidence</span><span><Route /> Simulated mission reliability effect</span></div></Panel><Panel title="Scope boundary"><p className="info-copy">AeroTwin does not provide real-world repair steps, flight clearance, or autonomous action. Recommendations are intentionally high-level monitoring prompts for this local research demonstration.</p></Panel></div></> }

function HistoryPage({ twin, data }: any) { const alertRows = twin.alerts || []; return <><div className="page-intro"><div><span className="eyebrow">SESSION HISTORY · SQLITE PERSISTENCE</span><h2>Historical analysis</h2><p>Bounded live buffer with telemetry, prediction, alert, and mission records persisted locally.</p></div><span className="panel-note">{data.length} live samples this session</span></div><Panel title="Historical health and RUL"><div className="chart" style={{ height: 280 }}><ResponsiveContainer><LineChart data={data.map((entry: any) => ({ time: formatTime(entry.updated_at), health: entry.health?.overall, rul: entry.estimated_rul_hours }))}><CartesianGrid vertical={false} stroke="#213641" strokeDasharray="3 5" /><XAxis dataKey="time" minTickGap={52} tick={{ fill: '#88a6b2', fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis yAxisId="left" domain={[0, 100]} tick={{ fill: '#88a6b2', fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis yAxisId="right" orientation="right" tick={{ fill: '#88a6b2', fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: '#0d202b', border: '1px solid #34515c', borderRadius: 8 }} /><Line yAxisId="left" dataKey="health" stroke="#49d7b1" strokeWidth={2} dot={false} /><Line yAxisId="right" dataKey="rul" stroke="#65b6f2" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div></Panel><Panel title="Event & alert timeline"><div className="timeline">{alertRows.length ? alertRows.map((alert: any) => <article key={alert.id}><span className={`timeline-dot ${severityClass(alert.severity)}`} /><div><time>{formatTime(alert.timestamp)}</time><Badge value={alert.severity} /><p>{alert.message}</p><small>{alert.details}</small></div></article>) : <Empty text="Events will appear as live or simulated conditions change." />}</div></Panel><div className="model-note"><Database size={17} /><span>SQLite tables: engines, telemetry, fault_events, predictions, missions, alerts, and maintenance_events. Data remains local to the demo machine.</span></div></> }

function SimulationPage({ twin, command }: any) { const [settings, setSettings] = useState({ speed: twin.settings.speed, throttle: twin.settings.throttle, load: twin.settings.load, altitude: twin.settings.altitude, ambient_temperature: twin.settings.ambient_temperature }); const update = (key: string, value: number) => setSettings(previous => ({ ...previous, [key]: value })); const apply = () => command('/api/simulation/settings', settings); return <><div className="page-intro"><div><span className="eyebrow">FAULT INJECTION & FLIGHT ENVIRONMENT</span><h2>Simulation control</h2><p>Control the local synthetic data stream and demonstrate progressive condition changes.</p></div><div className="button-group"><button className="button ghost compact" onClick={() => command(twin.settings.running ? '/api/simulation/pause' : '/api/simulation/start')}>{twin.settings.running ? <Pause size={15} /> : <Play size={15} />}{twin.settings.running ? 'Pause' : 'Start'}</button><button className="button danger compact" onClick={() => command('/api/simulation/reset')}><RefreshCcw size={15} /> Reset</button></div></div><div className="sim-grid"><Panel title="Operating environment"><div className="controls"><Control label="Simulation speed" value={settings.speed} min={1} max={10} suffix="×" step={1} onChange={(v: number) => update('speed', v)} /><Control label="Throttle" value={settings.throttle} min={15} max={100} suffix="%" onChange={(v: number) => update('throttle', v)} /><Control label="Engine load" value={settings.load} min={10} max={100} suffix="%" onChange={(v: number) => update('load', v)} /><Control label="Altitude" value={settings.altitude} min={0} max={10000} suffix=" m" step={100} onChange={(v: number) => update('altitude', v)} /><Control label="Ambient temperature" value={settings.ambient_temperature} min={-20} max={50} suffix=" °C" onChange={(v: number) => update('ambient_temperature', v)} /></div><button className="button primary full" onClick={apply}>Apply environment settings <CheckCircle2 size={16} /></button></Panel><Panel title="Fault injection scenarios"><p className="muted">Each injection changes correlated signals gradually rather than instantly forcing a hardcoded outcome.</p><div className="fault-grid">{faultOptions.map(([key, title, description]) => <button key={key} className={`fault-option ${twin.settings.active_fault === key ? 'selected' : ''}`} onClick={() => command('/api/simulation/fault', { fault: key })}><span>{twin.settings.active_fault === key ? <CheckCircle2 size={15} /> : <Zap size={15} />}</span><b>{title}</b><small>{description}</small></button>)}</div></Panel></div><Panel title="Active scenario status"><div className="scenario-status"><div><span>Scenario</span><b>{twin.settings.fault_label}</b></div><div><span>Progress</span><b>{twin.settings.fault_progress}%</b></div><div className="progress wide"><i style={{ width: `${twin.settings.fault_progress}%` }} /></div><p>Fault injection affects only this local synthetic simulation. No physical engine, aircraft, or external system is connected.</p></div></Panel></> }

function Control({ label, value, min, max, suffix, step = 1, onChange }: any) { return <label className="control"><span>{label}<b>{value}{suffix}</b></span><input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} /></label> }

function VideoPage() { return <><div className="page-intro"><div><span className="eyebrow">PROJECT DEMONSTRATION</span><h2>AI-Enabled Real-Time Digital Twin</h2><p>Health monitoring, fault prediction and mission reliability in the supplied project demonstrations.</p></div></div><Panel className="video-panel"><VideoCarousel /></Panel><div className="two-col"><Panel title="Demonstration coverage"><div className="evidence-list"><span><Activity /> Health monitoring</span><span><Bot /> Fault prediction</span><span><Route /> Mission reliability</span></div></Panel><Panel title="Carousel controls"><p className="info-copy">The active demonstration plays from the beginning, holds for one second after it ends, then smoothly advances. Use arrows, drag/swipe, keyboard arrows, indicators, audio and fullscreen controls at any time.</p></Panel></div></> }

function ArchitecturePage() { const stages = [['Telemetry Simulator', Activity], ['Data Ingestion', Database], ['Digital Twin', Boxes], ['Feature Engineering', Layers3], ['Anomaly Detection', Radar], ['Fault Prediction', Bot], ['Health & RUL', HeartPulse], ['Mission Reliability', Route], ['Dashboard & Alerts', CircleGauge]]; return <><div className="page-intro"><div><span className="eyebrow">TECHNICAL ARCHITECTURE</span><h2>Connected intelligence pipeline</h2><p>Local-first, explainable processing from synthetic telemetry to an engineer-facing decision view.</p></div></div><Panel className="architecture-panel"><div className="architecture-flow">{stages.map(([label, Icon]: any, i) => <div className="architecture-step" key={label}><div><Icon size={23} /></div><b>{label}</b>{i < stages.length - 1 && <span className="architecture-arrow">↓</span>}</div>)}</div></Panel><div className="architecture-grid"><Panel title="Frontend"><p>React, TypeScript, Vite, Recharts and accessible responsive UI. WebSocket data updates without a page refresh.</p></Panel><Panel title="Backend"><p>FastAPI, Pydantic validation, REST endpoints, WebSocket streaming, a continuously updated DigitalTwin service, and SQLite persistence.</p></Panel><Panel title="ML pipeline"><p>Reproducible generated data, Isolation Forest anomaly detection, Random Forest fault classification, saved joblib models, and signal-level explanations.</p></Panel></div><div className="model-note"><Network size={17} /><span>All components run locally. No cloud account, GPU, external engine hardware, or operational UAV interface is required.</span></div></> }

function AboutPage() { return <><div className="page-intro"><div><span className="eyebrow">SIH 2026 · PROBLEM STATEMENT 26054</span><h2>About AeroTwin</h2><p>AI-enabled real-time digital twin for health monitoring, fault prediction and mission reliability enhancement.</p></div></div><div className="about-grid"><Panel title="The problem"><p>Engine condition issues can reduce mission availability and introduce avoidable uncertainty. A demonstration platform needs to connect raw telemetry with understandable early warnings and reliability impact.</p></Panel><Panel title="The solution"><p>AeroTwin continuously evolves a virtual generic aero piston engine from correlated synthetic telemetry, giving engineers one view of health, anomaly, fault likelihood, estimated RUL and simulated mission impact.</p></Panel><Panel title="Digital Twin"><p>The twin is not a static record: every telemetry update modifies engine state, component health, health index, RUL, prediction evidence, alerts and maintenance guidance.</p></Panel><Panel title="AI & data"><p>Models are trained locally from reproducible synthetic data. This makes the complete demonstration laptop-ready while clearly separating synthetic evaluation from certified aerospace analysis.</p></Panel><Panel title="Scope & limitations"><p>This is software research and monitoring demonstrator for a generic engine. It has no connection to real vehicles, autonomous weapons, targeting, engagement, flight control, or maintenance authorization.</p></Panel><Panel title="Future work"><p>Future research could integrate validated test-cell datasets, physics-informed models, sensor confidence fusion, digital thread traceability, and accredited reliability studies.</p></Panel></div><Panel title="3D engine model · attribution"><p><b>Engine:</b> Wright brothers’ 1903 Flyer four-cylinder aero piston engine (12 hp), manufactured for the Wright Flyer by the Wright brothers with Charles Taylor as mechanic/engine builder. <b>Model source:</b> Smithsonian 3D scan, “1903 Wright Flyer” engine mesh. <b>License:</b> CC0 / public domain; reuse and redistribution, including commercial and educational use, are permitted. Credit to the Smithsonian Institution / National Air and Space Museum is provided as requested. See <code>docs/3d-engine-model.md</code> for the source URL, exact asset, and historical-model limitation.</p></Panel><Panel title="Key capabilities"><div className="capability-row"><span><Activity /> Real-time telemetry</span><span><Bot /> ML fault prediction</span><span><Radar /> Anomaly detection</span><span><Clock3 /> Simulated RUL</span><span><Route /> Mission reliability</span><span><Wrench /> Predictive maintenance</span></div></Panel></> }

function Empty({ text }: { text: string }) { return <div className="empty"><Moon size={18} /><span>{text}</span></div> }

function Loading({ error }: { error: string }) { return <div className="loading-screen"><div className="brand-mark"><Satellite size={26} /></div><h1>AERO<span>TWIN</span></h1><p>{error || 'Initializing local digital twin and synthetic ML models…'}</p>{error && <button className="button primary" onClick={() => location.reload()}>Reconnect</button>}</div> }

export default function App() {
  const path = usePath()
  const state = useTwin()
  if (path === '/') return <Landing twin={state.twin} />
  if (!state.twin) return <Loading error={state.error} />
  const props = { twin: state.twin, data: state.history, command: state.command }
  let content: any
  switch (path) {
    case '/dashboard': content = <Dashboard {...props} />; break
    case '/digital-twin': content = <DigitalTwinPage {...props} />; break
    case '/telemetry': content = <TelemetryPage {...props} />; break
    case '/health': content = <HealthPage {...props} />; break
    case '/prediction': content = <PredictionPage {...props} />; break
    case '/mission': content = <MissionPage {...props} />; break
    case '/maintenance': content = <MaintenancePage {...props} />; break
    case '/history': content = <HistoryPage {...props} />; break
    case '/simulation': content = <SimulationPage {...props} />; break
    case '/video': content = <VideoPage />; break
    case '/architecture': content = <ArchitecturePage />; break
    case '/about': content = <AboutPage />; break
    default: content = <Dashboard {...props} />
  }
  return <Shell path={path} twin={state.twin} connected={state.connected}>{content}</Shell>
}
