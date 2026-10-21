import { useId } from "react";
import type { Role } from "./game";

export function Sprite({
  role = "villager",
  className = "",
}: {
  role?: Role;
  className?: string;
}) {
  const clothes = {
    villager: "#d49b50",
    vampire: "#6f598e",
    doctor: "#77b39e",
    jester: "#d87f8d",
  }[role];
  return (
    <svg
      className={`sprite ${className}`}
      viewBox="0 0 32 40"
      shapeRendering="crispEdges"
      role="img"
      aria-label={
        {
          villager: "Köylü",
          vampire: "Vampir",
          doctor: "Doktor",
          jester: "Şarlatan",
        }[role]
      }
    >
      <ellipse cx="16" cy="37" rx="12" ry="2" fill="#36314a" opacity=".13" />
      {role === "vampire" && <path d="M7 22H25L30 36H2Z" fill="#44344f" />}
      <path d="M8 22H24V34H8Z" fill={clothes} />
      <path d="M4 24H8V32H4M24 24H28V32H24" fill="#e9ba91" />
      <path d="M10 34H15V38H8V36H10M18 34H23V36H25V38H18" fill="#493c45" />
      <path d="M6 10H26V21H23V24H9V21H6Z" fill="#ecc6a2" />
      <path
        d="M6 7H9V4H23V7H26V14H23V10H20V13H12V10H9V15H6Z"
        fill={
          role === "vampire"
            ? "#393148"
            : role === "jester"
              ? "#794c4d"
              : "#71503d"
        }
      />
      <path d="M11 15H13V18H11M20 15H22V18H20" fill="#3f3540" />
      <path d="M14 21H19V22H14" fill="#bd7e75" />
      <path d="M8 19H11V20H8M22 19H25V20H22" fill="#df9c92" />
      {role === "vampire" && (
        <>
          <path d="M13 20H15V23H13M19 20H21V23H19" fill="#fff6e2" />
          <path d="M9 25H23L16 30Z" fill="#e7d2bd" />
        </>
      )}
      {role === "doctor" && (
        <>
          <path d="M7 4H25V10H7Z" fill="#f5f3da" />
          <path d="M15 4H18V10H15M13 6H20V8H13" fill="#ce7379" />
          <path d="M15 26H18V32H15M13 28H20V30H13" fill="#f5f3da" />
        </>
      )}
      {role === "jester" && (
        <>
          <path d="M5 8V0H10V3H15V7H18V3H23V0H28V8Z" fill="#a28abe" />
          <path d="M3 0H7V3H3M26 0H30V3H26" fill="#e9b65c" />
          <path d="M10 25H23L16 30Z" fill="#ecd790" />
        </>
      )}
      {role === "villager" && (
        <>
          <path d="M3 8H29V11H3M8 3H24V8H8" fill="#e5bc6c" />
          <path d="M8 7H24V9H8" fill="#b48243" />
          <path d="M12 25H14V33H12M20 25H22V33H20" fill="#765943" />
        </>
      )}
    </svg>
  );
}

export function Village({
  night = false,
  compact = false,
}: {
  night?: boolean;
  compact?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const trees = [
    [18, 112],
    [43, 102],
    [73, 126],
    [331, 105],
    [357, 119],
    [385, 98],
    [288, 113],
  ];
  return (
    <div
      className={`village ${night ? "night" : ""} ${compact ? "compact" : ""}`}
    >
      <svg
        viewBox="0 0 400 260"
        role="img"
        aria-label={
          night
            ? "Geceye bürünen piksel köy"
            : "Ağaçlar ve rengârenk evlerle neşeli piksel köy"
        }
        shapeRendering="crispEdges"
      >
        <defs>
          <linearGradient id={uid} x2="0" y2="1">
            <stop stopColor={night ? "#403859" : "#d6e6df"} />
            <stop offset="1" stopColor={night ? "#867ba5" : "#f8eaca"} />
          </linearGradient>
        </defs>
        <rect width="400" height="260" fill={`url(#${uid})`} />
        <g className="clouds" fill={night ? "#8c829e" : "#fff6e4"} opacity=".7">
          <path d="M35 47H47V38H73V43H89V53H35ZM273 67H287V56H313V62H328V72H273ZM155 30H166V24H185V29H198V35H155Z" />
        </g>
        <g className="sky-orb">
          <path
            d="M326 24H347V30H353V51H347V57H326V51H320V30H326Z"
            fill={night ? "#f2e7bc" : "#f1cb77"}
          />
          {night && (
            <path d="M340 24H347V30H353V46H340V40H334V30H340Z" fill="#4d4266" />
          )}
        </g>
        {night && (
          <g fill="#f6e9c2">
            <path d="M60 20H63V23H60M113 61H116V64H113M219 25H222V28H219M250 48H253V51H250M372 70H375V73H372" />
          </g>
        )}
        <path
          d="M0 133H28V115H55V102H87V114H119V98H149V111H177V95H201V109H229V97H256V113H290V100H322V114H357V103H382V120H400V260H0Z"
          fill={night ? "#686e82" : "#b8c9a9"}
        />
        <path
          d="M0 153H35V143H76V135H113V145H151V135H190V144H236V134H274V144H320V132H360V143H400V260H0Z"
          fill={night ? "#555c71" : "#9db78f"}
        />
        <path
          d="M0 184H48V176H100V170H159V178H221V169H279V177H342V183H400V260H0Z"
          fill={night ? "#67746b" : "#b4c693"}
        />
        <path
          d="M184 177H220V198H239V218H259V238H279V260H143V240H159V218H171V198H184Z"
          fill={night ? "#a99b8c" : "#e8d0a1"}
        />
        <path
          d="M203 189H218V198H203M179 219H194V225H179M235 242H250V248H235"
          fill={night ? "#8a817a" : "#d5b984"}
        />
        {trees.map(([x, y], i) => (
          <g key={i} transform={`translate(${x} ${y})`}>
            <path d="M-3 7H3V39H-3Z" fill="#79684d" />
            <path
              d="M-6-26H6V-16H13V-7H20V8H13V18H-13V8H-20V-7H-13V-16H-6Z"
              fill={night ? "#415d5b" : i % 2 ? "#6e987b" : "#7fa285"}
            />
            <path
              d="M-13-7H-6V-16H5V-21H-3V-14H-10Z"
              fill={night ? "#58736b" : "#9bbb8b"}
            />
          </g>
        ))}
        <g transform="translate(95 110)">
          <path d="M0 22H63V75H0Z" fill={night ? "#c3b6a2" : "#f2dfb5"} />
          <path
            d="M-8 24V16H0V8H8V0H17V-8H45V0H54V8H63V16H71V24Z"
            fill={night ? "#946e83" : "#d28a78"}
          />
          <path
            d="M-1 16H63V24H-1M9 0H53V8H9"
            fill={night ? "#805f75" : "#bc756b"}
          />
          <path
            d="M10 37H23V52H10M43 37H56V52H43"
            fill={night ? "#f3d991" : "#94b2b1"}
          />
          <path d="M30 47H41V75H30" fill="#9b7960" />
          <path d="M-4 72H67V78H-4" fill="#927b5d" />
          <path
            d="M10 42H23M16 37V52M43 42H56M49 37V52"
            stroke="#ead4a7"
            strokeWidth="2"
          />
        </g>
        <g transform="translate(225 95)">
          <path d="M0 32H64V88H0Z" fill={night ? "#a5afb0" : "#d9dfcb"} />
          <path
            d="M-8 34V26H0V18H8V10H16V2H25V-6H40V2H49V10H57V18H65V26H73V34Z"
            fill={night ? "#726989" : "#8e98a8"}
          />
          <path
            d="M13 47H27V64H13M42 47H56V64H42"
            fill={night ? "#f3d991" : "#a7bcc0"}
          />
          <path d="M29 64H40V88H29" fill="#9c8270" />
          <path d="M28 14H39V29H28" fill={night ? "#f3d991" : "#d7c7a4"} />
          <path d="M-4 86H68V92H-4M50-5H59V15H50" fill="#8a7c74" />
          <path d="M18 47V64M47 47V64" stroke="#ece2c7" strokeWidth="2" />
        </g>
        <g fill={night ? "#848c79" : "#859f6a"}>
          <path d="M20 216H31V220H20M71 233H88V237H71M300 220H311V224H300M352 239H369V243H352M114 205H125V209H114" />
        </g>
        <g fill="#e3ad9f">
          <path d="M36 224H40V228H36M324 208H328V212H324M287 241H291V245H287" />
        </g>
        <g fill="#f6dc96">
          <path d="M50 212H54V216H50M341 227H345V231H341M111 239H115V243H111" />
        </g>
        <g transform="translate(178 161) scale(.8)">
          <path d="M0 14H18V29H0" fill="#d4a056" />
          <path d="M2 0H16V15H2" fill="#edc4a1" />
          <path d="M0 0H18V5H0M4-4H14V0H4" fill="#e8bd6e" />
          <path d="M5 8H7V10H5M12 8H14V10H12" fill="#4a3c45" />
          <path d="M2 29H7V33H2M12 29H17V33H12" fill="#6a5445" />
        </g>
        <g className="little-vamp" transform="translate(272 190) scale(.8)">
          <path d="M-4 15H22V33H-4" fill="#645474" />
          <path d="M2 0H16V15H2" fill="#e9c4b5" />
          <path d="M0-2H18V6H14V2H10V7H7V2H4V6H0" fill="#3f354d" />
          <path d="M5 9H7V11H5M12 9H14V11H12" fill="#4a3c45" />
          <path d="M5 13H7V17H5M12 13H14V17H12" fill="#fff4db" />
          <path d="M2 29H7V33H2M12 29H17V33H12" fill="#453950" />
        </g>
      </svg>
      <div className="scene-label">
        <span className="status-dot" />
        {night ? "Şşşt… köy uyuyor." : "Köy sakin. Şimdilik."}
      </div>
    </div>
  );
}
