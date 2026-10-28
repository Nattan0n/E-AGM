/** E-AGM logo mark: the brand icon (ballot slipping into an "E"). The artwork already carries its own rounded tile. */
export function LogoMark({ size = 32 }: { size?: number; tone?: "glass" | "solid" }) {
  // 128px file is enough for small sizes; the 256px one keeps large marks sharp on retina screens
  const src = size <= 64 ? "/brand/logo-mark-128.png" : "/brand/logo-mark.png";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} width={size} height={size} alt="" aria-hidden="true" draggable={false}
      style={{ display: "inline-block", verticalAlign: "top", flexShrink: 0, borderRadius: Math.round(size * 0.22), boxShadow: size >= 48 ? "0 8px 22px rgba(10,20,90,.28)" : "0 2px 8px rgba(10,20,90,.25)" }} />
  );
}
