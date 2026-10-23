import { Check, Shuffle, X } from "lucide-react";
import { Sprite } from "./art";
import { roleModeLabels, roles, type RoleMode } from "./game";

const choices = ["always", "random", "never"] as const;
export function RoleOptions({
  role,
  value,
  onChange,
}: {
  role: "doctor" | "jester";
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
              : "İdam edilirse tek başına kazanır."}
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
          ? "%50 ihtimalle gelir. Çekiliş sonucu oyun bitene kadar gizli."
          : value === "always"
            ? "Bu masada tam bir kişiye bu rol verilir."
            : "Bu masada bu rol dağıtılmaz."}
      </p>
    </fieldset>
  );
}
