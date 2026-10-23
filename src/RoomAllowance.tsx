import { useEffect, useState } from "react";
import { Clock, RefreshCw } from "lucide-react";
import type { RoomQuota } from "./game";

export function RoomAllowance({
  quota,
  offset,
  error,
  onRefresh,
}: {
  quota: RoomQuota | null;
  offset: number;
  error: string;
  onRefresh: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const minutes = quota?.next_refresh_at
    ? Math.max(
        1,
        Math.ceil((Date.parse(quota.next_refresh_at) - now - offset) / 60000),
      )
    : null;
  return (
    <div
      className={`room-allowance ${quota?.remaining === 0 ? "exhausted" : ""}`}
      aria-label="Masa kurma hakkın"
    >
      <div className="allowance-heading">
        <Clock size={15} />
        <span>
          1 saatte <strong>{quota?.limit ?? 10} masa</strong>
        </span>
        <strong className="allowance-remaining">
          {quota
            ? `${quota.remaining} hakkın kaldı`
            : error
              ? "Bilgi alınamadı"
              : "Hakların kontrol ediliyor…"}
        </strong>
      </div>
      {quota && (
        <>
          <div className="allowance-tickets" aria-hidden="true">
            {Array.from({ length: quota.limit }, (_, i) => (
              <i
                key={i}
                className={i < quota.remaining ? "available" : "used"}
              />
            ))}
          </div>
          <p>
            {minutes
              ? `Son 1 saatte ${quota.used} masa açtın. ${minutes} dk içinde bir hakkın yenilenir.`
              : "Her masa kurma hakkı, kullanıldıktan 60 dakika sonra yenilenir."}{" "}
            Masaya katılmak hak harcamaz.
          </p>
        </>
      )}
      {error && (
        <button type="button" className="text-button" onClick={onRefresh}>
          <RefreshCw size={13} /> Hakları yeniden kontrol et
        </button>
      )}
    </div>
  );
}
