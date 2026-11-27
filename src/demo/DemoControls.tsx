import { useState } from "react";
import { Eye, FlaskConical, Monitor, Play, RotateCcw, X } from "lucide-react";
import { activeRoles, roles, type Game } from "../domain";
import { demoCast, demoNames, validateDemo, type DemoSeat } from "./config";
import type { DemoPlayer } from "./engine";
import "./demo.css";

export function DemoSetup({ busy, error, onStart, onClose }: { busy: boolean; error: string; onStart: (seats: DemoSeat[]) => void; onClose: () => void }) {
  const [seats, setSeats] = useState<DemoSeat[]>(demoCast.map((role, i) => ({ role, name: demoNames[i] })));
  const validation = validateDemo(seats);
  return <main className="demo-setup paper-card">
    <div className="section-top"><span className="eyebrow"><FlaskConical size={18} /> BOTLARLA OYUN PROVASI</span><button className="icon-button" aria-label="Demoyu kapat" disabled={busy} onClick={onClose}><X size={22} /></button></div>
    <h1>Kendi senaryonu kur.</h1>
    <p>Rolleri sen dağıt. Gerçek oyun ekranlarında oyuncular arasında geçiş yap, seçimlerini dene ve <strong>İleri</strong> ile oyunu izle. Sayaç yok; sen tıklamadan hiçbir aşama geçmez.</p>
    <div className="demo-presets" role="group" aria-label="Demo senaryoları">
      <button className="button secondary" disabled={busy} onClick={() => setSeats(demoCast.map((role, i) => ({ role: i === 1 ? "villager" : role, name: demoNames[i] })))}>Tek vampir</button>
      <button className="button secondary" disabled={busy} onClick={() => setSeats(demoCast.map((role, i) => ({ role, name: demoNames[i] })))}>İki vampir</button>
      <button className="button secondary" disabled={busy} onClick={() => setSeats(demoCast.map((role, i) => ({ role: i === 0 ? "alpha_vampire" : role, name: demoNames[i] })))}>Alfa ve Büyücü</button>
      <label>Oyuncu sayısı <select aria-label="Demo oyuncu sayısı" value={seats.length} disabled={busy} onChange={e => setSeats(Array.from({ length: Number(e.target.value) }, (_, i) => seats[i] || { name: demoNames[i], role: "villager" }))}>{Array.from({ length: 13 }, (_, i) => i + 4).map(n => <option key={n}>{n}</option>)}</select></label>
    </div>
    <div className="demo-seats">{seats.map((seat, i) => <div className="demo-seat" key={i}><span className="number-badge">{i + 1}</span><label>Oyuncu adı<input aria-label={`${i + 1}. oyuncu adı`} value={seat.name} maxLength={20} disabled={busy} onChange={e => setSeats(seats.map((p, j) => j === i ? { ...p, name: e.target.value } : p))} /></label><label>Rol<select aria-label={`${i + 1}. oyuncunun rolü`} value={seat.role} disabled={busy} onChange={e => setSeats(seats.map((p, j) => j === i ? { ...p, role: e.target.value as DemoSeat["role"] } : p))}>{activeRoles.map(role => <option key={role} value={role}>{roles[role].name}</option>)}</select></label></div>)}</div>
    <p className="demo-note">Botlar ilk gece aynı şüphelinin peşine düşer; doktor onu korumayı dener. Sonraki turlarda hedefler değişir. İstediğin oyuncuya geçerek bu senaryoyu kendi hamlelerinle değiştirebilirsin. Büyücü botu tek kullanımlık hakkını senin denemen için saklar.</p>
    {(validation || error) && <p className="error" role="alert">{validation || error}</p>}
    <button className="button primary full" disabled={busy || !!validation} onClick={() => onStart(seats)}><Play size={19} />{busy ? "Demo hazırlanıyor…" : "Botlarla demoyu başlat"}</button>
    <p className="demo-note">Demo yalnızca bu tarayıcıda çalışır. Gerçek masa hakkı harcamaz. Sayfayı yenilersen sıfırlanır.</p>
  </main>;
}

export function DemoControls({ game, players, busy, onView, onNext, onReset }: { game: Game; players: DemoPlayer[]; busy: boolean; onView: (id: string | null) => void; onNext: () => void; onReset: () => void }) {
  return <section className="demo-controls paper-card" aria-label="Demo kumandası">
    <div className="demo-control-heading"><div><span className="eyebrow"><FlaskConical size={18} /> DEMO · SÜRESİZ</span><h2>Köyü farklı gözlerden izle.</h2></div><button className="text-button" disabled={busy} onClick={onReset}><RotateCcw size={17} />Senaryoyu yeniden kur</button></div>
    <div className="demo-toolbar"><label><Eye size={18} /> Bu oyuncunun ekranındasın<select aria-label="Demo bakış açısı" disabled={busy} value={game.me?.id || ""} onChange={e => onView(e.target.value || null)}><option value="">Paylaşım ekranı · Rol yok</option>{players.map(p => <option key={p.id} value={p.id}>#{p.number} {p.name} · {roles[p.role].name}{p.alive ? "" : " · Elendi"}</option>)}</select></label><button className="button primary" disabled={busy || game.phase === "finished"} onClick={onNext}><Play size={19} />{busy ? "İşleniyor…" : "İleri"}</button></div>
    <p>İstediğin anda rol değiştirip o oyuncunun özel ekranını görebilirsin. Önce hamleni yapabilir veya doğrudan <strong>İleri</strong> diyebilirsin; eksik hamleleri botlar tamamlar, oyun bir aşama ilerler. Seçimlerin korunur.</p>
    {game.is_observer && <p><Monitor size={16} /> Ortak ekranda gizli roller ve seçimler gösterilmez.</p>}
    {["intro", "day", "runoff"].includes(game.phase) && <div className="demo-conversation" aria-label="Botların sohbeti"><strong>Köy meydanında konuşulanlar</strong>{game.players.filter(p => p.alive && !p.silenced).slice(0, 3).map((p, i) => <p key={p.id}><b>{p.name}:</b> {game.phase === "intro" ? ["Değirmenin oralarda ayak sesleri duydum. Önce herkesi dinleyelim.", "İlk gece hepimiz için zor olacak. Doktor varsa dikkatli seçsin.", "Ben köydenim. Birbirimizin söylediklerini takip edelim."][i] : ["Dünkü konuşmaları düşünelim. Aynı kişiyi suçlayanlar neden anlaştı?", "Bu gece olanları herkes gördü. Hemen karar vermeyelim.", "Sadece sessiz kaldı diye birini suçlamak istemiyorum."][i]}</p>)}</div>}
  </section>;
}

export function DemoMobileNotice({ onClose }: { onClose: () => void }) {
  return <main className="demo-mobile-notice paper-card"><Monitor size={42} /><h1>Demo bu modda kullanılamıyor.</h1><p>Botlarla demo, masaüstü web görünümü içindir. Devam etmek için pencereyi genişlet veya bilgisayardan aç. Demo ilerlemesi bu sırada durur.</p><button className="button secondary" onClick={onClose}>Ana sayfaya dön</button></main>;
}
