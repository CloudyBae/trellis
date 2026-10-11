export function BrandMark() {
  return (
    <a
      className="mark flex flex-none items-center gap-s font-brand text-mark leading-none font-semibold tracking-tight no-underline"
      href="#"
      aria-label="Trellis"
    >
      <svg
        className="size-lg"
        viewBox="2.65 3.5 19 19"
        fill="none"
        stroke="var(--stem)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M11 21V13" />
        <path d="M11 13.2C10 8 13 5 19.4 4.8C20.2 10.8 17 14 11 13.2Z" />
        <path d="M11 14C10.4 10.4 8 7.8 4.6 7.8C4.4 11.8 7.2 14.6 11 14Z" />
      </svg>
      trellis
    </a>
  );
}
