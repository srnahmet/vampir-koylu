import { Check, Shuffle, X } from "lucide-react";
import { Sprite } from "./art";
import { roleModeLabels, roles, type Role, type RoleMode } from "./game";

const choices = ["always", "random", "never"] as const;
export function RoleOptions({
  role,
  value,
  onChange,
}: {
  role: Exclude<Role, "villager" | "vampire">;
  value: RoleMode;
  onChange: (value: RoleMode) => void;
}) {
  return (
    <fieldset className={`role-options ${role}`}>
      <legend>{roles[role].name}</legend>
      <div className="role-option-intro">
        <Sprite role={role} />
        <div>
          <strong>{roles[role].name}</strong>
          <span>
            {role === "doctor"
              ? "Her gece bir kişiyi korur."
              : role === "jester" ? "İdam edilirse tek başına kazanır." : roles[role].tag}
          </span>
        </div>
      </div>
      <div className="role-mode-control">
        {choices.map((mode) => (
          <label key={mode} className={value === mode ? "selected" : ""}>
            <input
              type="radio"
              name={`role-${role}`}
              value={mode}
              checked={value === mode}
              onChange={() => onChange(mode)}
            />
            {mode === "always" ? (
              <Check size={14} />
            ) : mode === "random" ? (
              <Shuffle size={14} />
            ) : (
              <X size={14} />
            )}
            <span>{roleModeLabels[mode]}</span>
          </label>
        ))}
      </div>
      <p>
        {value === "random"
          ? "%50 ihtimalle gelir; kesin rollerden sonra yer varsa dağıtılır. Çekiliş gizlidir."
          : value === "always"
            ? "Bu masada tam bir kişiye bu rol verilir."
            : "Bu masada bu rol dağıtılmaz."}
      </p>
    </fieldset>
  );
}
