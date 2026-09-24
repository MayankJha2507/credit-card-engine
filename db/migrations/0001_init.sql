-- Core schema. Raw facts only; all derived values are computed at request time.

create table if not exists cards (
  id                            text primary key,
  slug                          text not null,
  issuer                        text not null,
  issuer_slug                   text not null,
  name                          text not null,
  network                       text,
  variant                       text,
  card_type                     text,
  active_status                 boolean not null default true,
  application_available         boolean not null default true,
  joining_fee                   numeric,
  annual_fee                    numeric,
  annual_fee_waiver_threshold   numeric,
  annual_fee_waiver_condition   text,
  forex_markup                  numeric,
  dcc_markup                    text,
  domestic_lounge               text,
  international_lounge          text,
  lounge_program                text,
  domestic_lounge_visits        numeric,
  international_lounge_visits   numeric,
  lounge_spend_condition        text,
  base_reward_rate_raw          text,
  accelerated_rate_raw          text,
  reward_caps_raw               text,
  reward_exclusions_raw         text,
  redemption_ratio_raw          text,
  redemption_options            text,
  cashback_rate_raw             text,
  welcome_benefit               text,
  milestone_benefits            text,
  travel_benefits               text,
  dining_benefits               text,
  other_benefits                text,
  eligibility                   text,
  minimum_income                numeric,
  age_limit                     text,
  relationship_requirement      text,
  credit_score_requirement      text,
  data_confidence               text,
  research_status               text,
  last_verified_at              date,
  notes                         text,
  updated_at                    timestamptz not null default now(),
  unique (issuer_slug, slug)
);

create table if not exists sources (
  id               text primary key,
  card_id          text not null references cards(id) on delete cascade,
  source_type      text not null,
  source_url       text not null,
  source_title     text,
  fields_covered   text[] not null default '{}',
  accessed_at      date,
  reliability_tier text
);

create table if not exists card_rules (
  id          text primary key,
  card_id     text not null references cards(id) on delete cascade,
  rule_type   text not null,
  categories  text[] not null default '{}',
  value       numeric,
  unit        text,
  per_amount  numeric,
  condition   text,
  cap         jsonb,
  notes       text,
  source_id   text references sources(id) on delete set null,
  raw         text not null
);

create index if not exists card_rules_card_id_idx on card_rules(card_id);
create index if not exists sources_card_id_idx on sources(card_id);
create index if not exists cards_issuer_idx on cards(issuer_slug);

-- Import audit trail: makes "did the recommendation change because data changed?" answerable.
create table if not exists import_runs (
  id          bigserial primary key,
  started_at  timestamptz not null default now(),
  workbook    text not null,
  card_count  integer not null,
  rule_count  integer not null,
  warnings    integer not null default 0,
  checksum    text not null
);
