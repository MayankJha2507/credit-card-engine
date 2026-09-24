/**
 * Deterministic parsers that turn the workbook's free-text cells into structured
 * raw facts. Nothing here derives a conclusion (no "effective rate", no "waived
 * for this user") — that is the calculation engine's job.
 *
 * Every parser returns `null` when it cannot confidently parse, so the import can
 * report it instead of inventing a value.
 */
import type { CapBasis, CapPeriod, RuleCap, SpendCategory } from './types';

const NA = /^(n\/?a|none|nil|not available|not applicable|needs verification|not available \/ needs verification|not recorded|-|—)$/i;

export function isBlank(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  const s = String(v).trim();
  return s === '' || NA.test(s);
}

export function text(v: unknown): string | null {
  if (isBlank(v)) return null;
  return String(v).trim();
}

/** "₹10,000,000 spend in previous anniversary year" -> 10000000 ; "12,500" -> 12500 */
export function parseMoney(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v);
  const lakhCrore = s.match(/₹?\s*([\d.,]+)\s*(lakhs?|lacs?|crores?|cr)\b/i);
  if (lakhCrore) {
    const n = Number(lakhCrore[1].replace(/,/g, ''));
    if (!Number.isFinite(n)) return null;
    return /cr/i.test(lakhCrore[2]) ? n * 1e7 : n * 1e5;
  }
  const m = s.match(/₹\s*([\d,]+(?:\.\d+)?)/) ?? s.match(/\b([\d,]{2,}(?:\.\d+)?)\b/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * "2.00%" -> 2 ; 3.5 -> 3.5 ; "0.99" -> 0.99 ; "0.00%" -> 0
 *
 * Percent columns are read as percentages whether or not the cell carries a "%".
 * A bare 0.99 means 0.99%, not 99% — rescaling small numbers would silently
 * misread the several cards that charge sub-1% forex.
 */
export function parsePercent(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (isBlank(s)) return null;
  const m = s.match(/(-?[\d.]+)\s*%/) ?? s.match(/^(-?[\d.]+)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function parseBoolean(v: unknown, truthy: RegExp = /^(yes|true|active|open)/i): boolean {
  if (isBlank(v)) return false;
  return truthy.test(String(v).trim());
}

/** Excel dates arrive as Date or "YYYY-MM-DD". Returns ISO date (YYYY-MM-DD). */
export function parseDate(v: unknown): string | null {
  if (isBlank(v)) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Category mapping                                                    */
/* ------------------------------------------------------------------ */

/**
 * Keyword -> canonical spend category. Used to map merchant and category names
 * written in the workbook onto the categories the questionnaire asks about.
 * These are SPECIFIC scopes only: a phrase like "all retail spends" is handled
 * by `isGeneralScope` instead, because "applies to everything" and "applies to
 * this category" mean very different things to the engine.
 */
const CATEGORY_KEYWORDS: Array<[RegExp, SpendCategory]> = [
  [/\binternational\b|\bintl\b|\bforeign\b|\boverseas\b|\bcross[- ]border\b/i, 'international'],
  [/\bflight|airline|air ticket|airfare|air mile|indigo|vistara|akasa|spicejet|air india/i, 'flights'],
  [/\bhotel|\bstay|accommodation|marriott|oyo|taj|itc|postcard|makemytrip|\bmmt\b|cleartrip|goibibo|ixigo|easemytrip|yatra/i, 'hotels'],
  [/\btravel\b|travel agenc|\bagencies\b|\birctc\b|\brailway|\bbus booking/i, 'flights'],
  [/\bdining\b|restaurant|\bfood\b|food delivery|swiggy|zomato|eazydiner|buffet|dineout|\bcafe\b/i, 'dining'],
  [/\bgrocer|departmental|dept\b|supermarket|bigbasket|blinkit|zepto|instamart|dmart|reliance fresh|more retail|spencer's|natures basket/i, 'groceries'],
  [/\bfuel\b|petrol|diesel|indianoil|indian oil|\bbpcl\b|\bhpcl\b|bharat petroleum|hindustan petroleum|\bshell\b/i, 'fuel'],
  [/\butilit|electricity|broadband|telecom|mobile bill|airtel bill|\bjio\b|insurance premium|bill payment/i, 'utilities'],
  [
    /\bonline\b|e-?commerce|smartbuy|\bupi\b|amazon|flipkart|myntra|nykaa|ajio|tata cliq|tata neu|marks & spencer|reliance digital|croma|vijay sales|shopping|bookmyshow|sony ?liv|netflix|hotstar|cult\.?fit|\buber\b|\bola\b|\bpvr\b|inox|movie|gen-?z merchant/i,
    'online',
  ],
  // Offline retail that is not one of the buckets above falls into "Other",
  // which is the catch-all the questionnaire offers.
  [/apparel|jewel|shoppers stop|lifestyle|pantaloons|westside|trent|furnish|electronics store|departmental store/i, 'other'],
];

/** Phrases that mean "this rate applies broadly", not to a named category. */
const GENERAL_SCOPE = /\ball (?:other )?(?:retail )?spends?\b|\ball purchases\b|\bevery spend\b|\bretail shopping\b|\ball categories\b|\boffline\b|\bother spends?\b|\ball transactions\b/i;

export function isGeneralScope(s: string | null): boolean {
  return s !== null && GENERAL_SCOPE.test(s);
}

/**
 * Extract the canonical categories referenced by a free-text phrase.
 * Returns [] when nothing recognisable is present (caller decides what that means).
 */
export function categoriesFromText(s: string | null): SpendCategory[] {
  if (!s) return [];
  const found = new Set<SpendCategory>();
  for (const [re, cat] of CATEGORY_KEYWORDS) if (re.test(s)) found.add(cat);
  return [...found];
}

/** Exclusion lists like "Fuel, Wallet, Cash advance, Rent, EMI". */
export function parseExclusions(s: string | null): { categories: SpendCategory[]; terms: string[] } {
  if (!s) return { categories: [], terms: [] };
  const terms = s
    .split(/[,;/]|\band\b/i)
    .map((t) => t.trim())
    .filter(Boolean);
  const categories = new Set<SpendCategory>();
  for (const t of terms) {
    if (/fuel|petrol|diesel/i.test(t)) categories.add('fuel');
    if (/utilit|electricity/i.test(t)) categories.add('utilities');
    // rent / wallet / cash / EMI / govt are not questionnaire categories; they are
    // recorded as terms so the UI can surface them as restrictions.
  }
  return { categories: [...categories], terms };
}

/* ------------------------------------------------------------------ */
/* Earn rates                                                          */
/* ------------------------------------------------------------------ */

export type EarnRate =
  | { kind: 'points'; points: number; perAmount: number; unitLabel: string }
  /** A point count with no spend increment stated, e.g. "15 RPs on Air India Tickets". */
  | { kind: 'points_unanchored'; points: number; unitLabel: string }
  | { kind: 'cashback'; percent: number }
  | { kind: 'multiplier'; multiplier: number };

/**
 * Words that mark a rewards currency. Issuers name theirs freely — RPs, EDGE
 * Points, InterMiles, NeuCoins, My Cash, ixigo Money — so we read whatever label
 * sits between the number and the spend increment and check it looks like one.
 */
const REWARD_UNIT = /point|rp\b|rps\b|mile|coin|cash|money|reward/i;

/**
 * Parses a single earn expression:
 *   "5 Reward Points per ₹150 spent"          -> points 5 per 150
 *   "18 Reward Points per ₹200 spent"         -> points 18 per 200
 *   "1% Cashback on all other retail spends"  -> cashback 1
 *   "5X RP on Marks & Spencer"                -> multiplier 5
 */
export function parseEarnRate(s: string | null): EarnRate | null {
  if (!s) return null;
  // Not earn rates: fee concessions and point-transfer ratios.
  if (/surcharge waiver|fee waiver|waiver of/i.test(s)) return null;
  if (/transfer ratio|:\s*1\b|\b1\s*:\s*\d/i.test(s)) return null;
  // "<n> <unit label> per|/ ₹<increment>" — the label is read, then sanity-checked.
  const pts = s.match(/([\d.]+)\s+([A-Za-z][A-Za-z\s'.]{0,24}?)\s*(?:per|\/)\s*₹\s*([\d,]+)/);
  if (pts && REWARD_UNIT.test(pts[2])) {
    const points = Number(pts[1]);
    const per = Number(pts[3].replace(/,/g, ''));
    if (Number.isFinite(points) && per > 0) {
      return { kind: 'points', points, perAmount: per, unitLabel: pts[2].trim() };
    }
  }
  const cb = s.match(/(?:up to\s*)?([\d.]+)\s*%\s*(?:unlimited\s*)?cashback/i);
  if (cb) {
    const percent = Number(cb[1]);
    if (Number.isFinite(percent)) return { kind: 'cashback', percent };
  }
  const mult = s.match(/\b([\d.]+)\s*X\b/i);
  if (mult) {
    const m = Number(mult[1]);
    if (Number.isFinite(m)) return { kind: 'multiplier', multiplier: m };
  }
  // Fallback for cashback clauses that omit the word "cashback",
  // e.g. "2% on Amazon Pay partner merchants" or "10% Valueback on IRCTC".
  const bare = s.match(/([\d.]+)\s*%/);
  if (bare) {
    const percent = Number(bare[1]);
    if (Number.isFinite(percent)) return { kind: 'cashback', percent };
  }

  // "<n> <unit label> on <something>" — a point count with no increment stated.
  // The caller anchors it to the card's base increment, or leaves it unresolved.
  const unanchored = s.match(/^\s*(?:up to\s+)?([\d.]+)\s+([A-Za-z][A-Za-z\s'.]{0,24}?)\s+(?:on|at|for)\b/i);
  if (unanchored && REWARD_UNIT.test(unanchored[2])) {
    const points = Number(unanchored[1]);
    if (Number.isFinite(points)) return { kind: 'points_unanchored', points, unitLabel: unanchored[2].trim() };
  }
  return null;
}

/**
 * A clause that states a multiplier AND an absolute rate pins down what "1X"
 * means for the card: "Up to 10X Rewards on SmartBuy (50 RPs / ₹150)" fixes
 * 1X at 5 RP per ₹150. Returns null when the clause does not do both.
 */
export function unitRateFromClause(clause: string | null): { points: number; perAmount: number } | null {
  if (!clause) return null;
  const mult = clause.match(/\b([\d.]+)\s*X\b/i);
  if (!mult) return null;
  const multiplier = Number(mult[1]);
  if (!Number.isFinite(multiplier) || multiplier <= 0) return null;
  const rate = parseEarnRate(clause);
  if (rate?.kind !== 'points') return null;
  return { points: rate.points / multiplier, perAmount: rate.perAmount };
}

/**
 * Accelerated cells often pack several clauses:
 *   "5% Cashback on Flipkart; 4% Cashback on preferred partners (Swiggy, Uber, PVR, Cleartrip)"
 * Split on ';' so each clause becomes its own rule with its own categories.
 */
export function splitClauses(s: string | null): string[] {
  if (!s) return [];
  return s
    // ';' always separates clauses; a comma does too when the next fragment
    // starts its own rate ("25% on Airtel Bills, 10% Swiggy/Zomato").
    .split(/;|(?<=\))\s+and\s+|,\s*(?=\d+(?:\.\d+)?\s*(?:%|X\b|RPs?\b|Free\b))/i)
    .map((c) => c.trim())
    .filter(Boolean);
}

/* ------------------------------------------------------------------ */
/* Caps                                                                */
/* ------------------------------------------------------------------ */

function capPeriod(s: string): CapPeriod | null {
  if (/per\s*day|\/\s*day|daily/i.test(s)) return 'day';
  if (/statement cycle|billing cycle|per statement|statement month/i.test(s)) return 'statement_month';
  if (/per month|\/\s*month|monthly|month\b/i.test(s)) return 'month';
  if (/per quarter|quarterly/i.test(s)) return 'quarter';
  if (/per year|annually|\/\s*year|annual/i.test(s)) return 'year';
  return null;
}

/**
 * "Max 15,000 RP/day on SmartBuy; 75,000 RP/month total accelerated"
 * "5% cashback capped at ₹1,000 per statement cycle"
 * "5 EDGE Miles tier capped at ₹2 Lakh spend/month"
 */
export function parseCaps(s: string | null): RuleCap[] {
  if (!s) return [];
  const caps: RuleCap[] = [];
  for (const clause of s.split(/;/).map((c) => c.trim()).filter(Boolean)) {
    const period = capPeriod(clause);
    if (!period) continue;

    let basis: CapBasis | null = null;
    let amount: number | null = null;

    const spend = clause.match(/₹?\s*([\d.,]+)\s*(lakh|lac|crore|cr)?\s*spend/i);
    const rupee = clause.match(/₹\s*([\d,]+(?:\.\d+)?)/);
    const points = clause.match(
      /([\d,]+)\s*(?:accelerated\s+|bonus\s+|total\s+)*(?:[A-Za-z]+\s+)?(?:rps?|reward\s+points?|points?|miles?|coins?|cashpoints?|tps?)\b/i,
    );

    if (spend) {
      basis = 'spend';
      amount = parseMoney(spend[0]);
    } else if (rupee) {
      basis = 'inr_value';
      amount = Number(rupee[1].replace(/,/g, ''));
    } else if (points) {
      basis = 'points';
      amount = Number(points[1].replace(/,/g, ''));
    }

    if (basis && amount !== null && Number.isFinite(amount)) {
      caps.push({ amount, basis, period, raw: clause });
    }
  }
  return caps;
}

/* ------------------------------------------------------------------ */
/* Redemption                                                          */
/* ------------------------------------------------------------------ */

export interface PointValue {
  /** Rupees per point used by the engine. */
  value: number;
  /** Set when the source states a range or several rates. */
  isRange: boolean;
  low: number;
  high: number;
}

/**
 * "1 RP = ₹1.00 (SmartBuy Flights/Hotels)"            -> 1.00, exact
 * "1 RP = ₹0.20 - ₹1.00 depending on category"        -> 0.20, range 0.20–1.00
 * "1 RP = ₹0.50 (Flights), 1 RP = ₹0.35 (Vouchers)"   -> 0.35, range 0.35–0.50
 * "1 EDGE Mile = 2 Partner Miles"                     -> null
 *
 * Where the source gives a range or several rates, the engine uses the LOWEST
 * stated value. That is a published number, not an estimate, and it keeps the
 * reward figure conservative instead of flattering the card. The range is
 * carried through so the UI can say which rate was used.
 *
 * A null result means the card's points cannot be monetised from verified data.
 * The engine then reports the rewards as unvalued rather than inventing a rate.
 */
export function parsePointValue(s: string | null): PointValue | null {
  if (!s) return null;
  const unit = /(?:rp|rps|reward points?|edge (?:mile|point)s?|travel points?|cashpoints?|neucoins?|points?|miles?)/i;
  const re = new RegExp(`1\\s*${unit.source}\\s*=\\s*₹\\s*([\\d.]+)(?:\\s*(?:-|–|to)\\s*₹?\\s*([\\d.]+))?`, 'gi');
  const found: number[] = [];
  for (const m of s.matchAll(re)) {
    for (const g of [m[1], m[2]]) {
      if (g === undefined) continue;
      const n = Number(g);
      if (Number.isFinite(n) && n > 0) found.push(n);
    }
  }
  if (found.length === 0) return null;
  const low = Math.min(...found);
  const high = Math.max(...found);
  return { value: low, isRange: low !== high, low, high };
}

/* ------------------------------------------------------------------ */
/* Lounge                                                              */
/* ------------------------------------------------------------------ */

/** Annual complimentary visit count. "Unlimited" -> Infinity, "None" -> 0. */
export function parseLoungeVisits(s: string | null): number | null {
  if (!s) return null;
  if (/unlimited/i.test(s)) return Number.POSITIVE_INFINITY;
  if (/^none\b|\bnot available\b|\bremoved\b/i.test(s.trim())) return 0;
  const perYear = s.match(/([\d,]+)\s*(?:complimentary\s*)?(?:domestic|international|lounge)?\s*(?:visits?|access(?:es)?)?\s*(?:per|\/)\s*(year|annum)/i);
  if (perYear) return Number(perYear[1].replace(/,/g, ''));
  const perQuarter = s.match(/([\d,]+)\s*(?:complimentary\s*)?(?:visits?|access(?:es)?)?\s*(?:per|\/)\s*quarter/i);
  if (perQuarter) {
    const inBrackets = s.match(/\((\d+)\s*\/\s*year\)/i);
    return inBrackets ? Number(inBrackets[1]) : Number(perQuarter[1].replace(/,/g, '')) * 4;
  }
  const bracketYear = s.match(/\((\d+)\s*\/\s*year\)/i);
  if (bracketYear) return Number(bracketYear[1]);
  const upTo = s.match(/up to\s*([\d,]+)\s*(?:domestic|international)?\s*lounge\s*visits/i);
  if (upTo) return Number(upTo[1].replace(/,/g, ''));
  const plain = s.match(/^([\d,]+)\s/);
  if (plain) return Number(plain[1].replace(/,/g, ''));
  return null;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, 'and')
    // "Power+" and "Power" are different cards; keep the suffix in the URL.
    .replace(/\+/g, ' plus ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
