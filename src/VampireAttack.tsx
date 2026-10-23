import { useEffect, useRef, useState } from "react";
import { Eye } from "lucide-react";
import "./vampire-attack.css";

// A personalized, dismissible death scene. A room/player key prevents polling
// and reconnects from replaying the scene once it has been acknowledged.
export function VampireAttack({ eventKey }: { eventKey: string | null }) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const visible =
    !!eventKey &&
    dismissed !== eventKey &&
    sessionStorage.getItem(`vk-attack:${eventKey}`) !== "seen";

  function dismiss() {
    if (!eventKey) return;
    sessionStorage.setItem(`vk-attack:${eventKey}`, "seen");
    setDismissed(eventKey);
  }

  useEffect(() => {
    if (!visible || !eventKey) return;
    const el = dialog.current;
    el?.showModal();
    const timer = setTimeout(() => {
      sessionStorage.setItem(`vk-attack:${eventKey}`, "seen");
      setDismissed(eventKey);
    }, 8000);
    return () => {
      clearTimeout(timer);
      el?.close();
    };
  }, [eventKey, visible]);

  if (!visible) return null;
  return (
    <dialog
      ref={dialog}
      className="vampire-attack"
      aria-labelledby="attack-title"
      aria-describedby="attack-description"
      onCancel={(e) => {
        e.preventDefault();
        dismiss();
      }}
    >
      <div className="bite-vignette" aria-hidden="true" />
      <svg
        className="bite-fangs"
        viewBox="0 0 400 150"
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        <path d="M0 0H400V27H355V22H302V17H98V22H45V27H0Z" fill="#544056" />
        <path
          d="M0 19H46V30H74V19H326V30H354V19H400V36H350V42H321V28H79V42H50V36H0Z"
          fill="#b77983"
        />
        <path
          d="M50 31H87V64H81V86H75V107H68V121H61V99H55V70H50ZM313 31H350V70H345V99H339V121H332V107H325V86H319V64H313Z"
          fill="#fff4dd"
        />
        <path
          d="M50 31H60V70H65V99H61V88H55V70H50ZM313 31H323V64H329V86H334V107H332V99H325V86H319V64H313Z"
          fill="#e5d3bd"
        />
        <path
          d="M99 22H124V40H120V48H104V40H99M145 19H170V36H165V42H150V36H145M230 19H255V36H250V42H235V36H230M276 22H301V40H296V48H280V40H276"
          fill="#f4e7cf"
        />
        <path
          d="M61 112H68V123H65V130H61ZM332 112H339V130H335V123H332Z"
          fill="#bb737d"
          opacity=".75"
        />
      </svg>
      <div className="bite-specks" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="attack-message paper-card">
        <span className="eyebrow">GECE SANA UĞRADI</span>
        <svg
          className="attack-emblem"
          viewBox="0 0 100 76"
          shapeRendering="crispEdges"
          aria-hidden="true"
        >
          <path d="M15 20H25V11H75V20H85V51H75V61H25V51H15Z" fill="#ede2ed" />
          <path d="M24 23H76V48H69V55H31V48H24Z" fill="#624d70" />
          <path d="M24 23H76V29H24Z" fill="#c38b94" />
          <path
            d="M29 28H42V42H38V52H34V46H29ZM58 28H71V46H66V52H62V42H58Z"
            fill="#fff4dd"
          />
          <path
            d="M33 50H38V57H35V62H31V57H33M63 50H68V57H70V61H65V57H63"
            fill="#bc7b84"
          />
          <path d="M8 17H12V21H8M84 8H88V12H84M82 62H86V66H82" fill="#a18abb" />
        </svg>
        <h2 id="attack-title">Vampir seni buldu!</h2>
        <p id="attack-description">
          Vampir tarafından öldürüldün.
          <br />
          Köyün hikâyesini artık izleyici olarak takip edebilirsin.
        </p>
        <button
          type="button"
          className="button primary"
          onClick={dismiss}
          autoFocus
        >
          <Eye size={17} /> İzlemeye devam et
        </button>
        <span className="attack-auto-close">
          Bu ekran birazdan kendiliğinden kapanır.
        </span>
      </div>
      <svg
        className="bite-stains"
        viewBox="0 0 400 100"
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        <path
          d="M0 85H9V76H16V67H23V78H30V89H39V100H0ZM400 100H360V89H370V78H377V67H384V76H391V85H400Z"
          fill="#ba7982"
          opacity=".28"
        />
        <path
          d="M46 81H51V86H46M32 61H36V66H32M349 81H354V86H349M364 61H368V66H364"
          fill="#ba7982"
          opacity=".35"
        />
      </svg>
    </dialog>
  );
}
