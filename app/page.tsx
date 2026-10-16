"use client";
import { useEffect, useRef, useState } from "react";
import { AlignLeft, ArrowUp, ArrowUpRight, Check, CircleHelp, Copy, ExternalLink, KeyRound, Leaf, Link2, List, LoaderCircle, Plus, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import type { SearchResult, SessionKeys } from "@/lib/search-types";

const suggestions = ["AI agent ต่างจาก chatbot ยังไง?", "ทำไมท้องฟ้าตอนเย็นถึงเป็นสีส้ม?", "มีโมเดล AI อะไรให้เรียก API ฟรีบ้าง?"];
const emptyKeys: SessionKeys = { tavily: "", gemini: "", groq: "" };
const storageKey = "sift:api-keys:v1";
type SearchWindow = Window & { __SIFT_API_URL__?: string };
function readStoredKeys(kind: "localStorage" | "sessionStorage"): SessionKeys | null {
  try {
    const raw = window[kind].getItem(storageKey);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<SessionKeys>;
    if (typeof value.tavily !== "string" || typeof value.gemini !== "string" || typeof value.groq !== "string") return null;
    return value.tavily && (value.gemini || value.groq) ? { tavily: value.tavily, gemini: value.gemini, groq: value.groq } : null;
  } catch { return null; }
}
const relatedSources = (result: SearchResult) => {
  const cited = new Set(result.claims.flatMap(claim => claim.citations));
  const chosen = result.sources.filter(source => cited.has(source.id));
  return (chosen.length ? chosen : result.sources).slice(0, 3);
};
const domain = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "แหล่งข้อมูล"; } };

export default function Home() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"short" | "long">("short");
  const [keys, setKeys] = useState<SessionKeys>(emptyKeys);
  const [draftKeys, setDraftKeys] = useState<SessionKeys>(emptyKeys);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [turns, setTurns] = useState<SearchResult[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [pendingSearch, setPendingSearch] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const modal = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const controller = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const connected = !!(keys.tavily && (keys.gemini || keys.groq));

  useEffect(() => {
    const saved = readStoredKeys("localStorage");
    if (saved) { setKeys(saved); setRememberDevice(true); return; }
    const session = readStoredKeys("sessionStorage");
    if (session) setKeys(session);
  }, []);
  useEffect(() => { if (open) modal.current?.showModal(); else modal.current?.close(); }, [open]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (turns.length || loading) bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns.length, loading]);
  function showSettings() { setDraftKeys({ ...keys }); setSettingsError(""); setOpen(true); }
  function newSearch() { controller.current?.abort(); setLoading(false); setTurns([]); setQuery(""); setError(""); input.current?.focus(); }

  async function search(overrideKeys?: SessionKeys) {
    const question = query.trim();
    if (!question || loading) return;
    const activeKeys = overrideKeys ?? keys;
    if (!activeKeys.tavily || !(activeKeys.gemini || activeKeys.groq)) { setPendingSearch(true); showSettings(); return; }
    const activeController = new AbortController(); controller.current = activeController;
    setLoading(true); setError("");
    const context = turns.slice(-2).map(turn => ({ question: turn.query, answer: turn.claims.map(claim => claim.text).join(" ") }));
    try {
      const apiUrl = (window as SearchWindow).__SIFT_API_URL__ || "/api/search";
      const response = await fetch(apiUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: question, mode, keys: activeKeys, context }), signal: activeController.signal });
      const data = await response.json() as SearchResult & { error?: string };
      if (!response.ok) throw new Error(data.error || "ยังค้นหาไม่สำเร็จ ลองอีกครั้งนะ");
      if (activeController.signal.aborted) return;
      setTurns(previous => [...previous, data]);
      setHistory(previous => [question, ...previous.filter(item => item !== question)].slice(0, 10));
      setQuery("");
    } catch (cause) { if (!activeController.signal.aborted) setError(cause instanceof Error ? cause.message : "เชื่อมต่อไม่ได้ ลองใหม่อีกครั้งนะ"); }
    finally { if (controller.current === activeController) setLoading(false); }
  }
  function saveKeys(event: React.FormEvent) {
    event.preventDefault();
    const clean = { tavily: draftKeys.tavily.trim(), gemini: draftKeys.gemini.trim(), groq: draftKeys.groq.trim() };
    if (!clean.tavily || !(clean.gemini || clean.groq)) { setSettingsError("ใส่คีย์ Tavily และ Gemini หรือ Groq อีกหนึ่งตัวก่อนนะ"); return; }
    try {
      const destination = rememberDevice ? window.localStorage : window.sessionStorage;
      const previous = rememberDevice ? window.sessionStorage : window.localStorage;
      destination.setItem(storageKey, JSON.stringify(clean));
      previous.removeItem(storageKey);
    } catch {
      setSettingsError("เบราว์เซอร์บันทึกคีย์ไม่ได้ ลองตรวจการตั้งค่าพื้นที่เก็บข้อมูลก่อนนะ");
      return;
    }
    setKeys(clean); setDraftKeys(emptyKeys); setOpen(false); setPendingSearch(false);
    if (pendingSearch) void search(clean);
  }
  async function copyAnswer(result: SearchResult, index: number) {
    const answer = [result.query, ...result.claims.map(claim => claim.text), ...result.uncertainties, ...relatedSources(result).map(source => `${source.title}: ${source.url}`)].join("\n\n");
    try { await navigator.clipboard.writeText(answer); setCopiedIndex(index); setTimeout(() => setCopiedIndex(null), 2000); }
    catch { setError("คัดลอกอัตโนมัติไม่ได้ ลองเลือกข้อความแล้วคัดลอกเองนะ"); }
  }
  function forgetKeys() {
    try { window.localStorage.removeItem(storageKey); } catch { /* Storage may be disabled. */ }
    try { window.sessionStorage.removeItem(storageKey); } catch { /* Storage may be disabled. */ }
    setKeys(emptyKeys); setDraftKeys(emptyKeys); setRememberDevice(false); setOpen(false); setPendingSearch(false);
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <button type="button" onClick={newSearch} className="brand" aria-label="เริ่มแชตใหม่"><span className="brand-symbol"><Leaf size={23}/></span><span>sift<span className="brand-period">.</span></span></button>
      <span className="brand-description">ถามได้เลย เดี๋ยวช่วยหาคำตอบ</span>
      <button className="new-search" onClick={newSearch}><Plus size={18}/> แชตใหม่ <span>↗</span></button>
      <div className="history-heading">คำถามในหน้านี้ {history.length > 0 && <button onClick={() => setHistory([])} aria-label="ล้างรายการคำถาม"><Trash2 size={14}/></button>}</div>
      <nav className="history" aria-label="คำถามที่ผ่านมา">{history.length ? history.map(item => <button key={item} onClick={() => { setQuery(item); input.current?.focus(); }} title={item}><Search size={14}/><span>{item}</span></button>) : <p>มีอะไรสงสัยอยู่ไหม?<br/><span>พิมพ์ถามได้เลย</span></p>}</nav>
      <div className="sidebar-bottom"><div className="quiet-note"><CircleHelp size={19}/><div>ไม่แน่ใจ ก็บอกตรง ๆ<p>พร้อมลิงก์ให้อ่านต่อถ้าอยากดู</p></div></div><button className="settings-link" onClick={showSettings}><SlidersHorizontal size={16}/> ตั้งค่าการเชื่อมต่อ <span className={connected ? "status-dot ready" : "status-dot"}/></button><div className="version">SIFT / SEARCH CHAT <span>v0.2</span></div></div>
    </aside>
    <main>
      <header className="topbar"><div className="mobile-brand"><Leaf size={20}/> sift.</div><div className="breadcrumb">Sift <span>/</span> <strong>คุยแล้วค้น</strong></div><div className="topbar-right"><button className="connection-pill" onClick={showSettings}><span className={connected ? "status-dot ready" : "status-dot"}/>{connected ? "พร้อมใช้งาน" : "เชื่อมต่อเพื่อเริ่ม"}<SlidersHorizontal size={13}/></button></div></header>
      <div className={turns.length ? "workspace chat-workspace has-result" : "workspace chat-workspace"}>
        {!turns.length && <section className="intro"><div className="eyebrow"><span/> SEARCH, THINK, ASK AGAIN</div><h1>มีอะไรอยากรู้<br/><span className="highlight">ถามมาเลย<svg viewBox="0 0 220 15" aria-hidden="true"><path d="M3 10 Q100 -2 215 8"/></svg></span></h1><p>เราช่วยหาจากเว็บ แล้วเล่าให้ฟังแบบเข้าใจง่าย<br className="mobile-break"/> ถ้าอยากอ่านต่อ ก็มีลิงก์ให้</p></section>}
        {!!turns.length && <div className="conversation" aria-live="polite">{turns.map((turn, index) => <section className="chat-turn" key={`${turn.searchedAt}-${index}`}>
          <div className="user-line"><span>{turn.query}</span></div>
          <div className="assistant-line"><span className="assistant-avatar"><Leaf size={18}/></span><div className="assistant-content">
            {turn.claims.length ? <div className="answer-body">{turn.claims.map((claim, claimIndex) => <p key={claimIndex}>{claim.text}</p>)}</div> : <p className="no-answer">ยังหาคำตอบที่ยืนยันได้ไม่เจอ ลองบอกชื่อ เรื่อง หรือช่วงเวลาเพิ่มอีกนิดไหม?</p>}
            {!!turn.uncertainties.length && <p className="chat-uncertainty"><CircleHelp size={15}/>{turn.uncertainties.join(" ")}</p>}
            {!!turn.sources.length && <div className="chat-sources"><span><Link2 size={14}/> อ่านต่อ</span>{relatedSources(turn).map(source => <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer" title={source.title}>{domain(source.url)} <ArrowUpRight size={12}/></a>)}</div>}
            <div className="chat-actions"><span>{turn.mode === "short" ? "สั้น ๆ" : "ละเอียด"} · {new Intl.DateTimeFormat("th-TH", { timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(turn.searchedAt))}</span><button onClick={() => void copyAnswer(turn, index)}>{copiedIndex === index ? <Check size={14}/> : <Copy size={14}/>} {copiedIndex === index ? "คัดลอกแล้ว" : "คัดลอก"}</button></div>
          </div></div>
        </section>)}</div>}
        {loading && <div className="chat-loading" role="status" aria-live="polite"><span className="assistant-avatar"><LoaderCircle className="spin" size={18}/></span><span>กำลังหาคำตอบให้นะ…</span><button onClick={() => { controller.current?.abort(); setLoading(false); }}>ยกเลิก</button></div>}
        {error && <div className="error-message" role="alert"><CircleHelp size={18}/><span>{error}</span><button onClick={() => setError("")} aria-label="ปิดข้อความ"><X size={16}/></button></div>}
        <form className="search-card" onSubmit={event => { event.preventDefault(); void search(); }}>
          <label htmlFor="question" className="sr-only">ถาม Sift</label>
          <div className="query-row"><Search size={21}/><textarea ref={input} id="question" value={query} onChange={event => setQuery(event.target.value)} placeholder={turns.length ? "ถามต่อได้เลย…" : "วันนี้อยากรู้อะไร?"} maxLength={600} rows={2} disabled={loading} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void search(); } }}/></div>
          <div className="search-controls"><div className="mode-switch" aria-label="ความยาวคำตอบ"><button type="button" aria-pressed={mode === "short"} className={mode === "short" ? "selected" : ""} onClick={() => setMode("short")} disabled={loading}><List size={15}/> สั้น ๆ</button><button type="button" aria-pressed={mode === "long"} className={mode === "long" ? "selected" : ""} onClick={() => setMode("long")} disabled={loading}><AlignLeft size={15}/> เล่าละเอียด</button></div><div className="search-action"><span className="enter-hint">Enter เพื่อถาม</span><button className="submit-search" type="submit" disabled={!query.trim() || loading} aria-label="ส่งคำถาม">{loading ? <LoaderCircle className="spin" size={21}/> : <ArrowUp size={22}/>}</button></div></div>
        </form>
        {!turns.length && <section className="suggestions"><div className="section-label">ลองถามเรื่องนี้ก็ได้ <span>หรือพิมพ์คำถามของคุณเอง</span></div><div className="suggestion-grid">{suggestions.map((item, index) => <button key={item} onClick={() => { setQuery(item); input.current?.focus(); }}><span className="suggestion-category">0{index + 1} &nbsp;ลองถาม</span><span className="suggestion-question">{item}</span><ArrowUpRight size={16}/></button>)}</div></section>}
        <footer className="workspace-footer"><span className="footer-spark">✳</span> ตอบจากสิ่งที่ค้นพบ ถ้าไม่พอจะบอกตรง ๆ <span className="footer-separator">·</span><button onClick={showSettings}>ใช้คีย์ของคุณเอง</button></footer><div ref={bottom}/>
      </div>
    </main>
    <dialog ref={modal} className="settings-dialog" onCancel={() => { setOpen(false); setPendingSearch(false); }} onClick={event => { if (event.target === modal.current) { setOpen(false); setPendingSearch(false); } }}><div className="dialog-content"><button className="close-dialog" onClick={() => { setOpen(false); setPendingSearch(false); }} aria-label="ปิดหน้าตั้งค่า"><X size={20}/></button><span className="dialog-icon"><KeyRound size={22}/></span><p className="eyebrow">MAKE IT YOURS</p><h2>เชื่อมต่อก่อนเริ่มคุย</h2><p className="dialog-description">ใส่คีย์ครั้งเดียว แล้วถามต่อได้เลย คีย์จะอยู่ในเบราว์เซอร์ของคุณเพื่อใช้หลังรีเฟรช</p><form onSubmit={saveKeys} autoComplete="off"><div className="key-field"><label htmlFor="tavily-key">Tavily <span>สำหรับค้นเว็บ · จำเป็น</span></label><input id="tavily-key" type="password" value={draftKeys.tavily} onChange={event => setDraftKeys(value => ({ ...value, tavily: event.target.value }))} placeholder="tvly-…" autoComplete="off" maxLength={512}/><a href="https://app.tavily.com/" target="_blank" rel="noopener noreferrer">รับคีย์ Tavily <ExternalLink size={12}/></a></div><div className="key-divider">เลือกโมเดลอย่างน้อยหนึ่งตัว</div><div className="key-field"><label htmlFor="gemini-key">Gemini <span>โมเดลหลัก</span></label><input id="gemini-key" type="password" value={draftKeys.gemini} onChange={event => setDraftKeys(value => ({ ...value, gemini: event.target.value }))} placeholder="Gemini API key" autoComplete="off" maxLength={512}/><a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">รับคีย์ Gemini <ExternalLink size={12}/></a></div><div className="key-field"><label htmlFor="groq-key">Groq <span>ใช้เดี่ยว ๆ หรือเป็นตัวสำรอง</span></label><input id="groq-key" type="password" value={draftKeys.groq} onChange={event => setDraftKeys(value => ({ ...value, groq: event.target.value }))} placeholder="gsk_…" autoComplete="off" maxLength={512}/><a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer">รับคีย์ Groq <ExternalLink size={12}/></a></div><label className="remember-choice"><input type="checkbox" checked={rememberDevice} onChange={event => setRememberDevice(event.target.checked)}/><span><strong>จำคีย์บนเครื่องนี้</strong><small>เปิดเว็บใหม่ก็ใช้ได้ ไม่ควรเลือกบนเครื่องที่ใช้ร่วมกัน</small></span></label>{settingsError && <p className="settings-error" role="alert">{settingsError}</p>}<button className="save-keys" type="submit">บันทึกแล้วเริ่มถาม <ArrowUpRight size={16}/></button><p className="quota-note">คีย์ถูกเก็บในเบราว์เซอร์แบบไม่เข้ารหัส และส่งผ่าน HTTPS เมื่อถาม ระบบไม่บันทึกคีย์ลงฐานข้อมูล การใช้งานขึ้นกับโควตา API ของแต่ละบริการ</p>{connected && <button type="button" className="forget-keys" onClick={forgetKeys}>ล้างคีย์จากเบราว์เซอร์นี้</button>}</form></div></dialog>
  </div>;
}

