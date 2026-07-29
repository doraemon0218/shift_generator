-- Phase 1: スタッフマスタ + 認証

CREATE TABLE IF NOT EXISTS nurses (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  employee_id VARCHAR(50) UNIQUE,
  work_type VARCHAR(20) NOT NULL CHECK (work_type IN ('day_only', 'day_late', 'full')),
  skill_level VARCHAR(20) NOT NULL CHECK (skill_level IN ('trainee', 'half', 'skilled')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'nurse')),
  nurse_id INTEGER REFERENCES nurses(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 夜勤禁忌ペア（順序不問で一意）
CREATE TABLE IF NOT EXISTS forbidden_pairs (
  id SERIAL PRIMARY KEY,
  nurse_a_id INTEGER NOT NULL REFERENCES nurses(id) ON DELETE CASCADE,
  nurse_b_id INTEGER NOT NULL REFERENCES nurses(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  CHECK (nurse_a_id <> nurse_b_id),
  CHECK (nurse_a_id < nurse_b_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS forbidden_pairs_unique ON forbidden_pairs (LEAST(nurse_a_id, nurse_b_id), GREATEST(nurse_a_id, nurse_b_id));

-- Phase 3用: 月別スタッフィング設定
CREATE TABLE IF NOT EXISTS shift_configs (
  id SERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  -- 曜日別必要人数 (0=日曜 ... 6=土曜)
  day_counts INTEGER[7] NOT NULL DEFAULT '{6,6,6,6,6,5,5}',
  late_counts INTEGER[7] NOT NULL DEFAULT '{2,2,1,2,1,0,0}',
  night_count INTEGER NOT NULL DEFAULT 2,
  max_off_days INTEGER,  -- 1人あたり公休希望上限（自動計算値）
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (year, month)
);

-- Phase 3用: 看護師シフト希望
CREATE TABLE IF NOT EXISTS shift_preferences (
  id SERIAL PRIMARY KEY,
  nurse_id INTEGER NOT NULL REFERENCES nurses(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  date DATE NOT NULL,
  preference VARCHAR(30) NOT NULL CHECK (preference IN (
    'available',      -- 希望なし（終日可）
    'off_request',    -- 公休希望
    'no_day',         -- 日勤不可
    'no_late',        -- 遅出不可
    'no_night',       -- 夜勤不可
    'night_wish'      -- 夜勤希望日
  )),
  note TEXT,
  is_submitted BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (nurse_id, date)
);

-- Phase 4用: 生成済みシフト
CREATE TABLE IF NOT EXISTS generated_shifts (
  id SERIAL PRIMARY KEY,
  nurse_id INTEGER NOT NULL REFERENCES nurses(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  date DATE NOT NULL,
  shift_type VARCHAR(20) NOT NULL CHECK (shift_type IN (
    'day', 'late', 'night', 'off', 'holiday', 'after_night'
  )),
  is_manually_adjusted BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (nurse_id, date)
);

-- 夜勤ペア設定（○=制限なし / ×=禁忌 / △=要注意、永続保存）
CREATE TABLE IF NOT EXISTS nurse_pair_settings (
  id SERIAL PRIMARY KEY,
  nurse_a_id INTEGER NOT NULL REFERENCES nurses(id) ON DELETE CASCADE,
  nurse_b_id INTEGER NOT NULL REFERENCES nurses(id) ON DELETE CASCADE,
  status VARCHAR(10) NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'forbidden', 'caution')),
  reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (nurse_a_id, nurse_b_id),
  CHECK (nurse_a_id <> nurse_b_id),
  CHECK (nurse_a_id < nurse_b_id)
);

DROP TRIGGER IF EXISTS nurse_pair_settings_updated_at ON nurse_pair_settings;
CREATE TRIGGER nurse_pair_settings_updated_at
  BEFORE UPDATE ON nurse_pair_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- システム設定（key-value、deadline_day など）
CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- preference の CHECK 制約を新値に更新（late_wish / paid_leave 追加）
DO $$
BEGIN
  ALTER TABLE shift_preferences DROP CONSTRAINT IF EXISTS shift_preferences_preference_check;
  ALTER TABLE shift_preferences ADD CONSTRAINT shift_preferences_preference_check
    CHECK (preference IN (
      'available', 'off_request', 'no_day', 'no_late', 'no_night',
      'night_wish', 'late_wish', 'paid_leave'
    ));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'constraint update skipped: %', SQLERRM;
END $$;

-- 提出タイミング記録（早期提出ランキング用）
CREATE TABLE IF NOT EXISTS preference_submissions (
  id SERIAL PRIMARY KEY,
  nurse_id INTEGER NOT NULL REFERENCES nurses(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deadline_date TIMESTAMP,
  days_early NUMERIC(7,2),
  UNIQUE (nurse_id, year, month)
);

-- Phase 4用: 累積実績（月締め後に記録）
CREATE TABLE IF NOT EXISTS nurse_monthly_stats (
  id SERIAL PRIMARY KEY,
  nurse_id INTEGER NOT NULL REFERENCES nurses(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  night_count INTEGER DEFAULT 0,
  weekend_count INTEGER DEFAULT 0,
  substitute_count INTEGER DEFAULT 0,
  off_days INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (nurse_id, year, month)
);

-- 更新日時の自動更新
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS nurses_updated_at ON nurses;
CREATE TRIGGER nurses_updated_at
  BEFORE UPDATE ON nurses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS shift_configs_updated_at ON shift_configs;
CREATE TRIGGER shift_configs_updated_at
  BEFORE UPDATE ON shift_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS shift_preferences_updated_at ON shift_preferences;
CREATE TRIGGER shift_preferences_updated_at
  BEFORE UPDATE ON shift_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
