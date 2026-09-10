// One icon set, one weight (1.75 stroke at 16px), all currentColor so they
// inherit whatever text color they sit in. Inline rather than a dependency:
// the app needs eight glyphs, not an icon library.

type IconProps = {
  className?: string;
};

function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ?? "h-4 w-4"}
    >
      {children}
    </svg>
  );
}

// The room glyph vocabulary: # for a room anyone can find, a padlock for one
// only members can see. Same two marks in the rail, the header, the dialog.
export function HashIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6 2 4.5 14M11.5 2 10 14M2.5 5.5h11M2 10.5h11" />
    </Svg>
  );
}

export function LockIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3" y="7" width="10" height="7" rx="2" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </Svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M8 3.5v9M3.5 8h9" />
    </Svg>
  );
}

export function PeopleIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="6" cy="5.5" r="2.5" />
      <path d="M1.5 13.5c0-2.2 2-3.5 4.5-3.5s4.5 1.3 4.5 3.5M11 3.4a2.5 2.5 0 0 1 0 4.7M12.4 10.4c1.3.5 2.1 1.5 2.1 3.1" />
    </Svg>
  );
}

export function MailIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="1.5" y="3.5" width="13" height="9" rx="2" />
      <path d="m2 5 5.1 3.6a1.5 1.5 0 0 0 1.8 0L14 5" />
    </Svg>
  );
}

export function SignOutIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6 14H3.5A1.5 1.5 0 0 1 2 12.5v-9A1.5 1.5 0 0 1 3.5 2H6M10.5 11 14 8l-3.5-3M14 8H6" />
    </Svg>
  );
}

export function ChevronLeftIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="m10 3-5 5 5 5" />
    </Svg>
  );
}

export function SendIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M14 8 2.5 2.5 4.5 8l-2 5.5L14 8ZM4.5 8H14" />
    </Svg>
  );
}

export function AlertIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 4.75v3.75M8 11.1h.01" />
    </Svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="8" cy="8" r="6.25" />
      <path d="m5.25 8.25 1.9 1.9 3.6-3.9" />
    </Svg>
  );
}

// The bare tick, for the checkbox -- CheckIcon's enclosing circle is too
// busy inside a 16px box.
export function CheckMarkIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="m3.5 8.5 3 3 6-7" />
    </Svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3 3" />
    </Svg>
  );
}
