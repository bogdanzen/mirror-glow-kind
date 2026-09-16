/**
 * On-screen numeric keypad for the kiosk: the totem has no keyboard, so the
 * PIN is entered with large touch targets (min 88px) and no rounded corners.
 */
export function PinPad({
  value,
  onChange,
  max = 8,
}: {
  value: string;
  onChange: (next: string) => void;
  max?: number;
}) {
  const press = (key: string) => {
    if (key === "⌫") return onChange(value.slice(0, -1));
    if (key === "C") return onChange("");
    if (value.length >= max) return;
    onChange(value + key);
  };

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"];

  return (
    <div className="mt-10 grid grid-cols-3 gap-px bg-hairline">
      {keys.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => press(key)}
          className="h-[88px] bg-background font-display text-3xl text-foreground transition-colors duration-200 active:bg-primary active:text-primary-foreground"
        >
          {key}
        </button>
      ))}
    </div>
  );
}
