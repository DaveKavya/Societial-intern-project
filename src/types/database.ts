// ── Row types ─────────────────────────────────────────────────────────────────
// The people/user table in this Supabase project is named `employees`.
// All references that previously pointed to `public.users` now point to
// `public.employees`.  The TypeScript interface retains the name `Employee`
// to make intent clear throughout the codebase.

export interface Employee {
  id: string;
  auth_user_id?: string | null;
  name: string;
  email: string;
  role: "admin" | "hr_manager" | "center_manager" | "employee" | "intern";
  department: string;
  title: string;
  location: string | null;
  phone: string | null;
  avatar_initials: string;
  available: boolean;
  utilization: number;
  experience_years: number;
  rating: number;
  created_at: string;
  updated_at: string;
}

// Alias kept for backwards-compatibility with any code that imported `User`
export type User = Employee;

export interface Skill {
  id: string;
  name: string;
  category: string;
  created_at: string;
}

export interface EmployeeSkill {
  id: string;
  employee_id: string;   // FK → employees.id
  skill_id: string;
  proficiency_level: number;
  years_experience: number;
  created_at: string;
  skills?: Skill;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: "planning" | "active" | "completed" | "on_hold";
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Assignment {
  id: string;
  employee_id: string;   // FK → employees.id
  project_id: string;
  role: string;
  start_date: string | null;
  end_date: string | null;
  status: "upcoming" | "active" | "completed";
  created_at: string;
  employees?: Employee;
  projects?: Project;
}

export interface Mentorship {
  id: string;
  mentor_id: string;     // FK → employees.id
  mentee_id: string;     // FK → employees.id
  status: "pending" | "active" | "completed";
  goals: string[] | null;
  progress_percentage: number;
  created_at: string;
}

export interface AuditLog {
  id: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  user_email: string;
  action: string;
  ip_address: string | null;
  module: string;
  created_at: string;
}

export interface Notification {
  id: string;
  type: "info" | "warning" | "critical" | "success";
  category: string;
  title: string;
  description: string;
  is_read: boolean;
  created_at: string;
}

// ── Joined types ──────────────────────────────────────────────────────────────

export interface EmployeeWithSkills extends Employee {
  employee_skills: Array<{
    id: string;
    skill_id: string;
    proficiency_level: number;
    years_experience: number;
    skills: Skill | null;
  }>;
}

// Alias kept for backwards-compat
export type UserWithSkills = EmployeeWithSkills;

export interface DashboardStats {
  totalEmployees: number;
  availableResources: number;
  assignedResources: number;
  activeProjects: number;
  internCount: number;
}

// ── Supabase Database type contract ──────────────────────────────────────────
// Table key is `employees` (the actual table in public schema).

export interface Database {
  public: {
    Tables: {
      employees:      { Row: Employee;     Insert: Partial<Employee>;     Update: Partial<Employee> };
      skills:         { Row: Skill;        Insert: Partial<Skill>;        Update: Partial<Skill> };
      employee_skills:{ Row: EmployeeSkill;Insert: Partial<EmployeeSkill>;Update: Partial<EmployeeSkill> };
      projects:       { Row: Project;      Insert: Partial<Project>;      Update: Partial<Project> };
      assignments:    { Row: Assignment;   Insert: Partial<Assignment>;   Update: Partial<Assignment> };
      mentorships:    { Row: Mentorship;   Insert: Partial<Mentorship>;   Update: Partial<Mentorship> };
      audit_logs:     { Row: AuditLog;     Insert: Partial<AuditLog>;     Update: Partial<AuditLog> };
      notifications:  { Row: Notification; Insert: Partial<Notification>; Update: Partial<Notification> };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
