import React from "react";
import { bankInfo, networkInfo } from "../../lib/banks";
import { cx } from "./cx";

const src = (file) => import.meta.env.BASE_URL + "banks/" + file;

/** Up to two initials, skipping filler words ("Bank of Ceylon" → "BC"). */
export function initials(name) {
  const words = String(name || "").split(/[\s&.'-]+/).filter((w) => w && !/^(bank|of|the|and)$/i.test(w));
  const pick = words.length ? words : String(name || "?").split(/\s+/);
  return pick.slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
}

/**
 * Square account icon: the bank's logo (or initials), a ₨ tile for cash,
 * and for cards a small network badge (Visa / Mastercard / Amex) in the corner.
 * Decorative — the account's name is always shown next to it.
 */
export function AccountLogo({ kind = "bank", logo, network, name, size = "md", className }) {
  const bank = bankInfo(logo);
  const net = networkInfo(network);
  let tile;
  if (bank?.file) tile = <img src={src(bank.file)} alt="" loading="lazy" />;
  else if (kind === "cash") tile = <span className="alogo-mono cash">₨</span>;
  else if (kind === "card" && !bank && net) tile = <img src={src(net.file)} alt="" loading="lazy" />;
  else tile = <span className={cx("alogo-mono", kind === "card" && "card")}>{initials(bank ? bank.name : name)}</span>;
  return (
    <span className={cx("alogo", size === "lg" && "lg", size === "sm" && "sm", className)} aria-hidden>
      <span className="alogo-tile">{tile}</span>
      {net && (bank || kind !== "card") && <span className={cx("alogo-net", network === "amex" && "fill")}><img src={src(net.file)} alt="" /></span>}
    </span>
  );
}

/**
 * Several account icons overlapping (an item that goes through more than one bank or card).
 * logos: [{kind, logo, network, name}]; past `max`, the rest show as "+N".
 */
export function AccountLogos({ logos, max = 3, size = "md" }) {
  if (logos.length <= 1) return <AccountLogo {...(logos[0] || {})} size={size} />;
  const shown = logos.slice(0, logos.length > max ? max - 1 : max);
  const more = logos.length - shown.length;
  return (
    <span className={cx("alogos", size === "lg" && "lg")} aria-hidden title={logos.map((l) => l.name).filter(Boolean).join(", ")}>
      {shown.map((l, i) => <AccountLogo key={i} {...l} size={size} />)}
      {more > 0 && <span className={cx("alogo", size === "lg" && "lg")}><span className="alogo-tile alogo-more">+{more}</span></span>}
    </span>
  );
}
