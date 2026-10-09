export function BrandMark() {
  return (
    <a
      className="mark flex flex-none items-center gap-s font-brand text-mark leading-none font-semibold tracking-tight no-underline"
      href="#"
      aria-label="Trellis"
    >
      <svg className="size-lg" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 21V11.5C12 8 15.4 6.2 17.6 8.2C19.3 9.8 18.3 12.6 16 12.5C14.4 12.4 13.8 10.8 14.6 9.8"
          fill="none"
          stroke="var(--stem-active)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M12 18C12 15.2 9.4 13.4 6.5 13.8C6.5 16.6 8.8 18.3 12 18Z" fill="var(--leaf)" />
      </svg>
      trellis
    </a>
  );
}
