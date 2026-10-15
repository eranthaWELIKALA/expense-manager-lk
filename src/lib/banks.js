/* Banks operating in Sri Lanka and card networks, for account logos.
   Logo files live in public/banks/. `file: null` = no logo yet; initials are shown instead.
   The logos are the banks' trademarks, used only to label the user's own accounts. */

export const BANKS = [
  { id: "amana", name: "Amana Bank", file: null, aliases: ["amana"] },
  { id: "boc", name: "Bank of Ceylon", file: "boc.png", aliases: ["bank of ceylon", "boc"] },
  { id: "bank-of-china", name: "Bank of China", file: null, aliases: ["bank of china"] },
  { id: "cargills", name: "Cargills Bank", file: null, aliases: ["cargills"] },
  { id: "citi", name: "Citibank", file: "citi.png", aliases: ["citibank", "citi"] },
  { id: "combank", name: "Commercial Bank", file: "combank.png", aliases: ["commercial bank", "commercial", "combank"] },
  { id: "deutsche", name: "Deutsche Bank", file: "deutsche.png", aliases: ["deutsche"] },
  { id: "dfcc", name: "DFCC Bank", file: "dfcc.png", aliases: ["dfcc"] },
  { id: "habib", name: "Habib Bank", file: "habib.png", aliases: ["habib", "hbl"] },
  { id: "hdfc", name: "HDFC Bank", file: "hdfc.png", aliases: ["hdfc"] },
  { id: "hnb", name: "HNB", file: "hnb.png", aliases: ["hatton national", "hnb"] },
  { id: "hsbc", name: "HSBC", file: null, aliases: ["hsbc"] },
  { id: "indian-bank", name: "Indian Bank", file: "indian-bank.png", aliases: ["indian bank"] },
  { id: "iob", name: "Indian Overseas Bank", file: "iob.png", aliases: ["indian overseas", "iob"] },
  { id: "lankaputhra", name: "Lankaputhra Development Bank", file: null, aliases: ["lankaputhra"] },
  { id: "mcb", name: "MCB Bank", file: "mcb.png", aliases: ["mcb"] },
  { id: "ndb", name: "NDB Bank", file: "ndb.png", aliases: ["national development bank", "ndb"] },
  { id: "ntb", name: "Nations Trust Bank", file: "ntb.png", aliases: ["nations trust", "ntb"] },
  { id: "nsb", name: "National Savings Bank", file: "nsb.png", aliases: ["national savings", "nsb"] },
  { id: "pabc", name: "Pan Asia Bank", file: "pabc.png", aliases: ["pan asia", "pabc"] },
  { id: "peoples", name: "People's Bank", file: "peoples.png", aliases: ["people's bank", "peoples bank", "people's", "peoples"] },
  { id: "rdb", name: "Pradeshiya Sanwardhana Bank", file: "rdb.png", aliases: ["pradeshiya", "rdb", "psb"] },
  { id: "public-bank", name: "Public Bank", file: null, aliases: ["public bank"] },
  { id: "sampath", name: "Sampath Bank", file: "sampath.png", aliases: ["sampath"] },
  { id: "sdb", name: "SDB Bank", file: "sdb.png", aliases: ["sanasa", "sdb"] },
  { id: "seylan", name: "Seylan Bank", file: "seylan.png", aliases: ["seylan"] },
  { id: "smib", name: "State Mortgage & Investment Bank", file: "smib.png", aliases: ["state mortgage", "smib"] },
  { id: "scb", name: "Standard Chartered", file: "scb.png", aliases: ["standard chartered", "stanchart", "scb"] },
  { id: "sbi", name: "State Bank of India", file: null, aliases: ["state bank of india", "sbi"] },
  { id: "union", name: "Union Bank", file: "union.png", aliases: ["union bank", "ubc"] },
];

export const NETWORKS = [
  { id: "visa", name: "Visa", file: "visa.png", aliases: ["visa"] },
  { id: "mastercard", name: "Mastercard", file: "mastercard.png", aliases: ["mastercard", "master card", "master"] },
  { id: "amex", name: "American Express", file: "amex.png", aliases: ["american express", "amex"] },
  { id: "unionpay", name: "UnionPay", file: "unionpay.png", aliases: ["unionpay", "union pay"] },
];

const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
const BANK_BY_ID = byId(BANKS);
const NETWORK_BY_ID = byId(NETWORKS);

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/* Longest alias first, so "indian overseas" wins over "indian bank" and "union pay" over "union bank". */
const matcher = (list) => list
  .flatMap((x) => x.aliases.map((a) => ({ id: x.id, re: new RegExp("(^|[^a-z])" + esc(a) + "($|[^a-z])", "i"), len: a.length })))
  .sort((a, b) => b.len - a.len);
const BANK_MATCH = matcher(BANKS);
const NETWORK_MATCH = matcher(NETWORKS);

const guess = (rules, name) => (rules.find((r) => r.re.test(String(name || ""))) || {}).id || "";

/** Best guess of a bank from an account or card name ("Sampath Mastercard" → "sampath"). */
export const guessBank = (name) => guess(BANK_MATCH, String(name || "").replace(/union\s*pay/gi, ""));
/** Card network from a card name ("HNB Visa" → "visa"). */
export const guessNetwork = (name) => guess(NETWORK_MATCH, name);

export const bankInfo = (id) => BANK_BY_ID[id] || null;
export const networkInfo = (id) => NETWORK_BY_ID[id] || null;

/** "none" turns the logo off; "" (unset) means guess from the name. */
export const NO_LOGO = "none";

/** Which catalog bank a bank account shows. */
export function bankLogoId(bank) {
  if (!bank) return "";
  if (bank.logo === NO_LOGO) return "";
  return bankInfo(bank.logo) ? bank.logo : guessBank(bank.name);
}

/**
 * A card's issuer and network: explicit choice, else guessed from its name,
 * else (issuer only) the logo of the bank its bill is paid from.
 */
export function cardLogoIds(plan, card) {
  if (!card) return { issuer: "", network: "" };
  const network = networkInfo(card.network) ? card.network : card.network === NO_LOGO ? "" : guessNetwork(card.name);
  let issuer = "";
  if (card.issuer !== NO_LOGO) {
    issuer = bankInfo(card.issuer) ? card.issuer : guessBank(card.name);
    if (!issuer) issuer = bankLogoId((plan?.banks || []).find((b) => b.id === card.bank));
  }
  return { issuer, network };
}

/** Logo props for an account of any kind: {logo, network, kind}. */
export function accountLogo(plan, kind, obj) {
  if (kind === "card") { const c = cardLogoIds(plan, obj); return { kind, logo: c.issuer, network: c.network }; }
  if (kind === "bank") return { kind, logo: bankLogoId(obj), network: "" };
  return { kind, logo: "", network: "" };
}

/** Logo props for an item's payment method ({kind, id}). */
export function viaLogo(plan, via) {
  if (!via) return { kind: "bank", logo: "", network: "" };
  const list = via.kind === "card" ? plan.cards : via.kind === "cash" ? plan.wallets : plan.banks;
  return accountLogo(plan, via.kind === "cash" ? "cash" : via.kind, (list || []).find((x) => x.id === via.id));
}
