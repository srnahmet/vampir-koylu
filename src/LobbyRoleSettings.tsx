import { useEffect, useId, useRef, useState } from "react";
import { Check, HelpCircle, X } from "lucide-react";
import { Sprite } from "./art";
import { roles, activeRoles, minimumPlayers, type Role, type RoleMode, type Settings } from "./domain";
import "./lobby-role-settings.css";

const order: Role[] = ["vampire", ...activeRoles.filter(r => r !== "vampire")];

function roleSetting(role: Role, settings: Settings) {
  if (role === "vampire") return {
    mode: "always" as RoleMode,
    label: "Kesin",
    text: `Bu masada ${settings.two_vampires ? 2 : 1} Vampir olacak.`,
  };
  if (role === "villager") return {
    mode: "random" as RoleMode,
    label: "Kalan yerlere bağlı",
    text: "Diğer roller dağıtıldıktan sonra boş kalan koltuklar Köylü olur. Sayısı dağıtımda belirlenir; %50 çekilişi yapılmaz.",
  };
  const mode = settings[role] || "never";
  return {
    mode,
    label: mode === "always" ? "Kesin seçildi" : mode === "random" ? "%50 şans" : "Kapalı",
    text: mode === "always"
      ? "Yer yeterliyse oyunda olur. Kesin roller oyuncu sayısına sığmazsa aralarından rastgele seçilir."
      : mode === "random"
        ? "%50 ihtimalle rol havuzuna girer. Yer yetmezse havuzdan rastgele seçilir; oyunda olması garanti değildir."
        : "Bu masada bu karakter dağıtılmaz.",
  };
}

/** Reads configured modes only; the hidden dealt roles never enter this component. */
export function LobbyRoleSettings({ settings, canEdit = false, busy = false, onChange }: { settings: Settings; canEdit?: boolean; busy?: boolean; onChange?: (role: Exclude<Role, "villager" | "vampire">, mode: RoleMode) => void }) {
  const [selected, setSelected] = useState<Role | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const detailId = useId();
  useEffect(() => {
    if (!selected) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setSelected(null);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [selected]);
  const detail = selected ? roleSetting(selected, settings) : null;
  return <div className="lobby-role-settings" ref={container} onKeyDown={event => {
    if (event.key === "Escape" && selected) { event.stopPropagation(); setSelected(null); }
  }}>
    <div className="lobby-role-heading"><strong>Karakter ayarları</strong><small>{canEdit ? "Dokun, ayarı değiştir" : "Masa sahibinin seçimleri"}</small></div>
    <div className="lobby-role-icons" role="group" aria-label="Masanın karakter ayarları">
      {order.map(role => {
        const setting = roleSetting(role, settings);
        return <button type="button" key={role} className={`lobby-role-icon ${setting.mode} ${selected === role ? "selected" : ""}`}
          aria-label={`${roles[role].name}: ${setting.label}`} aria-expanded={selected === role}
          aria-controls={selected === role ? detailId : undefined}
          title={`${roles[role].name}: ${setting.label}`} disabled={busy || !canEdit || role === "vampire" || role === "villager"}
          onClick={() => setSelected(selected === role ? null : role)}>
          <span aria-hidden="true" className="lobby-role-model"><Sprite role={role} /></span>
          {role === "vampire" && settings.two_vampires && <span className="lobby-vampire-count" aria-hidden="true">2</span>}
          <span className="lobby-role-mark" aria-hidden="true">{setting.mode === "always" ? <Check size={13} strokeWidth={3} /> : setting.mode === "never" ? <X size={13} strokeWidth={3} /> : <HelpCircle size={14} />}</span>
        </button>;
      })}
    </div>
    {selected && detail && <div id={detailId} className="lobby-role-detail" role="status" aria-live="polite">
      <div><strong>{roles[selected].name} {minimumPlayers(selected) > 4 && <small>· En az {minimumPlayers(selected)} oyuncu</small>}</strong>
        <div className="lobby-role-switch" role="group" aria-label={`${roles[selected].name} ayarı`}>
          {(["always", "random", "never"] as const).map(mode => <button type="button" key={mode} disabled={busy} aria-pressed={detail.mode === mode} onClick={() => {
            if (selected !== "vampire" && selected !== "villager") onChange?.(selected, mode);
          }}>{mode === "always" ? "Kesin oynasın" : mode === "random" ? "Şansa bağlı" : "Oynamasın"}</button>)}
        </div>
      </div>
      <button type="button" className="icon-button" aria-label="Karakter ayarını kapat" onClick={() => setSelected(null)}><X size={15} /></button>
    </div>}
    <p className="lobby-role-legend"><span><Check size={12} /> Kesin seçildi</span><span><X size={12} /> Kapalı</span><span><HelpCircle size={12} /> Şansa / kalan yere bağlı</span></p>
    <p className="lobby-role-note">Bunlar masa ayarlarıdır. Roller sığmazsa gizli çekiliş yapılır; hangi karakterlerin dağıtıldığı açıklanmaz. Şansa bağlı roller %50 ihtimalle havuza girer. Büyücü ve Alfa en az 8, Sapkın en az 6 oyuncuda dağıtılır.</p>
  </div>;
}
