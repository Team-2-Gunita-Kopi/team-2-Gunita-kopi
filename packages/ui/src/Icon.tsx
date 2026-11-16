import type { ReactNode, SVGProps } from "react";

/** SVG glyphs ported verbatim from the prototype's ICONS table (apps/admin/store.js). */
const PATHS = {
  cup: (
    <><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><path d="M7 2v2M11 2v2M15 2v2"/></>
  ),
  iced: (
    <><path d="M5 7h14l-1.5 13a2 2 0 0 1-2 1.8h-7A2 2 0 0 1 6.5 20Z"/><path d="M12 7V3m0 0-2 1.5M12 3l2 1.5"/><path d="M8 12l8 4M8 16l8-4"/></>
  ),
  rice: (
    <><path d="M4 12h16a8 8 0 0 1-16 0Z"/><path d="M7 12c0-3 2.2-5 5-5s5 2 5 5"/><path d="M15 3l4 3M17 2l3 4"/></>
  ),
  pastry: (
    <><path d="m4.6 13.1 14.8-6.4a1 1 0 0 1 1.3 1.2c-.7 3-3.4 5.1-6.5 5.1H6a1.4 1.4 0 0 1-1.4.1Z"/><path d="M4 17c3-1 13-1 16 0"/></>
  ),
  check: (
    <><path d="M20 6 9 17l-5-5"/></>
  ),
  alert: (
    <><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></>
  ),
  plus: (
    <><path d="M12 5v14M5 12h14"/></>
  ),
  trash: (
    <><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></>
  ),
  pencil: (
    <><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></>
  ),
  printer: (
    <><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></>
  ),
  receipt: (
    <><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1 2-1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 8h8M8 12h8M8 16h5"/></>
  ),
  cart: (
    <><circle cx="9" cy="21" r="1.5"/><circle cx="19" cy="21" r="1.5"/><path d="M2 3h3l2.6 12.5a2 2 0 0 0 2 1.5h8.7a2 2 0 0 0 2-1.6L22 7H6"/></>
  ),
  download: (
    <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/></>
  ),
  clock: (
    <><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></>
  ),
  x: (
    <><path d="M18 6 6 18M6 6l12 12"/></>
  ),
  logout: (
    <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></>
  ),
  eye: (
    <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></>
  ),
  eyeOff: (
    <><path d="M9.9 4.2A10.6 10.6 0 0 1 12 4c6.5 0 10 8 10 8a17 17 0 0 1-2.2 3.1M6.6 6.6C3.6 8.3 2 12 2 12s3.5 8 10 8a10 10 0 0 0 4.3-.9"/><path d="m2 2 20 20"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></>
  ),
  cash: (
    <><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></>
  ),
  wifiOff: (
    <><path d="m2 2 20 20"/><path d="M8.5 16.4a5 5 0 0 1 7 0M2 8.8a15 15 0 0 1 4.2-2.9M10.7 5.1A15 15 0 0 1 22 8.8M5 12.9a10 10 0 0 1 3.6-2.3M14.5 10.4a10 10 0 0 1 4.5 2.5"/><path d="M12 20h.01"/></>
  ),
  user: (
    <><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/></>
  ),
  box: (
    <><path d="M21 8 12 3 3 8v8l9 5 9-5Z"/><path d="M3 8l9 5 9-5M12 13v8"/></>
  ),
  truck: (
    <><path d="M1 8h13v9H1z"/><path d="M14 11h4l4 3v3h-8"/><circle cx="6" cy="19" r="1.6"/><circle cx="18" cy="19" r="1.6"/></>
  ),
  chart: (
    <><path d="M3 3v18h18"/><path d="m7 14 4-4 3 3 5-6"/></>
  ),
  users: (
    <><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 2.9-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M16 8.5a3 3 0 1 0-1.4-5.7M21.5 20c0-2.8-1.9-4.6-4.6-5.3"/></>
  ),
  home: (
    <><path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 22V12h6v10"/></>
  ),
  search: (
    <><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></>
  ),
  back: (
    <><path d="M19 12H5M12 19l-7-7 7-7"/></>
  ),
  wrench: (
    <><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = "cup" | "iced" | "rice" | "pastry" | "check" | "alert" | "plus" | "trash" | "pencil" | "printer" | "receipt" | "cart" | "download" | "clock" | "x" | "logout" | "eye" | "eyeOff" | "cash" | "wifiOff" | "user" | "box" | "truck" | "chart" | "users" | "home" | "search" | "back" | "wrench";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
}

export function Icon({ name, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
