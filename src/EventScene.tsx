import type { CSSProperties } from "react";
import { Sprite } from "./art";
import type { Role } from "./game";

export type SceneKind =
  | "night"
  | "voting"
  | "night_death"
  | "execution"
  | "saved"
  | "village_win"
  | "vampire_win"
  | "jester_win"
  | "roles"
  | "discussion";
const labels: Record<SceneKind, string> = {
  night: "Ay ışığında uyuyan köy, uçuşan yarasalar",
  voting: "Köy meydanında oy sandığı ve oylarını getiren köylüler",
  night_death: "Sönen fener ve köyden ayrılan bir ruh",
  execution: "Köyün kararıyla meydandan ayrılan bir köy sakini",
  saved: "Doktorun koruma kalkanıyla güvende kalan köy sakini",
  village_win: "Güneşli köy meydanında köylülerin zafer kutlaması",
  vampire_win: "Ayın altında zaferini kutlayan vampir",
  jester_win: "Konfetiler arasında zafer dansı yapan şarlatan",
  roles: "Gizli rollerin dağıtıldığı soru işaretli kartlar",
  discussion: "Köy meydanındaki konuşma kürsüsü",
};
type Cast = {
  role: Role;
  x: number;
  size?: number;
  neutral?: boolean;
  effect?: string;
};
const casts: Record<SceneKind, Cast[]> = {
  night: [{ role: "vampire", x: 77, size: 48, effect: "sneak" }],
  voting: [
    { role: "villager", x: 92, neutral: true, effect: "voter" },
    { role: "villager", x: 267, neutral: true, effect: "voter" },
  ],
  night_death: [
    { role: "villager", x: 180, size: 72, neutral: true, effect: "ghost" },
  ],
  execution: [
    { role: "villager", x: 180, size: 72, neutral: true, effect: "farewell" },
  ],
  saved: [
    { role: "doctor", x: 132, size: 66, effect: "healer" },
    { role: "villager", x: 219, size: 66, neutral: true, effect: "protected" },
  ],
  village_win: [
    { role: "villager", x: 104, size: 57, effect: "celebrate" },
    { role: "villager", x: 180, size: 76, effect: "celebrate" },
    { role: "doctor", x: 257, size: 57, effect: "celebrate" },
  ],
  vampire_win: [
    { role: "vampire", x: 180, size: 87, effect: "victory-vampire" },
  ],
  jester_win: [
    { role: "villager", x: 94, size: 48, neutral: true },
    { role: "jester", x: 180, size: 87, effect: "jester-dance" },
    { role: "villager", x: 266, size: 48, neutral: true },
  ],
  roles: [],
  discussion: [{ role: "villager", x: 180, size: 64, neutral: true }],
};
export function EventScene({
  kind,
  small = false,
}: {
  kind: SceneKind;
  small?: boolean;
}) {
  const dark = ["night", "night_death", "vampire_win"].includes(kind);
  const win = kind.endsWith("_win");
  return (
    <div
      className={`event-scene event-${kind} ${small ? "small-scene" : ""}`}
      role="img"
      aria-label={labels[kind]}
    >
      <svg
        className="event-backdrop"
        viewBox="0 0 360 180"
        preserveAspectRatio="xMidYMid slice"
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        <rect
          width="360"
          height="180"
          fill={
            dark
              ? "#44405f"
              : kind === "saved"
                ? "#d5e9db"
                : kind === "jester_win"
                  ? "#f3dce6"
                  : "#eee6cb"
          }
        />
        <path
          d="M0 132H30V115H62V128H94V108H125V125H161V113H195V123H229V107H263V124H302V111H330V128H360V180H0Z"
          fill={dark ? "#555a70" : "#c2cea9"}
        />
        <path
          d="M0 153H53V143H111V151H158V141H208V150H263V144H318V153H360V180H0Z"
          fill={dark ? "#687477" : "#a9c19a"}
        />
        <path
          d="M90 180V168H123V159H236V168H269V180Z"
          fill={dark ? "#9a9196" : "#d3bb91"}
        />
        {dark ? (
          <>
            <path
              d="M289 17H307V23H313V41H307V47H289V41H283V23H289Z"
              fill="#f4df9a"
            />
            <path d="M300 17H309V22H315V36H300V30H295V22H300Z" fill="#44405f" />
            {[29, 84, 132, 223, 251, 337].map((x, i) => (
              <path
                key={x}
                className="scene-twinkle"
                d={`M${x} ${19 + (i % 3) * 16}h3v3h-3Z`}
                fill="#f4e7b9"
                style={{ animationDelay: `${i * 0.3}s` }}
              />
            ))}
            <g className="scene-bats" fill="#302c47">
              <path d="M216 51V44L223 48L229 44V51L223 55ZM52 58V51L59 55L65 51V58L59 62Z" />
            </g>
          </>
        ) : (
          <>
            <path
              d="M284 24H304V30H310V50H304V56H284V50H278V30H284Z"
              fill="#e8bd65"
            />
            <path
              className="event-cloud"
              d="M23 38H35V30H58V35H74V43H23ZM219 63H232V54H251V59H265V68H219Z"
              fill="#fffae8"
            />
          </>
        )}
        {!["roles", "discussion"].includes(kind) && (
          <>
            <path d="M19 133V105H35V133M325 133V105H341V133" fill="#a58a6d" />
            <path
              d="M12 103V83H20V76H34V83H42V103ZM318 103V83H326V76H340V83H348V103Z"
              fill={dark ? "#a59077" : "#d8b475"}
            />
            <path
              d="M19 87H35V98H19M325 87H341V98H325"
              fill={kind === "night_death" ? "#5f586b" : "#f7e2a1"}
            />
          </>
        )}
        {kind === "voting" && (
          <>
            <path d="M156 139H205V169H156Z" fill="#ac8873" />
            <path d="M151 132H210V141H151Z" fill="#dbb48b" />
            <path d="M166 133H194V136H166" fill="#6d5959" />
            <g className="ballot-drop">
              <path d="M174 105H191V128H174Z" fill="#fff9e8" />
              <path
                d="M178 113L182 117L188 109"
                fill="none"
                stroke="#7f9c77"
                strokeWidth="3"
              />
            </g>
          </>
        )}
        {kind === "execution" && (
          <>
            <path d="M144 156H216V162H144M137 162H223V169H137" fill="#b8a28f" />
            <path
              className="decision-seal"
              d="M277 105H307V132H277Z"
              fill="#f8ebcf"
            />
            <path d="M284 114H299V117H284M284 121H296V124H284" fill="#ae827c" />
          </>
        )}
        {kind === "saved" && (
          <g className="protection-shield">
            <path
              d="M188 76H253V118L245 132L220 148L196 132L188 118Z"
              fill="#79b89c"
              opacity=".3"
            />
            <path
              d="M188 76H253V118L245 132L220 148L196 132L188 118Z"
              fill="none"
              stroke="#6ca789"
              strokeWidth="3"
            />
          </g>
        )}
        {kind === "discussion" && (
          <>
            <path d="M150 140H212V173H150" fill="#b79572" />
            <path d="M145 135H217V143H145" fill="#d9b38a" />
            <path d="M171 146H190V155H171" fill="#eddbb0" />
            <path
              d="M195 120V135M193 118H198V122H193"
              stroke="#6a6967"
              strokeWidth="2"
            />
          </>
        )}
        {kind === "roles" &&
          [0, 1, 2].map((i) => (
            <g key={i} className={`mystery-card card-${i}`}>
              <path
                d={`M${110 + i * 38} 67h54v75h-54Z`}
                fill={i === 1 ? "#a596bf" : "#c6b6d3"}
                stroke="#88739f"
                strokeWidth="2"
              />
              <text
                x={137 + i * 38}
                y="117"
                textAnchor="middle"
                fontSize="36"
                fill="#fff5df"
                fontFamily="var(--heading)"
              >
                ?
              </text>
            </g>
          ))}
        {win &&
          Array.from({ length: 18 }, (_, i) => (
            <rect
              key={i}
              className="scene-confetti"
              x={33 + i * 17}
              y={15 + (i % 4) * 18}
              width={i % 2 ? 3 : 5}
              height={i % 2 ? 6 : 3}
              fill={["#bd95bf", "#e1b85d", "#85b49b", "#df9b9c"][i % 4]}
              style={{ animationDelay: `${i * 0.12}s` }}
            />
          ))}
        {kind === "vampire_win" && (
          <path
            className="scene-crown"
            d="M160 37V23L170 30L180 18L190 30L200 23V37Z"
            fill="#eac56e"
          />
        )}
        {kind === "jester_win" && (
          <g className="jester-sparkles" fill="#d2a65e">
            <path d="M127 48H131V58H127M124 51H134V55H124M229 70H233V80H229M226 73H236V77H226" />
          </g>
        )}
      </svg>
      <div aria-hidden="true" className="event-cast">
        {casts[kind].map((p, i) => (
          <div
            key={i}
            className={`scene-person ${p.effect || ""}`}
            style={
              {
                left: `${(p.x / 360) * 100}%`,
                "--person-size": `${p.size || 60}px`,
                "--delay": `${i * 0.2}s`,
              } as CSSProperties
            }
          >
            <Sprite role={p.role} neutral={p.neutral} />
            {kind === "night" && <span className="sleep-letter">z Z</span>}
            {kind === "saved" && p.effect === "protected" && (
              <span className="healing-heart">♥</span>
            )}
            {kind === "night_death" && <span className="spirit-spark">✦</span>}
          </div>
        ))}
      </div>
      <span className="scene-caption">
        {
          {
            night: "GECE VARDİYASI",
            voting: "SANDIKLAR AÇIK",
            night_death: "KÖYDE BİR EKSİĞİZ",
            execution: "KÖYÜN KARARI",
            saved: "İYİ Kİ DOKTOR VAR",
            village_win: "KÖYÜMÜZ GÜVENDE",
            vampire_win: "GECENİN KAZANANI",
            jester_win: "SON GÜLEN ŞARLATAN",
            roles: "HERKESE BİR KÜÇÜK SIR",
            discussion: "SÖZ KÖY AHALİSİNDE",
          }[kind]
        }
      </span>
    </div>
  );
}
