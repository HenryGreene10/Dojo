import Link from "next/link";

export function DojoMark({ link = true }: { link?: boolean }) {
  const mark = (
    <span className="brand-mark" aria-label="Mahjong Dojo">
      <span className="brand-tile" aria-hidden="true">東</span>
      <span>Mahjong Dojo</span>
    </span>
  );

  return link ? <Link href="/">{mark}</Link> : mark;
}
