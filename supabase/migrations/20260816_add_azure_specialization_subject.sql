-- Migration to add Azure (Specialization) subject to subjects table
INSERT INTO subjects (name, description)
VALUES ('Azure (Specialization)', 'Azure Specialization Subject')
ON CONFLICT (name) DO NOTHING;
