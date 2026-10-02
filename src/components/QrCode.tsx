import { useEffect, useRef } from "react";
import QRCode from "qrcode";

export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    const styles = window.getComputedStyle(ref.current);
    const dark = styles.getPropertyValue("--qr-dark").trim() || "#3a2114";
    const light = styles.getPropertyValue("--qr-light").trim() || "#e8b8b0";
    void QRCode.toCanvas(ref.current, value, {
      width: size,
      margin: 1,
      color: { dark, light },
    }).catch(() => QRCode.toCanvas(ref.current, value, {
      width: size,
      margin: 1,
      color: { dark: "#3a2114", light: "#e8b8b0" },
    }));
  }, [value, size]);

  return <canvas ref={ref} width={size} height={size} aria-label="Cod QR" />;
}
