import { useEffect, useRef } from "react";
import QRCode from "qrcode";

export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    void QRCode.toCanvas(ref.current, value, {
      width: size,
      margin: 1,
      color: { dark: "#141210", light: "#F2EBDD" },
    });
  }, [value, size]);

  return <canvas ref={ref} width={size} height={size} aria-label="Cod QR" />;
}
