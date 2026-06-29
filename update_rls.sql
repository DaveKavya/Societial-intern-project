-- Fix RLS policies for audit_logs and other tables

-- Drop existing restrictive policies if they exist
DROP POLICY IF EXISTS nx4_al ON audit_logs;
DROP POLICY IF EXISTS nx4_no ON notifications;
DROP POLICY IF EXISTS nx4_emp ON employees;
DROP POLICY IF EXISTS nx4_sk ON skills;
DROP POLICY IF EXISTS nx4_es ON employee_skills;
DROP POLICY IF EXISTS nx4_pr ON projects;
DROP POLICY IF EXISTS nx4_as ON assignments;
DROP POLICY IF EXISTS nx4_me ON mentorships;

-- Create permissive policies for all tables (allow all operations for all users)
CREATE POLICY audit_logs_all ON audit_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY notifications_all ON notifications FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY employees_all ON employees FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY skills_all ON skills FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY employee_skills_all ON employee_skills FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY projects_all ON projects FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY assignments_all ON assignments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY mentorships_all ON mentorships FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
