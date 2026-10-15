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
