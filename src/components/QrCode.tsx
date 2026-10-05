import { useEffect, useRef } from "react";

export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    let cancelled = false;
    const canvas = ref.current;

    void import("qrcode").then(async ({ default: QRCode }) => {
      if (cancelled) return;
      const styles = window.getComputedStyle(canvas);
      const dark = styles.getPropertyValue("--qr-dark").trim() || "#3a2114";
      const light = styles.getPropertyValue("--qr-light").trim() || "#e8b8b0";
      try {
        await QRCode.toCanvas(canvas, value, {
          width: size,
          margin: 1,
          color: { dark, light },
        });
      } catch {
        if (cancelled) return;
        await QRCode.toCanvas(canvas, value, {
          width: size,
          margin: 1,
          color: { dark: "#3a2114", light: "#e8b8b0" },
        });
      }
    }).catch((error: unknown) => {
      console.error("Codul QR nu a putut fi generat", error);
    });

    return () => {
      cancelled = true;
    };
  }, [value, size]);

  return <canvas ref={ref} width={size} height={size} aria-label="Cod QR" />;
}
