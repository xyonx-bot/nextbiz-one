import { ICON_SPRITE } from "./icon-sprite";

/** Phosphor icon from the inline sprite. Inherits `color` (currentColor) so it can take module accents. */
export function Icon({ name, size, className = "", style, title }: {
  name: string;
  size?: "xs" | "sm" | "lg" | "xl";
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}) {
  return (
    <svg className={`i${size ? ` i-${size}` : ""}${className ? ` ${className}` : ""}`} style={style} aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title && <title>{title}</title>}
      <use href={`#i-${name}`} />
    </svg>
  );
}

/** Rendered once in the root layout. */
export function IconSprite() {
  return <div hidden dangerouslySetInnerHTML={{ __html: ICON_SPRITE }} />;
}
