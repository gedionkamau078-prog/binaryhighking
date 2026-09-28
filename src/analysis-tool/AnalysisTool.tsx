import { useEffect, useMemo, useRef, useState } from 'react';
import './analysis-tool.scss';

type Tick = { value: number; digit: number; time: string };
type Strategy = 'Even / Odd' | 'Over / Under' | 'Rise / Fall' | 'Matches / Differs' | 'Only Up / Only Down' | 'High / Low Tick';

const strategies: { name: Strategy; short: string; icon: string }[] = [
    { name: 'Even / Odd', short: 'Parity', icon: '02' },
    { name: 'Over / Under', short: 'Barrier', icon: '↕' },
    { name: 'Rise / Fall', short: 'Direction', icon: '⌁' },
    { name: 'Matches / Differs', short: 'Digit', icon: '≠' },
    { name: 'Only Up / Only Down', short: 'Hedge', icon: '⇅' },
    { name: 'High / Low Tick', short: 'Range', icon: 'H/L' },
];

const seed = [3128.42, 3128.51, 3128.47, 3128.66, 3128.73, 3128.69, 3128.88, 3128.94, 3128.81, 3129.02, 3129.14, 3129.09, 3129.27, 3129.34, 3129.29, 3129.48, 3129.55, 3129.62, 3129.57, 3129.76, 3129.82, 3129.91, 3129.84, 3130.03];

const makeTicks = (values = seed): Tick[] => values.map((value, i) => ({
    value,
    digit: Math.round(value * 100) % 10,
    time: new Date(Date.now() - (values.length - i) * 1000).toLocaleTimeString([], { hour12: false }),
}));

const Icon = ({ name }: { name: 'grid' | 'signal' | 'shield' | 'book' | 'chevron' }) => {
    const paths = {
        grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
        signal: <><path d="M4 19v-4M10 19V9M16 19V5M22 19V2"/></>,
        shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>,
        book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></>,
        chevron: <path d="m9 18 6-6-6-6"/>,
    };
    return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
};

export default function AnalysisTool() {
    const [ticks, setTicks] = useState<Tick[]>(makeTicks());
    const [strategy, setStrategy] = useState<Strategy>('Even / Odd');
    const [barrier, setBarrier] = useState(5);
    const [stake, setStake] = useState(10);
    const [duration, setDuration] = useState(5);
    const [side, setSide] = useState<'primary' | 'secondary'>('primary');
    const [status, setStatus] = useState<'connecting' | 'live' | 'demo'>('connecting');
    const [paperTrades, setPaperTrades] = useState<{ id: number; label: string; stake: number }[]>([]);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        let socket: WebSocket | undefined;
        let fallback: number | undefined;
        try {
            socket = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=1089');
            socket.onopen = () => socket?.send(JSON.stringify({ ticks: 'R_100', subscribe: 1 }));
            socket.onmessage = event => {
                const data = JSON.parse(event.data);
                if (data.tick?.quote) {
                    const value = Number(data.tick.quote);
                    setStatus('live');
                    setTicks(current => [...current.slice(-39), { value, digit: Math.floor(value * 100) % 10, time: new Date().toLocaleTimeString([], { hour12: false }) }]);
                }
            };
            socket.onerror = () => setStatus('demo');
        } catch { setStatus('demo'); }
        const timeout = window.setTimeout(() => {
            if (socket?.readyState === WebSocket.OPEN) return;
            setStatus('demo');
            fallback = window.setInterval(() => setTicks(current => {
                const prior = current[current.length - 1]?.value ?? 3130;
                const value = Number((prior + (Math.random() - .48) * .42).toFixed(2));
                return [...current.slice(-39), { value, digit: Math.floor(value * 100) % 10, time: new Date().toLocaleTimeString([], { hour12: false }) }];
            }), 1200);
        }, 2800);
        return () => { socket?.close(); clearTimeout(timeout); if (fallback) clearInterval(fallback); };
    }, []);

    const stats = useMemo(() => {
        const recent = ticks.slice(-20);
        const evens = recent.filter(t => t.digit % 2 === 0).length;
        const above = recent.filter(t => t.digit > barrier).length;
        const rises = recent.slice(1).filter((t, i) => t.value > recent[i].value).length;
        const last = recent[recent.length - 1]?.value ?? 0;
        const first = recent[0]?.value ?? last;
        return { even: evens * 5, odd: 100 - evens * 5, over: above * 5, under: 100 - above * 5, rise: Math.round(rises / 19 * 100), fall: 100 - Math.round(rises / 19 * 100), momentum: last - first };
    }, [ticks, barrier]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const ratio = window.devicePixelRatio || 1;
        const box = canvas.getBoundingClientRect();
        canvas.width = box.width * ratio; canvas.height = box.height * ratio; ctx.scale(ratio, ratio);
        const values = ticks.slice(-30).map(t => t.value);
        const min = Math.min(...values) - .15, max = Math.max(...values) + .15;
        const x = (i: number) => i * box.width / (values.length - 1);
        const y = (v: number) => box.height - 22 - ((v - min) / (max - min)) * (box.height - 44);
        ctx.clearRect(0, 0, box.width, box.height);
        ctx.strokeStyle = 'rgba(35, 49, 45, .08)'; ctx.lineWidth = 1;
        for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(0, box.height * i / 5); ctx.lineTo(box.width, box.height * i / 5); ctx.stroke(); }
        const grad = ctx.createLinearGradient(0, 0, 0, box.height); grad.addColorStop(0, 'rgba(24, 132, 96, .24)'); grad.addColorStop(1, 'rgba(24, 132, 96, 0)');
        ctx.beginPath(); values.forEach((v, i) => i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))); ctx.lineTo(box.width, box.height); ctx.lineTo(0, box.height); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
        ctx.beginPath(); values.forEach((v, i) => i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))); ctx.strokeStyle = '#16845f'; ctx.lineWidth = 2.25; ctx.stroke();
        const lastX = x(values.length - 1), lastY = y(values[values.length - 1]); ctx.beginPath(); ctx.arc(lastX, lastY, 4, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#16845f'; ctx.lineWidth = 3; ctx.stroke();
    }, [ticks]);

    const current = ticks[ticks.length - 1];
    const isRise = stats.momentum >= 0;
    const labels = strategy === 'Even / Odd' ? ['EVEN', 'ODD'] : strategy === 'Over / Under' ? [`OVER ${barrier}`, `UNDER ${barrier}`] : strategy === 'Rise / Fall' ? ['RISE', 'FALL'] : strategy === 'Matches / Differs' ? [`MATCHES ${barrier}`, `DIFFERS ${barrier}`] : strategy === 'Only Up / Only Down' ? ['ONLY UP', 'ONLY DOWN'] : ['HIGH TICK', 'LOW TICK'];
    const confidences = strategy === 'Even / Odd' ? [stats.even, stats.odd] : strategy === 'Over / Under' ? [stats.over, stats.under] : strategy === 'Rise / Fall' ? [stats.rise, stats.fall] : [47, 53];

    const placePaperTrade = () => {
        setPaperTrades(current => [{ id: Date.now(), label: labels[side === 'primary' ? 0 : 1], stake }, ...current].slice(0, 3));
    };

    return <div className="terminal-shell">
        <aside className="rail">
            <div className="mark">DA<span>.</span></div>
            <nav aria-label="Main navigation">
                <button className="rail-button active" aria-label="Analysis desk"><Icon name="grid"/></button>
                <button className="rail-button" aria-label="Signals"><Icon name="signal"/></button>
                <button className="rail-button" aria-label="Risk"><Icon name="shield"/></button>
                <button className="rail-button" aria-label="Journal"><Icon name="book"/></button>
            </nav>
            <div className="rail-foot"><span>?</span></div>
        </aside>

        <main>
            <header className="topbar">
                <div><div className="eyebrow">DERIV ANALYSIS DESK</div><h1>Market pulse</h1></div>
                <div className="top-actions">
                    <div className={`connection ${status}`}><i/>{status === 'live' ? 'LIVE FEED' : status === 'connecting' ? 'CONNECTING' : 'DEMO FEED'}</div>
                    <button className="account">PAPER ACCOUNT <strong>$10,000.00</strong><Icon name="chevron"/></button>
                </div>
            </header>

            <section className="market-strip">
                <div className="market-name"><span className="pulse-bars">▥</span><div><small>SYNTHETIC INDEX</small><strong>Volatility 100 Index</strong></div></div>
                <div className="quote"><strong>{current?.value.toFixed(2)}</strong><span className={isRise ? 'positive' : 'negative'}>{isRise ? '+' : ''}{stats.momentum.toFixed(2)} <small>last 20 ticks</small></span></div>
                <div className="session"><small>MARKET</small><strong>24 / 7</strong></div>
            </section>

            <div className="workspace">
                <section className="analysis-column">
                    <div className="strategy-picker">
                        <div className="section-heading"><div><small>01 / CONTRACT</small><h2>Choose your lens</h2></div><span>6 strategies</span></div>
                        <div className="strategy-grid">
                            {strategies.map(item => <button key={item.name} className={strategy === item.name ? 'strategy active' : 'strategy'} onClick={() => setStrategy(item.name)}>
                                <b>{item.icon}</b><span><strong>{item.name}</strong><small>{item.short}</small></span>
                            </button>)}
                        </div>
                    </div>

                    <div className="chart-card">
                        <div className="chart-head"><div><small>TICK STREAM · 1S</small><h2>{strategy} signal</h2></div><div className="chart-legend"><i/>Live quote</div></div>
                        <div className="canvas-wrap"><canvas ref={canvasRef}/><div className="price-pill">{current?.value.toFixed(2)}</div></div>
                        <div className="digit-tape">
                            {ticks.slice(-10).map((tick, i) => <div key={`${tick.time}-${i}`} className={i === 9 ? 'latest' : ''}><span>{tick.digit}</span><small>{tick.time.slice(-8)}</small></div>)}
                        </div>
                    </div>

                    <div className="probability-card">
                        <div className="section-heading"><div><small>02 / READOUT</small><h2>Probability snapshot</h2></div><span>20-tick sample</span></div>
                        <div className="prob-bars">
                            <div><div><strong>{labels[0]}</strong><em>{confidences[0]}%</em></div><span><i style={{ width: `${confidences[0]}%` }}/></span></div>
                            <div><div><strong>{labels[1]}</strong><em>{confidences[1]}%</em></div><span><i className="dark" style={{ width: `${confidences[1]}%` }}/></span></div>
                        </div>
                        <p>Statistical readout only. Short tick samples are noisy and do not predict contract outcomes.</p>
                    </div>
                </section>

                <aside className="ticket">
                    <div className="ticket-title"><div><small>03 / PAPER TICKET</small><h2>Test the setup</h2></div><span className="paper-badge">NO REAL FUNDS</span></div>
                    <label>Duration <div className="stepper"><button onClick={() => setDuration(Math.max(1, duration - 1))}>−</button><strong>{duration} ticks</strong><button onClick={() => setDuration(duration + 1)}>+</button></div></label>
                    {(strategy.includes('Under') || strategy.includes('Matches')) && <label>Last digit barrier <div className="digits">{[0,1,2,3,4,5,6,7,8,9].map(n => <button className={barrier === n ? 'active' : ''} onClick={() => setBarrier(n)} key={n}>{n}</button>)}</div></label>}
                    <label>Stake <div className="money-input"><span>USD</span><input type="number" min="1" value={stake} onChange={e => setStake(Math.max(1, Number(e.target.value)))}/></div></label>
                    <div className="side-choice">
                        <button className={side === 'primary' ? 'selected' : ''} onClick={() => setSide('primary')}><small>{confidences[0]}% readout</small><strong>{labels[0]}</strong></button>
                        <button className={side === 'secondary' ? 'selected dark' : 'dark'} onClick={() => setSide('secondary')}><small>{confidences[1]}% readout</small><strong>{labels[1]}</strong></button>
                    </div>
                    <div className="hedge-box"><span>HEDGE CHECK</span><strong>{strategy === 'Only Up / Only Down' ? 'Directional cover active' : Math.abs(confidences[0] - confidences[1]) < 12 ? 'Balanced — wait for edge' : 'One-sided exposure'}</strong><p>Pair opposing contracts only when total cost and payout preserve your risk limit.</p></div>
                    <button className="trade-button" onClick={placePaperTrade}>Add paper position <span>→</span></button>
                    <p className="risk-note">Paper mode simulates a setup. It does not send orders to Deriv.</p>
                    <div className="paper-log">
                        <h3>Paper positions <span>{paperTrades.length}</span></h3>
                        {paperTrades.length ? paperTrades.map(t => <div key={t.id}><span>{t.label}</span><strong>${t.stake.toFixed(2)}</strong></div>) : <p>No positions yet. Test either side to compare exposure.</p>}
                    </div>
                </aside>
            </div>
        </main>
    </div>;
}
