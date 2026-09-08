// Clean inline SVG chrome icons (Fluent-style outline). No emoji, no unicode glyphs.

import type { JSX } from "react";

interface IconProps {
  size?: number;
  className?: string;
}

function base(size: number, className: string | undefined, children: JSX.Element | JSX.Element[]) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      style={{ flexShrink: 0, display: "block" }}
    >
      {children}
    </svg>
  );
}

export const HomeIcon = ({ size = 20, className }: IconProps) =>
  base(size, className, <>
    <path d="M4 11.5 12 4l8 7.5" />
    <path d="M6.5 10.5V20h11v-9.5" />
  </>);

export const AppsIcon = ({ size = 20, className }: IconProps) =>
  base(size, className, <>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </>);

export const FolderIcon = ({ size = 20, className }: IconProps) =>
  base(size, className, <>
    <path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h5l2 2.5h7A1.5 1.5 0 0 1 20.5 10v8a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18Z" />
  </>);

export const BookIcon = ({ size = 20, className }: IconProps) =>
  base(size, className, <>
    <path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H19v15.5H6.7A1.7 1.7 0 0 0 5 21Z" />
    <path d="M5 19.5A1.5 1.5 0 0 1 6.5 18H19" />
    <path d="M9.5 8.5h6" />
  </>);

export const GearIcon = ({ size = 20, className }: IconProps) =>
  base(size, className, <>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8" />
  </>);

export const SearchIcon = ({ size = 16, className }: IconProps) =>
  base(size, className, <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </>);

export const CloudIcon = ({ size = 18, className }: IconProps) =>
  base(size, className, <>
    <path d="M7 18.5a4.5 4.5 0 0 1-.9-8.9 6 6 0 0 1 11.6-1.2 4.2 4.2 0 0 1-.7 8.3Z" />
  </>);

export const PinIcon = ({ size = 15, className }: IconProps) =>
  base(size, className, <>
    <path d="M9 4h6l1 6 2.5 3v1.5H5.5V13L8 10Z" />
    <path d="M12 14.5V20" />
  </>);

export const CloseIcon = ({ size = 16, className }: IconProps) =>
  base(size, className, <>
    <path d="M6 6l12 12M18 6 6 18" />
  </>);

export const ChevronIcon = ({ size = 16, className }: IconProps) =>
  base(size, className, <path d="m6 9.5 6 6 6-6" />);

export const DotsIcon = ({ size = 16, className }: IconProps) =>
  base(size, className, <>
    <circle cx="5.5" cy="12" r="0.6" fill="currentColor" />
    <circle cx="12" cy="12" r="0.6" fill="currentColor" />
    <circle cx="18.5" cy="12" r="0.6" fill="currentColor" />
  </>);

export const DocIcon = ({ size = 32, className }: IconProps) =>
  base(size, className, <>
    <path d="M6.5 3.5h7l4 4V20a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z" />
    <path d="M13.5 3.5V8H18" />
  </>);

export const ImagesIcon = ({ size = 20, className }: IconProps) =>
  base(size, className, <>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m5.5 17.5 4.5-4.5 3 3 2-2 3.5 3.5" />
  </>);

export const ExternalIcon = ({ size = 13, className }: IconProps) =>
  base(size, className, <>
    <path d="M14 4h6v6" />
    <path d="M20 4 11 13" />
    <path d="M19 13.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5.5" />
  </>);

export const DownloadIcon = ({ size = 15, className }: IconProps) =>
  base(size, className, <>
    <path d="M12 4v11" />
    <path d="m7.5 11 4.5 4.5L16.5 11" />
    <path d="M4.5 19.5h15" />
  </>);
