import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
import { createClient } from "jsr:@supabase/supabase-js@2";

const app = new Hono();
app.use("*", logger(console.log));
app.use("/*", cors({ origin: "*", allowHeaders: ["Content-Type", "Authorization", "apikey"], allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], exposeHeaders: ["Content-Length"], maxAge: 600 }));
app.get("/health", (c) => c.json({ status: "ok", version: "4.0", table: "employees" }));

const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// ── DDL: employees table + proficiency 1-3 (Beginner=1, Intermediate=2, Expert=3) ──
const SETUP_SQL = `
-- Rename users → employees (safe migration)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='users' AND table_schema='public')
  AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='employees' AND table_schema='public') THEN
    ALTER TABLE users RENAME TO employees;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee',
  department TEXT NOT NULL DEFAULT 'Unknown',
  title TEXT NOT NULL,
  location TEXT,
  phone TEXT,
  avatar_initials TEXT NOT NULL DEFAULT 'U',
  available BOOLEAN DEFAULT true,
  utilization INTEGER DEFAULT 0 CHECK (utilization BETWEEN 0 AND 100),
  experience_years INTEGER DEFAULT 0,
  rating DECIMAL(3,1) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  proficiency_level INTEGER NOT NULL DEFAULT 1 CHECK (proficiency_level BETWEEN 1 AND 3),
  years_experience INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, skill_id)
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'planning',
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, project_id)
);

CREATE TABLE IF NOT EXISTS mentorships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  mentee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  goals TEXT[],
  progress_percentage INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(mentor_id, mentee_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  severity TEXT NOT NULL DEFAULT 'INFO',
  user_email TEXT NOT NULL,
  action TEXT NOT NULL,
  ip_address TEXT,
  module TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'info',
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Migrations for existing installs (safe to run multiple times)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS avatar_initials TEXT NOT NULL DEFAULT 'U';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS utilization INTEGER DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS experience_years INTEGER DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS rating DECIMAL(3,1) DEFAULT 0;

-- Rename user_id → employee_id in employee_skills (migration)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employee_skills' AND column_name='user_id' AND table_schema='public') THEN
    ALTER TABLE employee_skills RENAME COLUMN user_id TO employee_id;
  END IF;
END $$;

-- Rename user_id → employee_id in assignments (migration)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assignments' AND column_name='user_id' AND table_schema='public') THEN
    ALTER TABLE assignments RENAME COLUMN user_id TO employee_id;
  END IF;
END $$;

-- Update proficiency constraint to 1-3 scale (Expert=3, Intermediate=2, Beginner=1)
ALTER TABLE employee_skills DROP CONSTRAINT IF EXISTS employee_skills_proficiency_level_check;
ALTER TABLE employee_skills ADD CONSTRAINT employee_skills_proficiency_level_check CHECK (proficiency_level BETWEEN 1 AND 3);
UPDATE employee_skills SET proficiency_level = CASE WHEN proficiency_level >= 4 THEN 3 WHEN proficiency_level = 3 THEN 2 ELSE 1 END WHERE proficiency_level > 3 OR proficiency_level NOT IN (1,2,3);

-- RLS
ALTER TABLE employees   ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills      ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects    ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentorships ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='employees'      AND policyname='nx4_emp')    THEN CREATE POLICY nx4_emp    ON employees      FOR ALL TO anon,authenticated USING(true) WITH CHECK(true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='skills'         AND policyname='nx4_sk')     THEN CREATE POLICY nx4_sk     ON skills         FOR ALL TO anon,authenticated USING(true) WITH CHECK(true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='employee_skills' AND policyname='nx4_es')    THEN CREATE POLICY nx4_es     ON employee_skills FOR ALL TO anon,authenticated USING(true) WITH CHECK(true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='projects'       AND policyname='nx4_pr')     THEN CREATE POLICY nx4_pr     ON projects        FOR ALL TO anon,authenticated USING(true) WITH CHECK(true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='assignments'    AND policyname='nx4_as')     THEN CREATE POLICY nx4_as     ON assignments      FOR ALL TO anon,authenticated USING(true) WITH CHECK(true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='mentorships'    AND policyname='nx4_me')     THEN CREATE POLICY nx4_me     ON mentorships      FOR ALL TO anon,authenticated USING(true) WITH CHECK(true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='audit_logs'     AND policyname='nx4_al')     THEN CREATE POLICY nx4_al     ON audit_logs       FOR ALL TO anon,authenticated USING(true) WITH CHECK(true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notifications'  AND policyname='nx4_no')     THEN CREATE POLICY nx4_no     ON notifications     FOR ALL TO anon,authenticated USING(true) WITH CHECK(true); END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_es_employee   ON employee_skills(employee_id);
CREATE INDEX IF NOT EXISTS idx_es_skill      ON employee_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_asgn_emp      ON assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_asgn_proj     ON assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_mentor_mentor ON mentorships(mentor_id);
CREATE INDEX IF NOT EXISTS idx_mentor_mentee ON mentorships(mentee_id);
CREATE INDEX IF NOT EXISTS idx_audit_ts      ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_ts      ON notifications(created_at DESC);
`;

// ── Seed data with 1-3 proficiency (Expert=3, Intermediate=2, Beginner=1) ────
async function seedDatabase(db: ReturnType<typeof admin>) {
  const { data: skillRows } = await db.from("skills").insert([
    { name: "React",               category: "Frontend Development" },
    { name: "TypeScript",          category: "Frontend Development" },
    { name: "Node.js",             category: "Backend Development" },
    { name: "AWS",                 category: "Cloud & DevOps" },
    { name: "Python",              category: "Data Science & ML" },
    { name: "Machine Learning",    category: "Data Science & ML" },
    { name: "SQL",                 category: "Data Science & ML" },
    { name: "Figma",               category: "Design & UX" },
    { name: "UX Research",         category: "Design & UX" },
    { name: "Kubernetes",          category: "Cloud & DevOps" },
    { name: "Terraform",           category: "Cloud & DevOps" },
    { name: "Docker",              category: "Cloud & DevOps" },
    { name: "CI/CD",               category: "Cloud & DevOps" },
    { name: "Agile",               category: "Project Management" },
    { name: "Go",                  category: "Backend Development" },
    { name: "PostgreSQL",          category: "Backend Development" },
    { name: "GraphQL",             category: "Backend Development" },
    { name: "PyTorch",             category: "Data Science & ML" },
    { name: "Selenium",            category: "Quality Assurance" },
    { name: "Jest",                category: "Quality Assurance" },
    { name: "SIEM",                category: "Security & Compliance" },
    { name: "Penetration Testing", category: "Security & Compliance" },
    { name: "Compliance",          category: "Security & Compliance" },
    { name: "Vue.js",              category: "Frontend Development" },
    { name: "Azure",               category: "Cloud & DevOps" },
  ]).select();

  if (!skillRows?.length) throw new Error("Skills seed failed");
  const sm: Record<string, string> = {};
  for (const s of skillRows) sm[s.name] = s.id;

  const { data: empRows } = await db.from("employees").insert([
    { name: "Sarah Chen",      email: "s.chen@nexus.corp",     role: "employee",        department: "Engineering",     title: "Senior Software Engineer",   location: "San Francisco, CA", phone: "+1 (415) 555-0142", avatar_initials: "SC", available: true,  utilization: 0,   experience_years: 7, rating: 4.9 },
    { name: "Marcus Williams", email: "m.williams@nexus.corp",  role: "employee",        department: "Data & Analytics",title: "Data Scientist",             location: "New York, NY",      phone: "+1 (212) 555-0198", avatar_initials: "MW", available: false, utilization: 100, experience_years: 5, rating: 4.7 },
    { name: "Priya Patel",     email: "p.patel@nexus.corp",    role: "employee",        department: "Design",          title: "UX Designer",                location: "Austin, TX",        phone: "+1 (512) 555-0267", avatar_initials: "PP", available: true,  utilization: 0,   experience_years: 4, rating: 4.8 },
    { name: "James O'Brien",   email: "j.obrien@nexus.corp",   role: "employee",        department: "Infrastructure",  title: "DevOps Engineer",            location: "Chicago, IL",       phone: "+1 (312) 555-0334", avatar_initials: "JO", available: false, utilization: 100, experience_years: 6, rating: 4.6 },
    { name: "Aisha Mohammed",  email: "a.mohammed@nexus.corp", role: "hr_manager",      department: "Product",         title: "Product Manager",            location: "Seattle, WA",       phone: "+1 (206) 555-0421", avatar_initials: "AM", available: true,  utilization: 0,   experience_years: 8, rating: 4.9 },
    { name: "Daniel Park",     email: "d.park@nexus.corp",     role: "employee",        department: "Engineering",     title: "Backend Engineer",           location: "San Francisco, CA", phone: "+1 (415) 555-0518", avatar_initials: "DP", available: true,  utilization: 0,   experience_years: 3, rating: 4.5 },
    { name: "Lisa Huang",      email: "l.huang@nexus.corp",    role: "employee",        department: "Data & Analytics",title: "ML Engineer",                location: "Boston, MA",        phone: "+1 (617) 555-0612", avatar_initials: "LH", available: false, utilization: 100, experience_years: 5, rating: 4.8 },
    { name: "Carlos Rivera",   email: "c.rivera@nexus.corp",   role: "employee",        department: "Quality",         title: "QA Engineer",                location: "Miami, FL",         phone: "+1 (305) 555-0709", avatar_initials: "CR", available: true,  utilization: 0,   experience_years: 4, rating: 4.4 },
    { name: "Nina Okafor",     email: "n.okafor@nexus.corp",   role: "center_manager",  department: "Security",        title: "Security Analyst",           location: "Washington, DC",    phone: "+1 (202) 555-0803", avatar_initials: "NO", available: true,  utilization: 0,   experience_years: 6, rating: 4.7 },
    { name: "Tom Bergmann",    email: "t.bergmann@nexus.corp", role: "employee",        department: "Engineering",     title: "Full Stack Engineer",        location: "Denver, CO",        phone: "+1 (720) 555-0997", avatar_initials: "TB", available: false, utilization: 100, experience_years: 5, rating: 4.6 },
    { name: "Elena Vasquez",   email: "e.vasquez@nexus.corp",  role: "employee",        department: "Infrastructure",  title: "Cloud Architect",            location: "San Jose, CA",      phone: "+1 (408) 555-0145", avatar_initials: "EV", available: true,  utilization: 0,   experience_years: 9, rating: 4.9 },
    { name: "Kevin Liu",       email: "k.liu@nexus.corp",      role: "employee",        department: "Engineering",     title: "Frontend Engineer",          location: "Portland, OR",      phone: "+1 (503) 555-0234", avatar_initials: "KL", available: false, utilization: 100, experience_years: 3, rating: 4.3 },
    { name: "Raj Mehta",       email: "r.mehta@nexus.corp",    role: "intern",          department: "Engineering",     title: "Software Engineering Intern",location: "San Francisco, CA", phone: "+1 (415) 555-0901", avatar_initials: "RM", available: true,  utilization: 0,   experience_years: 0, rating: 4.2 },
    { name: "HR Administrator",email: "admin@nexus.corp",       role: "admin",           department: "HR",              title: "System Administrator",       location: "San Francisco, CA", phone: "+1 (415) 555-0001", avatar_initials: "HR", available: true,  utilization: 0,   experience_years: 10,rating: 5.0 },
  ]).select();

  if (!empRows?.length) throw new Error("Employees seed failed");
  const em: Record<string, string> = {};
  for (const e of empRows) em[e.name] = e.id;

  // Proficiency: Expert=3, Intermediate=2, Beginner=1
  await db.from("employee_skills").insert([
    { employee_id: em["Sarah Chen"],      skill_id: sm["React"],               proficiency_level: 3, years_experience: 6 },
    { employee_id: em["Sarah Chen"],      skill_id: sm["TypeScript"],          proficiency_level: 3, years_experience: 5 },
    { employee_id: em["Sarah Chen"],      skill_id: sm["Node.js"],             proficiency_level: 2, years_experience: 4 },
    { employee_id: em["Sarah Chen"],      skill_id: sm["AWS"],                 proficiency_level: 2, years_experience: 3 },
    { employee_id: em["Marcus Williams"], skill_id: sm["Python"],              proficiency_level: 3, years_experience: 5 },
    { employee_id: em["Marcus Williams"], skill_id: sm["Machine Learning"],    proficiency_level: 3, years_experience: 4 },
    { employee_id: em["Marcus Williams"], skill_id: sm["SQL"],                 proficiency_level: 3, years_experience: 5 },
    { employee_id: em["Marcus Williams"], skill_id: sm["PyTorch"],             proficiency_level: 2, years_experience: 3 },
    { employee_id: em["Priya Patel"],     skill_id: sm["Figma"],               proficiency_level: 3, years_experience: 4 },
    { employee_id: em["Priya Patel"],     skill_id: sm["UX Research"],         proficiency_level: 3, years_experience: 4 },
    { employee_id: em["Priya Patel"],     skill_id: sm["TypeScript"],          proficiency_level: 1, years_experience: 1 },
    { employee_id: em["James O'Brien"],   skill_id: sm["Kubernetes"],          proficiency_level: 3, years_experience: 6 },
    { employee_id: em["James O'Brien"],   skill_id: sm["Terraform"],           proficiency_level: 3, years_experience: 5 },
    { employee_id: em["James O'Brien"],   skill_id: sm["CI/CD"],               proficiency_level: 3, years_experience: 5 },
    { employee_id: em["James O'Brien"],   skill_id: sm["AWS"],                 proficiency_level: 3, years_experience: 4 },
    { employee_id: em["James O'Brien"],   skill_id: sm["Docker"],              proficiency_level: 3, years_experience: 5 },
    { employee_id: em["Aisha Mohammed"],  skill_id: sm["Agile"],               proficiency_level: 3, years_experience: 8 },
    { employee_id: em["Aisha Mohammed"],  skill_id: sm["SQL"],                 proficiency_level: 2, years_experience: 4 },
    { employee_id: em["Daniel Park"],     skill_id: sm["Go"],                  proficiency_level: 2, years_experience: 3 },
    { employee_id: em["Daniel Park"],     skill_id: sm["PostgreSQL"],          proficiency_level: 2, years_experience: 3 },
    { employee_id: em["Daniel Park"],     skill_id: sm["Node.js"],             proficiency_level: 2, years_experience: 2 },
    { employee_id: em["Lisa Huang"],      skill_id: sm["PyTorch"],             proficiency_level: 3, years_experience: 5 },
    { employee_id: em["Lisa Huang"],      skill_id: sm["Machine Learning"],    proficiency_level: 3, years_experience: 5 },
    { employee_id: em["Lisa Huang"],      skill_id: sm["Python"],              proficiency_level: 3, years_experience: 5 },
    { employee_id: em["Lisa Huang"],      skill_id: sm["SQL"],                 proficiency_level: 2, years_experience: 3 },
    { employee_id: em["Carlos Rivera"],   skill_id: sm["Selenium"],            proficiency_level: 2, years_experience: 4 },
    { employee_id: em["Carlos Rivera"],   skill_id: sm["Jest"],                proficiency_level: 2, years_experience: 3 },
    { employee_id: em["Nina Okafor"],     skill_id: sm["SIEM"],                proficiency_level: 3, years_experience: 6 },
    { employee_id: em["Nina Okafor"],     skill_id: sm["Penetration Testing"], proficiency_level: 2, years_experience: 5 },
    { employee_id: em["Nina Okafor"],     skill_id: sm["Compliance"],          proficiency_level: 3, years_experience: 4 },
    { employee_id: em["Tom Bergmann"],    skill_id: sm["React"],               proficiency_level: 2, years_experience: 5 },
    { employee_id: em["Tom Bergmann"],    skill_id: sm["Python"],              proficiency_level: 2, years_experience: 4 },
    { employee_id: em["Tom Bergmann"],    skill_id: sm["Docker"],              proficiency_level: 2, years_experience: 4 },
    { employee_id: em["Tom Bergmann"],    skill_id: sm["GraphQL"],             proficiency_level: 2, years_experience: 3 },
    { employee_id: em["Elena Vasquez"],   skill_id: sm["Azure"],               proficiency_level: 3, years_experience: 9 },
    { employee_id: em["Elena Vasquez"],   skill_id: sm["AWS"],                 proficiency_level: 3, years_experience: 7 },
    { employee_id: em["Elena Vasquez"],   skill_id: sm["Kubernetes"],          proficiency_level: 3, years_experience: 6 },
    { employee_id: em["Elena Vasquez"],   skill_id: sm["Terraform"],           proficiency_level: 3, years_experience: 8 },
    { employee_id: em["Kevin Liu"],       skill_id: sm["Vue.js"],              proficiency_level: 2, years_experience: 3 },
    { employee_id: em["Kevin Liu"],       skill_id: sm["TypeScript"],          proficiency_level: 2, years_experience: 2 },
    { employee_id: em["Kevin Liu"],       skill_id: sm["React"],               proficiency_level: 1, years_experience: 1 },
    { employee_id: em["Raj Mehta"],       skill_id: sm["React"],               proficiency_level: 1, years_experience: 0 },
    { employee_id: em["Raj Mehta"],       skill_id: sm["TypeScript"],          proficiency_level: 1, years_experience: 0 },
    { employee_id: em["Raj Mehta"],       skill_id: sm["Node.js"],             proficiency_level: 1, years_experience: 0 },
  ].filter(r => r.employee_id && r.skill_id));

  const { data: projRows } = await db.from("projects").insert([
    { name: "Project Nexus — Phase 2",  description: "Enterprise dashboard modernization",             status: "active",    start_date: "2026-07-01" },
    { name: "Project Orion",            description: "Cloud infrastructure migration to AWS",          status: "active",    start_date: "2026-05-15" },
    { name: "Project Atlas",            description: "Data platform consolidation & ML pipelines",     status: "planning",  start_date: "2026-08-01" },
    { name: "API Gateway Migration",    description: "Legacy REST APIs migrated to GraphQL",           status: "completed", start_date: "2026-01-08", end_date: "2026-03-10" },
  ]).select();

  const pm: Record<string, string> = {};
  for (const p of projRows ?? []) pm[p.name] = p.id;

  await db.from("assignments").insert([
    { employee_id: em["Tom Bergmann"],  project_id: pm["Project Orion"],           role: "Full Stack Engineer", start_date: "2026-05-15", status: "active" },
    { employee_id: em["James O'Brien"], project_id: pm["Project Orion"],           role: "DevOps Lead",          start_date: "2026-05-15", status: "active" },
    { employee_id: em["Marcus Williams"],project_id: pm["Project Atlas"],          role: "Data Science Lead",    start_date: "2026-08-01", status: "upcoming" },
    { employee_id: em["Lisa Huang"],    project_id: pm["Project Atlas"],           role: "ML Engineer",          start_date: "2026-08-01", status: "upcoming" },
    { employee_id: em["Kevin Liu"],     project_id: pm["Project Nexus — Phase 2"], role: "Frontend Engineer",    start_date: "2026-07-01", status: "upcoming" },
  ].filter(r => r.employee_id && r.project_id));

  await db.from("mentorships").insert([
    { mentor_id: em["Sarah Chen"], mentee_id: em["Raj Mehta"], status: "active", goals: ["Master React", "Build first production component", "Code review practice"], progress_percentage: 45 },
  ].filter(r => r.mentor_id && r.mentee_id));

  const now = new Date();
  await db.from("audit_logs").insert([
    { severity: "INFO",     user_email: "admin@nexus.corp",     action: "User signed in successfully",                              ip_address: "web-client", module: "Auth",      created_at: new Date(now.getTime() - 2  * 60000).toISOString() },
    { severity: "CRITICAL", user_email: "admin@nexus.corp",     action: "Bulk permission export triggered — IAM module",            ip_address: "192.168.1.104", module: "IAM",   created_at: new Date(now.getTime() - 5  * 60000).toISOString() },
    { severity: "WARNING",  user_email: "j.obrien@nexus.corp",  action: "Failed login attempt (3rd consecutive)",                   ip_address: "10.0.2.45",  module: "Auth",     created_at: new Date(now.getTime() - 12 * 60000).toISOString() },
    { severity: "INFO",     user_email: "n.okafor@nexus.corp",  action: "Security policy updated: MFA required for all admin roles", ip_address: "web-client", module: "Policy",   created_at: new Date(now.getTime() - 20 * 60000).toISOString() },
    { severity: "INFO",     user_email: "s.chen@nexus.corp",    action: "Employee profile updated: skill matrix modified",          ip_address: "web-client", module: "HR",       created_at: new Date(now.getTime() - 30 * 60000).toISOString() },
    { severity: "WARNING",  user_email: "unknown",               action: "Unauthorized access attempt: /admin/settings",            ip_address: "203.0.113.47",module: "Auth",    created_at: new Date(now.getTime() - 45 * 60000).toISOString() },
    { severity: "INFO",     user_email: "a.mohammed@nexus.corp", action: "Project 'Orion' created and team assigned",               ip_address: "web-client", module: "Projects", created_at: new Date(now.getTime() - 60 * 60000).toISOString() },
    { severity: "INFO",     user_email: "r.mehta@nexus.corp",   action: "Mentorship requested: React skill (mentor: Sarah Chen)",   ip_address: "web-client", module: "Mentorship",created_at: new Date(now.getTime() - 80 * 60000).toISOString() },
    { severity: "CRITICAL", user_email: "system",               action: "Database backup verification failed — integrity check error",ip_address: "internal",  module: "Database", created_at: new Date(now.getTime() - 95 * 60000).toISOString() },
    { severity: "INFO",     user_email: "m.williams@nexus.corp", action: "Q2 Workforce Utilization report exported",                ip_address: "web-client", module: "Reports",  created_at: new Date(now.getTime() - 120 * 60000).toISOString() },
  ]);

  await db.from("notifications").insert([
    { type: "critical", category: "Security",    title: "Unauthorized Access Attempt Detected", description: "Multiple failed login attempts from 203.0.113.47. Review recommended.", is_read: false, created_at: new Date(now.getTime() - 5  * 60000).toISOString() },
    { type: "warning",  category: "Skill Gap",   title: "No Expert Available: Penetration Testing", description: "All Penetration Testing experts are currently assigned. No backup coverage.", is_read: false, created_at: new Date(now.getTime() - 20 * 60000).toISOString() },
    { type: "info",     category: "Assignment",  title: "Tom Bergmann → Project Orion",         description: "Tom Bergmann assigned as Full Stack Engineer on Project Orion.", is_read: false, created_at: new Date(now.getTime() - 40 * 60000).toISOString() },
    { type: "success",  category: "Mentorship",  title: "Mentorship Milestone: Raj Mehta",      description: "Raj Mehta has completed 45% of the React mentorship with Sarah Chen.", is_read: true, created_at: new Date(now.getTime() - 2 * 3600000).toISOString() },
    { type: "warning",  category: "Resource",    title: "DevOps Team at Full Capacity",         description: "All DevOps engineers are assigned. New projects cannot be staffed.", is_read: true, created_at: new Date(now.getTime() - 4 * 3600000).toISOString() },
    { type: "info",     category: "Project",     title: "Project Atlas Approved",               description: "Project Atlas data platform initiative has been approved. Kickoff: August 1.", is_read: true, created_at: new Date(now.getTime() - 86400000).toISOString() },
  ]);
}

// ── Create demo auth user ─────────────────────────────────────────────────────
async function createDemoAuth(db: ReturnType<typeof admin>) {
  try {
    const { data: list } = await db.auth.admin.listUsers();
    const exists = (list?.users ?? []).some((u: any) => u.email === "admin@nexus.corp");
    if (!exists) {
      await db.auth.admin.createUser({ email: "admin@nexus.corp", password: "NexusHR2026!", email_confirm: true });
    }
  } catch (e) { console.error("Demo auth:", e); }
}

// ── Setup endpoint ─────────────────────────────────────────────────────────────
app.post("/setup", async (c) => {
  const db = admin();
  try {
    const dbUrl = Deno.env.get("SUPABASE_DB_URL");
    if (!dbUrl) return c.json({ error: "SUPABASE_DB_URL unavailable. Run SQL in Supabase editor." }, 500);
    const { default: postgres } = await import("https://esm.sh/postgres@3.4.4?deno-std=0.220.1&target=deno");
    const sql = postgres(dbUrl, { ssl: "require", max: 1, idle_timeout: 20, connect_timeout: 30 });
    try {
      for (const stmt of SETUP_SQL.split(";").map(s => s.trim()).filter(Boolean)) {
        await sql.unsafe(stmt + ";");
      }
    } finally { await sql.end({ timeout: 5 }); }
  } catch (e: any) { return c.json({ error: "DDL failed: " + e.message }, 500); }

  await createDemoAuth(db);

  const { count } = await db.from("employees").select("*", { count: "exact", head: true });
  if ((count ?? 0) > 0) return c.json({ success: true, message: "Already seeded", demoEmail: "admin@nexus.corp", demoPassword: "NexusHR2026!" });

  try {
    await seedDatabase(db);
    return c.json({ success: true, message: "Seeded", demoEmail: "admin@nexus.corp", demoPassword: "NexusHR2026!" });
  } catch (e: any) { return c.json({ error: "Seed failed: " + e.message }, 500); }
});

// ── Setup auth demo user ───────────────────────────────────────────────────────
app.post("/setup-auth", async (c) => {
  await createDemoAuth(admin());
  return c.json({ success: true });
});

// ── Invite new user ───────────────────────────────────────────────────────────
app.post("/invite", async (c) => {
  const { email, password, role, name, department, title } = await c.req.json();
  if (!email || !password) return c.json({ error: "email and password required" }, 400);
  const db = admin();
  try {
    const { data: authData, error: authErr } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (authErr) return c.json({ error: authErr.message }, 400);
    const initials = (name || email).split(/[\s.@_]/).filter(Boolean).map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
    const { data: profile, error: pErr } = await db.from("employees").upsert({
      email, name: name || email.split("@")[0], role: role || "employee",
      department: department || "General", title: title || "Employee",
      avatar_initials: initials, auth_user_id: authData.user?.id,
      available: true, utilization: 0, experience_years: 0, rating: 4.0,
    }, { onConflict: "email" }).select().single();
    if (pErr) return c.json({ error: pErr.message }, 400);
    await db.from("audit_logs").insert({ severity: "INFO", user_email: email, action: `New user invited: ${name || email} as ${role || "employee"}`, ip_address: "admin-panel", module: "IAM" });
    return c.json({ success: true, profile });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

// ── Skill assignment (backend) ─────────────────────────────────────────────────
app.post("/assign-skill", async (c) => {
  const { employee_id, skill_id, proficiency_level, years_experience } = await c.req.json();
  if (!employee_id || !skill_id) return c.json({ error: "employee_id and skill_id required" }, 400);
  const db = admin();
  const { data, error } = await db.from("employee_skills").upsert(
    { employee_id, skill_id, proficiency_level: Math.min(3, Math.max(1, proficiency_level ?? 1)), years_experience: years_experience ?? 0 },
    { onConflict: "employee_id,skill_id" }
  ).select().single();
  if (error) return c.json({ error: error.message }, 400);
  return c.json({ success: true, data });
});

// ── Skill creation (backend) ───────────────────────────────────────────────────
app.post("/create-skill", async (c) => {
  const { name, category } = await c.req.json();
  const cleanName = (name || "").trim();
  const cleanCategory = (category || "General").trim() || "General";
  if (!cleanName) return c.json({ error: "Skill name is required" }, 400);
  const db = admin();
  const { data, error } = await db.from("skills").upsert({ name: cleanName, category: cleanCategory }, { onConflict: "name" }).select().single();
  if (error) return c.json({ error: error.message }, 400);
  return c.json({ success: true, data });
});

// ── Reseed ─────────────────────────────────────────────────────────────────────
app.post("/reseed", async (c) => {
  const db = admin();
  try {
    for (const t of ["mentorships", "assignments", "employee_skills", "audit_logs", "notifications", "projects", "employees", "skills"]) {
      await db.from(t).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    }
    await seedDatabase(db);
    await createDemoAuth(db);
    return c.json({ success: true, demoEmail: "admin@nexus.corp", demoPassword: "NexusHR2026!" });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

Deno.serve(app.fetch);
