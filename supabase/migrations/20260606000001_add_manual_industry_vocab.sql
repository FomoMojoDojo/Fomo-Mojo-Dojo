ALTER TABLE companies
  ADD COLUMN manual_industry_vocab text[] NOT NULL DEFAULT '{}';
