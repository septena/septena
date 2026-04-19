"use client";

type TimeInputProps = {
  value: string; // "HH:MM"
  onChange: (value: string) => void;
  className?: string;
};

/** Native <input type="time"> with lang="en-GB" forced so the browser
 *  displays 24-hour times. Works in Safari/Firefox/Chrome on iOS & macOS
 *  when the system locale is set to a 24h region — the lang attribute
 *  tells the browser to prefer 24h rendering in the input field. */
export function TimeInput({ value, onChange, className }: TimeInputProps) {
  return (
    <input
      type="time"
      lang="en-GB"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    />
  );
}
