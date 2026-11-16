import React from "react";
import { Icon, type IconName } from "./Icon";

export interface SegOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
}

export interface SegProps<T extends string> {
  options: SegOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}

export function Seg<T extends string>({ options, value, onChange, label }: SegProps<T>) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.icon ? <Icon name={o.icon} /> : null}
          {o.label}
        </button>
      ))}
    </div>
  );
}
