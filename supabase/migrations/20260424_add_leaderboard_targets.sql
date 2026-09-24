CREATE TABLE IF NOT EXISTS class_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_name VARCHAR(255) NOT NULL,
  month VARCHAR(7) NOT NULL,
  target_sessions INT DEFAULT 0,
  UNIQUE(class_name, month)
);

CREATE TABLE IF NOT EXISTS category_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_name VARCHAR(255) NOT NULL,
  month VARCHAR(7) NOT NULL,
  target_sessions INT DEFAULT 0,
  UNIQUE(category_name, month)
);
