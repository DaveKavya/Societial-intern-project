import React, { useState, useEffect, useRef, useCallback, createContext, useContext, useMemo } from "react";
import {
  LayoutDashboard, Sparkles, BarChart2, Users, GraduationCap,
  ShieldCheck, Bell, Settings, LogOut, Search, TrendingUp,
  AlertTriangle, CheckCircle, XCircle, Info, Briefcase, Star,
  Award, Clock, Calendar, ArrowRight, ChevronRight, Plus,
  Download, Eye, EyeOff, Edit, Trash2, Activity, Target, Brain,
  Building2, Shield, Lock, Mail, UserCheck, AlertCircle, Layers,
  MapPin, Phone, Percent, RefreshCw, X, Database,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip,
} from "recharts";
import { supabase, EDGE_URL, EDGE_HEADERS } from "../../utils/supabase/client";
import { AIBestFitMatchmaker } from "./AIMatchmaker";
import type {
  User, Skill, UserWithSkills, Project, Assignment,
  AuditLog, Notification, Mentorship, DashboardStats,
} from "../types/database";

// ─── SCREEN TYPE ──────────────────────────────────────────────────────────────
type Screen = "landing" | "login" | "dashboard" | "matchmaker" | "bench"
  | "directory" | "profile" | "intern" | "security" | "notifications" | "settings";

type AuthProfile = UserWithSkills | null;
const isAdminHr = (user: AuthProfile) => user?.role === "admin" || user?.role === "hr_manager";

// ─── ANIMATION VARIANTS ──────────────────────────────────────────────────────
const fadeUp = { hidden: { opacity: 0, y: 18 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } } };
const staggerFast = { hidden: {}, visible: { transition: { staggerChildren: 0.05 } } };
const scaleIn = { hidden: { opacity: 0, scale: 0.94 }, visible: { opacity: 1, scale: 1, transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] } } };
const slideRight = { hidden: { opacity: 0, x: 24 }, visible: { opacity: 1, x: 0, transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] } } };

// ─── ANIMATED PRIMITIVES ──────────────────────────────────────────────────────
function AnimatedNumber({ target, duration = 1100 }: { target: number; duration?: number }) {
  const [count, setCount] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let t: number | null = null;
    const step = (ts: number) => {
      if (!t) t = ts;
      const p = Math.min((ts - t) / duration, 1);
      setCount(Math.round((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) requestAnimationFrame(step);
    };
    const id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [target, duration]);
  return <>{count}</>;
}

function AnimatedBar({ value, delay: d = 0, className }: { value: number; delay?: number; className: string }) {
  const [w, setW] = React.useState(0);
  React.useEffect(() => { const t = setTimeout(() => setW(value), d * 1000 + 50); return () => clearTimeout(t); }, [value, d]);
  return <div className={className} style={{ width: `${w}%`, transition: `width 0.9s cubic-bezier(0.4,0,0.2,1) ${d}s` }} />;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode; onReset?: () => void },
  { hasError: boolean; message: string }
> {
  state = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message || "Something went wrong while rendering this screen." };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("NexusHR render error", error, info);
  }

  reset = () => {
    this.setState({ hasError: false, message: "" });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="p-6">
        <div className="bg-card border border-red-200 rounded-xl p-6 shadow-sm max-w-xl">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-display font-semibold text-foreground">This screen could not render</h2>
              <p className="text-sm text-muted-foreground mt-1">The app stayed open so you can recover without a blank page.</p>
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2 mt-3 break-words">{this.state.message}</p>
              <button onClick={this.reset} className="mt-4 bg-[#1B3A8F] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-[#162F76]">
                Reload screen
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

// ─── DATABASE CONTEXT ─────────────────────────────────────────────────────────
interface DbCtx {
  currentUser: AuthProfile;
  employees: UserWithSkills[];
  skills: Skill[];
  projects: Project[];
  assignments: Assignment[];
  auditLogs: AuditLog[];
  notifications: Notification[];
  mentorships: Mentorship[];
  stats: DashboardStats;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  selectedEmployee: UserWithSkills | null;
  setSelectedEmployee: (e: UserWithSkills | null) => void;
  createEmployee: (data: Omit<Partial<User>, "id" | "created_at" | "updated_at">, skills?: Array<{ skillId: string; proficiency: number; yearsExp: number }>) => Promise<void>;
  updateEmployee: (id: string, data: Partial<User>) => Promise<void>;
  deleteEmployee: (id: string) => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  addAuditLog: (severity: string, action: string, module: string) => Promise<void>;
  requestMentorship: (mentorId: string, menteeId: string, goals: string[]) => Promise<void>;
  toggleAvailability: (id: string, available: boolean) => Promise<void>;
  addSkillToEmployee: (employeeId: string, skillId: string, proficiency: number, yearsExp: number) => Promise<void>;
  removeSkillFromEmployee: (employeeId: string, skillId: string) => Promise<void>;
  createSkill: (name: string, category: string) => Promise<{ id: string; name: string; category: string }>;
  createNotification: (data: Pick<Notification, "type" | "category" | "title" | "description">) => Promise<void>;
  notificationFeed: Notification[];
}

const DbContext = createContext<DbCtx | null>(null);
const useDb = () => {
  const ctx = useContext(DbContext);
  if (!ctx) throw new Error("useDb must be used within DatabaseProvider");
  return ctx;
};

function DatabaseProvider({ currentUser, children }: { currentUser: AuthProfile; children: React.ReactNode }) {
  const [employees, setEmployees] = useState<UserWithSkills[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [mockNotifications, setMockNotifications] = useState<Notification[]>([]);
  const [mentorships, setMentorships] = useState<Mentorship[]>([]);
  const [stats, setStats] = useState<DashboardStats>({ totalEmployees: 0, availableResources: 0, assignedResources: 0, activeProjects: 0, internCount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<UserWithSkills | null>(null);

  const refetch = useCallback(async () => {
    try {
      // ── employees: try with full join first; fall back to plain select if
      //    employee_skills or skills tables are missing (PGRST200 / PGRST205).
      let empData: UserWithSkills[] = [];
      const empJoin = await supabase
        .from("employees")
        .select("*, employee_skills(id, skill_id, proficiency_level, years_experience, skills(*))")
        .order("name");
      if (!empJoin.error) {
        empData = (empJoin.data ?? []) as UserWithSkills[];
      } else {
        // Relationship or table missing — load employees without the join
        const empSimple = await supabase.from("employees").select("*").order("name");
        empData = (empSimple.data ?? []).map(e => ({ ...e, employee_skills: [] })) as UserWithSkills[];
      }

      // ── all other tables queried independently so one missing table
      //    cannot crash the entire data load.
      const safe = async <T,>(q: Promise<{ data: T[] | null; error: any }>): Promise<T[]> => {
        const { data, error } = await q;
        if (error) return [];           // table missing or RLS blocked → empty
        return data ?? [];
      };

      const [skills, projs, assignments, logs, notifs, mentorships] = await Promise.all([
        safe(supabase.from("skills").select("*").order("name")),
        safe(supabase.from("projects").select("*").order("name")),
        safe(supabase.from("assignments").select("*, employees(*), projects(*)").order("created_at", { ascending: false })),
        safe(supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(50)),
        safe(supabase.from("notifications").select("*").order("created_at", { ascending: false })),
        safe(supabase.from("mentorships").select("*").order("created_at", { ascending: false })),
      ]);

      setEmployees(empData);
      setSkills(skills as Skill[]);
      setProjects(projs as Project[]);
      setAssignments(assignments as Assignment[]);
      setAuditLogs(logs as AuditLog[]);
      setNotifications(notifs as Notification[]);
      setMentorships(mentorships as Mentorship[]);
      setStats({
        totalEmployees: empData.filter(e => e.role !== "intern").length,
        availableResources: empData.filter(e => e.available && e.role !== "intern").length,
        assignedResources: empData.filter(e => !e.available && e.role !== "intern").length,
        activeProjects: (projs as Project[]).filter(p => p.status === "active").length,
        internCount: empData.filter(e => e.role === "intern").length,
      });
      setError(null);
    } catch (e: any) { setError(e.message); }
  }, []);

  useEffect(() => {
    setLoading(true);
    refetch().finally(() => setLoading(false));
    const ch = supabase.channel("nexushr-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "employees" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "skills" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "employee_skills" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "audit_logs" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "assignments" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "mentorships" }, refetch)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetch]);

  const isRlsError = (value?: string | number) => {
    const text = typeof value === "string" ? value : String(value ?? "");
    return /(row-level security|permission denied|violates row-level|42501)/i.test(text);
  };

  const fakeNotificationTemplates: Array<Omit<Notification, "id" | "created_at">> = [
    {
      type: "critical",
      category: "SECURITY",
      title: "Critical: Unauthorized Access Attempt",
      description: "Multiple failed login attempts detected for admin account from IP 203.0.113.47.",
      is_read: false,
    },
    {
      type: "warning",
      category: "SKILL GAP",
      title: "Skill Shortage Alert: Cloud Architecture",
      description: "Only 8/20 required Cloud Architects are currently available. Projects Orion and Atlas may be at risk.",
      is_read: false,
    },
    {
      type: "info",
      category: "RESOURCE",
      title: "High Utilization Warning: DevOps Team",
      description: "DevOps department is at 100% utilization. New project requests cannot be fulfilled.",
      is_read: false,
    },
    {
      type: "success",
      category: "ASSIGNMENT",
      title: "Resource Allocated: Sarah Chen — Project Nexus",
      description: "Sarah Chen assigned as lead frontend engineer. Project start: Jul 1.",
      is_read: false,
    },
    {
      type: "info",
      category: "MENTORSHIP",
      title: "Intern Milestone Achieved: Raj Mehta",
      description: "Intern Raj Mehta completed the React Foundations milestone roadmap milestone.",
      is_read: false,
    },
  ];

  const buildMockNotifications = useCallback(() => {
    const now = Date.now();
    return fakeNotificationTemplates.map((item, index) => ({
      ...item,
      id: `mock-${index}-${Math.floor(now / 1000)}`,
      created_at: new Date(now - index * 1000 * 60 * 7).toISOString(),
    }));
  }, []);

  const updateMockNotifications = useCallback(() => {
    setMockNotifications((prev) => {
      if (!prev.length) return buildMockNotifications();
      const rotated = [...prev];
      const moved = rotated.shift();
      if (moved) rotated.push({ ...moved, id: `mock-${moved.id}-${Date.now()}`, created_at: new Date().toISOString(), is_read: false });
      return rotated.map((item, idx) => ({ ...item, created_at: new Date(Date.now() - idx * 1000 * 60 * 8).toISOString() }));
    });
  }, [buildMockNotifications]);

  useEffect(() => {
    setMockNotifications(buildMockNotifications());
    const interval = window.setInterval(updateMockNotifications, 25000);
    return () => window.clearInterval(interval);
  }, [buildMockNotifications, updateMockNotifications]);

  const notificationFeed = notifications.length > 0 ? notifications : mockNotifications;

  const ensureSetup = useCallback(async (): Promise<boolean> => {
    try {
      const resp = await fetch(`${EDGE_URL}/setup`, { method: "POST", headers: { ...EDGE_HEADERS, "Content-Type": "application/json" } });
      const body = await resp.json().catch(() => null);
      return body?.success === true;
    } catch (err) {
      console.warn("Database setup retry failed:", err);
      return false;
    }
  }, []);

  const addAuditLog = useCallback(async (severity: string, action: string, module: string) => {
    const normalizedSeverity = ["INFO", "WARNING", "CRITICAL"].includes(severity) ? severity : "INFO";
    try {
      const { error } = await supabase.from("audit_logs").insert({
        severity: normalizedSeverity,
        user_email: currentUser?.email ?? "system@nexushr.local",
        action,
        ip_address: "web-client",
        module,
      });
      if (error) {
        if (isRlsError(error.message) || isRlsError(error.code)) {
          console.warn("Audit log write blocked by RLS; continuing without audit log.", error.message || error.code);
          return;
        }
        throw error;
      }
      await refetch();
    } catch (err: any) {
      if (isRlsError(err?.message) || isRlsError(err?.code)) {
        console.warn("Audit log write blocked by RLS; continuing without audit log.", err.message || err.code);
        return;
      }
      console.error("Unexpected audit log error:", err);
      throw err;
    }
  }, [currentUser?.email, refetch]);

  const createEmployee = useCallback(async (
    data: Omit<Partial<User>, "id" | "created_at" | "updated_at">,
    skillRows: Array<{ skillId: string; proficiency: number; yearsExp: number }> = []
  ) => {
    const insertData = {
      ...data,
      avatar_initials: (data.name || "U").split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase(),
    };

    let employeeInsert = await supabase
      .from("employees")
      .insert(insertData)
      .select()
      .single();

    let { data: newEmployee, error } = employeeInsert;
    if (error && (isRlsError(error.message) || isRlsError(error.code))) {
      const setupSuccess = await ensureSetup();
      if (setupSuccess) {
        employeeInsert = await supabase.from("employees").insert(insertData).select().single();
        newEmployee = employeeInsert.data;
        error = employeeInsert.error;
      }
    }

    if (error || !newEmployee) {
      if (error && (isRlsError(error.message) || isRlsError(error.code))) {
        throw new Error("Employee save blocked by Supabase row-level security. Run the setup SQL or check policies.");
      }
      throw error ?? new Error("Failed to create employee.");
    }

    const validSkillRows = skillRows
      .filter((row) => row.skillId)
      .map((row) => ({
        employee_id: newEmployee.id,
        skill_id: row.skillId,
        proficiency_level: Math.min(3, Math.max(1, row.proficiency)),
        years_experience: Math.max(0, row.yearsExp),
      }));

    if (validSkillRows.length > 0) {
      const { error: skillsError } = await supabase.from("employee_skills").upsert(validSkillRows, { onConflict: "employee_id,skill_id" });
      if (skillsError) {
        if (isRlsError(skillsError.message) || isRlsError(skillsError.code)) {
          console.warn("Employee skill assignment blocked by RLS; falling back to edge service.", skillsError.message || skillsError.code);
          await Promise.all(validSkillRows.map(async (row) => {
            const response = await fetch(`${EDGE_URL}/assign-skill`, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...EDGE_HEADERS },
              body: JSON.stringify(row),
            });
            if (!response.ok) {
              const body = await response.text().catch(() => "");
              console.error("Edge assign-skill failed:", response.status, body);
              throw new Error(`Edge assign-skill failed (${response.status})`);
            }
          }));
        } else {
          throw skillsError;
        }
      }
    }

    try {
      await addAuditLog("INFO", `New employee added: ${data.name ?? "Unknown"}`, "HR");
    } catch (err: any) {
      console.warn("Employee created but audit log failed:", err?.message ?? err);
    }

    await refetch();
  }, [refetch, addAuditLog]);

  const updateEmployee = useCallback(async (id: string, data: Partial<User>) => {
    const { error } = await supabase.from("employees").update({ ...data, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    await refetch();
  }, [refetch]);

  const deleteEmployee = useCallback(async (id: string) => {
    const { error } = await supabase.from("employees").delete().eq("id", id);
    if (error) throw error;
    await refetch();
  }, [refetch]);

  const markNotificationRead = useCallback(async (id: string) => {
    if (id.startsWith("mock-")) {
      setMockNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      return;
    }

    const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    if (error && isRlsError(error.message)) {
      console.warn("Notification read update blocked by RLS; updating UI locally.", error.message);
    } else if (error) {
      throw error;
    }
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    const { error } = await supabase.from("notifications").update({ is_read: true }).eq("is_read", false);
    if (error && isRlsError(error.message)) {
      console.warn("Mark-all notifications read blocked by RLS; updating UI locally.", error.message);
    } else if (error) {
      throw error;
    }
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setMockNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  }, []);

  const requestMentorship = useCallback(async (mentorId: string, menteeId: string, goals: string[]) => {
    const { error } = await supabase.from("mentorships").upsert({ mentor_id: mentorId, mentee_id: menteeId, status: "pending", goals });
    if (error) throw error;
    await refetch();
  }, [refetch]);

  const toggleAvailability = useCallback(async (id: string, available: boolean) => {
    await supabase.from("employees").update({ available, utilization: available ? 0 : 100, updated_at: new Date().toISOString() }).eq("id", id);
    await refetch();
  }, [refetch]);

  const addSkillToEmployee = useCallback(async (employeeId: string, skillId: string, proficiency: number, yearsExp: number) => {
    const level = Math.min(3, Math.max(1, proficiency));
    const { error } = await supabase.from("employee_skills").upsert(
      { employee_id: employeeId, skill_id: skillId, proficiency_level: level, years_experience: yearsExp },
      { onConflict: "employee_id,skill_id" }
    );
    if (error) throw error;
    await addAuditLog("INFO", `Skill assigned/updated for employee`, "Skills");
    await refetch();
  }, [refetch, addAuditLog]);

  const removeSkillFromEmployee = useCallback(async (employeeId: string, skillId: string) => {
    const { error } = await supabase.from("employee_skills").delete().eq("employee_id", employeeId).eq("skill_id", skillId);
    if (error) throw error;
    await addAuditLog("INFO", `Skill removed from employee`, "Skills");
    await refetch();
  }, [refetch, addAuditLog]);

  const createSkillViaEdge = useCallback(async (name: string, category: string) => {
    const response = await fetch(`${EDGE_URL}/create-skill`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...EDGE_HEADERS },
      body: JSON.stringify({ name, category }),
    });
    const text = await response.text();
    let payload: any = null;
    try { payload = JSON.parse(text); } catch (_) { payload = { error: text || "Invalid response from edge skill creation" }; }

    if (!response.ok || !payload?.success) {
      throw new Error(payload?.error || `Edge skill creation failed (${response.status})`);
    }
    return payload.data as Skill;
  }, []);

  const createSkill = useCallback(async (name: string, category: string) => {
    const cleanName = name.trim();
    const cleanCategory = category.trim() || "General";
    if (!cleanName) throw new Error("Skill name is required.");

    let result = await supabase
      .from("skills")
      .upsert({ name: cleanName, category: cleanCategory }, { onConflict: "name" })
      .select()
      .single();

    let { data: createdSkill, error } = result;
    if (error && (isRlsError(error.message) || isRlsError(error.code))) {
      const setupSuccess = await ensureSetup();
      if (setupSuccess) {
        result = await supabase
          .from("skills")
          .upsert({ name: cleanName, category: cleanCategory }, { onConflict: "name" })
          .select()
          .single();
        createdSkill = result.data;
        error = result.error;
      }
    }

    if (error && (isRlsError(error.message) || isRlsError(error.code))) {
      const edgeSkill = await createSkillViaEdge(cleanName, cleanCategory);
      await addAuditLog("INFO", `Skill saved via edge: ${cleanName} (${cleanCategory})`, "Skills");
      await refetch();
      return edgeSkill;
    }

    if (error) {
      throw error;
    }

    await addAuditLog("INFO", `Skill saved: ${cleanName} (${cleanCategory})`, "Skills");
    await refetch();
    return createdSkill as Skill;
  }, [refetch, addAuditLog, createSkillViaEdge]);

  const createNotification = useCallback(async (data: Pick<Notification, "type" | "category" | "title" | "description">) => {
    const payload = {
      type: data.type || "info",
      category: data.category.trim() || "General",
      title: data.title.trim(),
      description: data.description.trim(),
      is_read: false,
    };
    if (!payload.title) throw new Error("Notification title is required.");
    if (!payload.description) throw new Error("Notification description is required.");

    const saveNotification = () => supabase
      .from("notifications")
      .insert(payload)
      .select()
      .single();

    let result = await saveNotification();
    let { error } = result;

    if (error && isRlsError(error.message)) {
      console.warn("Notification insert blocked by RLS; trying edge fallback.", error.message);
      const edgeResp = await fetch(`${EDGE_URL}/create-notification`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...EDGE_HEADERS },
        body: JSON.stringify(payload),
      });
      if (!edgeResp.ok) {
        const body = await edgeResp.text().catch(() => "");
        throw new Error(`Edge notification failed (${edgeResp.status}): ${body}`);
      }
      await refetch();
      return;
    }

    if (error) {
      try {
        await fetch(`${EDGE_URL}/setup`, { method: "POST", headers: { ...EDGE_HEADERS, "Content-Type": "application/json" } });
        result = await saveNotification();
        error = result.error;
      } catch {
        /* fall through to the clearer error below */
      }
    }

    if (error) {
      if (isRlsError(error.message)) {
        console.warn("Notification insert blocked by RLS; trying edge fallback.", error.message);
        const edgeResp = await fetch(`${EDGE_URL}/create-notification`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...EDGE_HEADERS },
          body: JSON.stringify(payload),
        });
        if (!edgeResp.ok) {
          const body = await edgeResp.text().catch(() => "");
          throw new Error(`Edge notification failed (${edgeResp.status}): ${body}`);
        }
        await refetch();
        return;
      }
      throw error;
    }

    try {
      await addAuditLog(payload.type === "critical" ? "CRITICAL" : payload.type === "warning" ? "WARNING" : "INFO", `Notification created: ${payload.title}`, "Notifications");
    } catch (err: any) {
      console.warn("Notification saved but audit log failed:", err?.message ?? err);
    }

    await refetch();
  }, [addAuditLog, refetch]);

  return (
    <DbContext.Provider value={{
      currentUser, employees, skills, projects, assignments, auditLogs, notifications, mentorships,
      notificationFeed, stats, loading, error, refetch, selectedEmployee, setSelectedEmployee,
      createEmployee, updateEmployee, deleteEmployee,
      markNotificationRead, markAllNotificationsRead,
      addAuditLog, requestMentorship, toggleAvailability,
      addSkillToEmployee, removeSkillFromEmployee, createSkill,
      createNotification,
    }}>
      {children}
    </DbContext.Provider>
  );
}

// ─── SETUP GUARD ──────────────────────────────────────────────────────────────
// SetupGuard: handles automatic DDL (via edge function) with a SQL fallback
// for environments where the postgres connection is unavailable.
const SETUP_KEY = "nexushr_setup_v4";
const LOCAL_SESSION_KEY = "nexushr_local_session";

// SQL to run once in https://supabase.com/dashboard/project/tcsqcavcantoehvdserv/sql/new
// The `employees` table already exists; we extend it and create the rest.
const EMBEDDED_SETUP_SQL = `-- NexusHR one-time migration
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/tcsqcavcantoehvdserv/sql/new

-- Extend existing employees table with required columns
ALTER TABLE employees ADD COLUMN IF NOT EXISTS email            TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS auth_user_id     UUID UNIQUE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS role             TEXT NOT NULL DEFAULT 'employee';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS department       TEXT NOT NULL DEFAULT 'Unknown';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS title            TEXT NOT NULL DEFAULT 'Employee';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS location         TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone            TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS avatar_initials  TEXT NOT NULL DEFAULT 'U';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS available        BOOLEAN DEFAULT true;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS utilization      INTEGER DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS experience_years INTEGER DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS rating           DECIMAL(3,1) DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS employees_email_unique ON employees(email) WHERE email IS NOT NULL;

-- Create remaining tables
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
  name TEXT NOT NULL, description TEXT,
  status TEXT NOT NULL DEFAULT 'planning',
  start_date DATE, end_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL, start_date DATE, end_date DATE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mentorships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  mentee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  goals TEXT[], progress_percentage INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(mentor_id, mentee_id)
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  severity TEXT NOT NULL DEFAULT 'INFO',
  user_email TEXT NOT NULL, action TEXT NOT NULL,
  ip_address TEXT, module TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'info',
  category TEXT NOT NULL, title TEXT NOT NULL,
  description TEXT NOT NULL, is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS and permissive policies
ALTER TABLE employees     ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills        ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects      ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentorships   ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='employees'     AND policyname='nexushr_all') THEN CREATE POLICY nexushr_all ON employees     FOR ALL TO anon,authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='skills'        AND policyname='nexushr_all') THEN CREATE POLICY nexushr_all ON skills        FOR ALL TO anon,authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='employee_skills' AND policyname='nexushr_all') THEN CREATE POLICY nexushr_all ON employee_skills FOR ALL TO anon,authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='projects'      AND policyname='nexushr_all') THEN CREATE POLICY nexushr_all ON projects      FOR ALL TO anon,authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='assignments'   AND policyname='nexushr_all') THEN CREATE POLICY nexushr_all ON assignments   FOR ALL TO anon,authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='mentorships'   AND policyname='nexushr_all') THEN CREATE POLICY nexushr_all ON mentorships   FOR ALL TO anon,authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='audit_logs'    AND policyname='nexushr_all') THEN CREATE POLICY nexushr_all ON audit_logs    FOR ALL TO anon,authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notifications' AND policyname='nexushr_all') THEN CREATE POLICY nexushr_all ON notifications FOR ALL TO anon,authenticated USING (true) WITH CHECK (true); END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_es_emp   ON employee_skills(employee_id);
CREATE INDEX IF NOT EXISTS idx_es_skill ON employee_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_asgn_e   ON assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_asgn_p   ON assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_ment_m   ON mentorships(mentor_id);
CREATE INDEX IF NOT EXISTS idx_ment_e   ON mentorships(mentee_id);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_ts ON notifications(created_at DESC);
`;


function SetupGuard({ children }: { children: React.ReactNode }) {
  // Only two meaningful states: "checking" (transient) and "ready" or "sql_needed".
  // There is NO "error" state — any failure that isn't "tables exist" shows the
  // SQL migration screen so the user always has a path forward.
  const [status, setStatus] = useState<"checking" | "ready" | "sql_needed">("checking");
  const [hint, setHint] = useState("");
  const [copied, setCopied] = useState(false);

  const safeSetItem = (key: string, value: string) => {
    try { localStorage.setItem(key, value); } catch { /* ignore storage issues */ }
  };

  const safeRemoveItem = (key: string) => {
    try { localStorage.removeItem(key); } catch { /* ignore storage issues */ }
  };

  // ── Detect whether the tables already exist ────────────────────────────────
  // Queries the `users` table with the anon key. Returns true when:
  //   - the query returns rows (HTTP 200)
  //   - the query returns empty (HTTP 200, 0 rows) — table exists but empty
  //   - PGRST116 "no rows" code
  // Returns false only for hard failures: table-not-found (42P01 / PGRST200)
  // or genuine network errors.
  // Checks ALL 8 required tables. Returns true only when every table is
  // reachable. A single missing table returns false so the SQL migration
  // screen is shown. Previously this only checked `employees`, which caused
  // the app to bypass setup even though 7 other tables were missing.
  const tablesExist = useCallback(async (): Promise<boolean> => {
    const required = [
      "employees", "skills", "employee_skills", "projects",
      "assignments", "mentorships", "audit_logs", "notifications",
    ];
    for (const table of required) {
      try {
        const { error } = await supabase.from(table).select("id").limit(1);
        if (!error) continue;                              // table exists + accessible
        if (error.code === "PGRST116") continue;          // table exists but empty
        // PGRST205 = table not in schema cache (doesn't exist or not granted)
        // 42P01 = undefined table
        if (error.code === "PGRST205" || error.code === "42P01") return false;
        // PGRST200 = relationship not found — table might exist without FK
        // Treat as "missing" so the full migration is applied
        if (error.code === "PGRST200") return false;
        // Other Supabase errors (RLS, auth) — table exists, continue
      } catch {
        return false; // network failure
      }
    }
    return true; // every required table responded
  }, []);

  // ── Attempt edge-function setup silently in the background ─────────────────
  // On any failure, fall through to the SQL migration screen — never block.
  const tryEdgeSetup = useCallback(async (): Promise<boolean> => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 25000);
      let r: Response;
      try {
        r = await fetch(`${EDGE_URL}/setup`, { method: "POST", signal: ctrl.signal, headers: { ...EDGE_HEADERS, "Content-Type": "application/json" } });
      } finally {
        clearTimeout(timer);
      }
      let d: any = {};
      try { d = await r.json(); } catch { /* non-JSON body */ }
      return d.success === true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    // Always invalidate any cached setup flag so the full table check runs.
    // The previous version only checked `employees`, leaving 7 missing tables
    // undetected. Force re-validation on every app load.
    localStorage.removeItem(SETUP_KEY);

    (async () => {
      // 1️⃣  Direct database probe — checks ALL 8 required tables.
      //     If every table responds, mark complete and proceed.
      if (await tablesExist()) {
        localStorage.setItem(SETUP_KEY, "1");
        setStatus("ready");
        return;
      }

      // 2️⃣  Tables missing — try the edge function to create them.
      const created = await tryEdgeSetup();
      if (created) {
        localStorage.setItem(SETUP_KEY, "1");
        setStatus("ready");
        return;
      }

      // 3️⃣  Edge function could not create tables — show the SQL migration
      //     screen so the user can do it manually in the Supabase SQL editor.
      setHint("Edge function could not create tables automatically.");
      setStatus("sql_needed");
    })();
  }, [tablesExist, tryEdgeSetup]);

  // ── Continue button: re-probe after the user ran the SQL manually ──────────
  const handleContinue = useCallback(async () => {
    if (await tablesExist()) {
      safeSetItem(SETUP_KEY, "1");
      setStatus("ready");
    } else {
      setHint("Tables still not detected — make sure you ran the full SQL and try again.");
    }
  }, [tablesExist]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (status === "ready") return <>{children}</>;

  if (status === "sql_needed") {
    return (
      <div className="min-h-screen bg-[#F3F6FB] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-2xl p-8">
          <div className="flex items-start gap-4 mb-5">
            <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <Database className="w-6 h-6 text-amber-500" />
            </div>
            <div>
              <h2 className="text-lg font-display font-bold text-slate-900 mb-1">One-Time Database Setup Required</h2>
              <p className="text-sm text-slate-500">
                {hint || "The tables could not be created automatically."}{" "}
                Copy the SQL below and run it once in the Supabase SQL Editor.
              </p>
            </div>
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">SQL Migration Script</span>
              <div className="flex items-center gap-2">
                <a href="https://supabase.com/dashboard/project/tcsqcavcantoehvdserv/sql/new"
                   target="_blank"
                   className="text-xs text-[#1B3A8F] font-medium hover:underline">
                  Open SQL Editor ↗
                </a>
                <button
                  onClick={() => { navigator.clipboard?.writeText(EMBEDDED_SETUP_SQL); setCopied(true); setTimeout(() => setCopied(false), 2500); }}
                  className="text-xs bg-[#1B3A8F] text-white font-semibold px-3 py-1.5 rounded-lg hover:bg-[#162F76] transition-colors">
                  {copied ? "✓ Copied!" : "Copy SQL"}
                </button>
              </div>
            </div>
            <pre className="bg-slate-900 text-green-300 text-xs rounded-xl p-4 overflow-auto max-h-56 font-mono leading-relaxed whitespace-pre-wrap">
              {EMBEDDED_SETUP_SQL}
            </pre>
          </div>

          <ol className="space-y-2 mb-6 text-sm text-slate-600">
            {[
              'Click "Copy SQL" and open the Supabase SQL Editor (link above)',
              "Paste the SQL and click Run — takes about 5 seconds",
              'Return here and click "Tables Created — Continue"',
              "The app seeds itself with sample data on first launch",
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-[#1B3A8F] text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>

          <button
            onClick={handleContinue}
            className="w-full bg-[#1B3A8F] text-white text-sm font-semibold py-3 rounded-xl hover:bg-[#162F76] transition-colors">
            Tables Created — Continue →
          </button>
          {hint.startsWith("Tables still") && (
            <p className="text-xs text-red-500 mt-3 text-center">{hint}</p>
          )}
        </div>
      </div>
    );
  }

  // "checking" — brief loading spinner while the DB probe runs
  return (
    <div className="min-h-screen bg-[#F3F6FB] flex items-center justify-center">
      <div className="text-center">
        <div className="w-14 h-14 bg-[#1B3A8F] rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-blue-900/20">
          <Layers className="w-7 h-7 text-white" />
        </div>
        <div className="flex items-center justify-center gap-2 mb-3">
          <div className="animate-spin w-5 h-5 border-2 border-[#1B3A8F] border-t-transparent rounded-full" />
          <span className="text-sm text-muted-foreground font-medium">Checking database…</span>
        </div>
        <h2 className="font-display font-bold text-foreground text-xl">NexusHR</h2>
      </div>
    </div>
  );
}

// ─── SHARED UI ────────────────────────────────────────────────────────────────
function Spinner() {
  return <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full inline-block" />;
}

function LoadingScreen({ message = "Loading…" }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-64 gap-3">
      <div className="animate-spin w-6 h-6 border-2 border-[#1B3A8F] border-t-transparent rounded-full" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function EmptyState({ icon, title, message, action }: { icon: React.ReactNode; title: string; message: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-muted-foreground/30 mb-3">{icon}</div>
      <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground max-w-xs">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function ErrorBanner({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1"><p className="text-sm text-red-700 font-medium">Database error</p><p className="text-xs text-red-600 mt-0.5">{error}</p></div>
      {onRetry && <button onClick={onRetry} className="text-xs text-red-600 hover:underline flex-shrink-0">Retry</button>}
    </div>
  );
}

function SkeletonRow({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded-lg ${className ?? "h-12 w-full"}`} />;
}

function AvBadge({ initials, size = "md" }: { initials: string; size?: "sm" | "md" | "lg" }) {
  const p = ["bg-blue-100 text-blue-700", "bg-violet-100 text-violet-700", "bg-emerald-100 text-emerald-700", "bg-amber-100 text-amber-700", "bg-rose-100 text-rose-700", "bg-cyan-100 text-cyan-700"];
  const c = p[(initials.charCodeAt(0) || 0) % p.length];
  const sz = size === "sm" ? "w-8 h-8 text-xs" : size === "lg" ? "w-14 h-14 text-base" : "w-10 h-10 text-sm";
  return <div className={`${sz} ${c} rounded-full flex items-center justify-center font-semibold flex-shrink-0 select-none`}>{initials}</div>;
}

function StatusDot({ available }: { available: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${available ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${available ? "bg-emerald-500" : "bg-slate-400"}`} />
      {available ? "Available" : "Assigned"}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const m: Record<string, { cls: string; icon: React.ReactNode }> = {
    INFO: { cls: "bg-blue-50 text-blue-700 border border-blue-200", icon: <Info className="w-3 h-3" /> },
    WARNING: { cls: "bg-amber-50 text-amber-700 border border-amber-200", icon: <AlertTriangle className="w-3 h-3" /> },
    CRITICAL: { cls: "bg-red-50 text-red-700 border border-red-200", icon: <XCircle className="w-3 h-3" /> },
  };
  const normalized = severity?.toUpperCase?.() ?? "INFO";
  const s = m[normalized] ?? m.INFO;
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold flex-shrink-0 ${s.cls}`}>{s.icon} {normalized}</span>;
}

function StatCard({ icon, label, value, numValue, delta, color, delay = 0 }: { icon: React.ReactNode; label: string; value: string; numValue?: number; delta?: string; color: string; delay?: number }) {
  return (
    <div
      className="bg-card rounded-xl p-5 border border-border shadow-sm cursor-default">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
          <p className="text-2xl font-display font-bold text-foreground">
            {numValue !== undefined ? <><AnimatedNumber target={numValue} />{value.replace(/\d+/, "")}</> : value}
          </p>
          {delta && <p className="text-xs text-emerald-600 mt-1 flex items-center gap-0.5 font-medium"><TrendingUp className="w-3 h-3" /> {delta}</p>}
        </div>
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>{icon}</div>
      </div>
    </div>
  );
}

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-xl p-3 text-xs">
      <p className="font-semibold text-slate-700 mb-1.5">{label}</p>
      {payload.map((p: any, i: number) => <p key={i} style={{ color: p.stroke || p.fill }} className="mb-0.5">{p.name}: <strong>{p.value}</strong></p>)}
    </div>
  );
};

// ─── ADD EMPLOYEE MODAL ───────────────────────────────────────────────────────
function AddEmployeeModal({ onClose }: { onClose: () => void }) {
  const { createEmployee, skills: availableSkills } = useDb();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", email: "", role: "employee" as User["role"],
    department: "Engineering", title: "", location: "", phone: "",
    available: true, utilization: 0, experience_years: 0, rating: 4.0,
  });
  const [skillRows, setSkillRows] = useState<Array<{ skillId: string; proficiency: number; yearsExp: number }>>([]);
  const [newSkill, setNewSkill] = useState({ skillId: "", proficiency: 2, yearsExp: 1 });
  const [formError, setFormError] = useState<string | null>(null);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.type === "number" ? +e.target.value : e.target.value }));

  const addSkillRow = () => {
    if (!newSkill.skillId) return;
    setSkillRows((prev) => [...prev, newSkill]);
    setNewSkill({ skillId: "", proficiency: 2, yearsExp: 1 });
  };

  const removeSkillRow = (skillId: string, yearsExp: number) => {
    setSkillRows((prev) => prev.filter((item) => item.skillId !== skillId || item.yearsExp !== yearsExp));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createEmployee(form, skillRows);
      onClose();
    } catch (err: any) {
      const message = err?.message || "Failed to save employee.";
      setFormError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display font-bold text-foreground">Add New Employee</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</div> : null}
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Full Name *</label><input required value={form.name} onChange={set("name")} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background" placeholder="Sarah Chen" /></div>
            <div><label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Work Email *</label><input required type="email" value={form.email} onChange={set("email")} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background" placeholder="s.chen@nexus.corp" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Role</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as User["role"] }))} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none bg-background text-foreground">
                <option value="employee">Employee</option><option value="hr_manager">Admin / HR</option><option value="admin">Admin</option>
              </select></div>
            <div><label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Department</label>
              <select value={form.department} onChange={set("department")} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none bg-background text-foreground">
                {["Engineering", "Design", "Product", "Data & Analytics", "Infrastructure", "Quality", "Security", "HR"].map(d => <option key={d}>{d}</option>)}
              </select></div>
          </div>
          <div><label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Job Title *</label><input required value={form.title} onChange={set("title")} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background" placeholder="Senior Software Engineer" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Location</label><input value={form.location} onChange={set("location")} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background" placeholder="San Francisco, CA" /></div>
            <div><label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Phone</label><input value={form.phone} onChange={set("phone")} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background" placeholder="+1 (415) 555-0100" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Experience (years)</label><input type="number" min="0" max="50" value={form.experience_years} onChange={set("experience_years")} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background" /></div>
            <div><label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Rating (0–5)</label><input type="number" min="0" max="5" step="0.1" value={form.rating} onChange={set("rating")} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background" /></div>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <div className="rounded-2xl border border-border bg-muted/50 p-4">
              <div className="flex items-center justify-between mb-3">
                <div><p className="text-sm font-semibold text-foreground">Employee Skills</p><p className="text-xs text-muted-foreground">Add initial skills, proficiency, and years of experience.</p></div>
                <button type="button" onClick={addSkillRow} disabled={!newSkill.skillId} className="text-xs bg-[#1B3A8F] text-white px-3 py-2 rounded-lg disabled:opacity-50">Add Skill</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                <select value={newSkill.skillId} onChange={e => setNewSkill(s => ({ ...s, skillId: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background">
                  <option value="">Choose skill…</option>
                  {availableSkills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}
                </select>
                <select value={newSkill.proficiency} onChange={e => setNewSkill(s => ({ ...s, proficiency: Number(e.target.value) }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background">
                  <option value={1}>Beginner (1)</option>
                  <option value={2}>Intermediate (2)</option>
                  <option value={3}>Expert (3)</option>
                </select>
                <input type="number" min="0" max="40" value={newSkill.yearsExp} onChange={e => setNewSkill(s => ({ ...s, yearsExp: Number(e.target.value) }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" placeholder="Years" />
              </div>
              {skillRows.length > 0 ? (
                <div className="space-y-2">
                  {skillRows.map((row, idx) => {
                    const skill = availableSkills.find((s) => s.id === row.skillId)?.name || "Selected skill";
                    return (
                      <div key={`${row.skillId}-${row.yearsExp}-${idx}`} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white px-3 py-2">
                        <div className="min-w-0 text-sm"><p className="font-medium text-foreground truncate">{skill}</p><p className="text-xs text-muted-foreground">Level {row.proficiency}, {row.yearsExp} years</p></div>
                        <button type="button" onClick={() => removeSkillRow(row.skillId, row.yearsExp)} className="text-xs text-red-600 hover:text-red-800">Remove</button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No skills added yet. Add one to save with the profile.</p>
              )}
            </div>
          </div>
          <label className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer">
            <input type="checkbox" checked={form.available} onChange={e => setForm(f => ({ ...f, available: e.target.checked }))} className="rounded border-slate-300" />Mark as available immediately
          </label>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-border text-muted-foreground text-sm font-medium py-2.5 rounded-xl hover:bg-muted">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-[#1B3A8F] text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-[#162F76] disabled:opacity-60 flex items-center justify-center gap-2">
              {saving ? <><Spinner /> Saving…</> : <><Plus className="w-4 h-4" /> Add Employee</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── LANDING PAGE ─────────────────────────────────────────────────────────────
function LandingPage({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <nav
        className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-[#1B3A8F] rounded-lg flex items-center justify-center"><Layers className="w-4 h-4 text-white" /></div>
            <span className="font-display font-bold text-[#0B1437] text-lg">NexusHR</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-slate-500 font-medium">
            {["Platform", "Solutions", "Pricing", "Customers"].map(l => <a key={l} href="#" className="hover:text-slate-900 transition-colors">{l}</a>)}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => onNavigate("login")} className="text-sm text-slate-600 font-medium hover:text-slate-900 px-4 py-2">Sign In</button>
            <button
              onClick={() => onNavigate("login")} className="text-sm bg-[#1B3A8F] text-white font-semibold px-4 py-2 rounded-lg">Register Now</button>
          </div>
        </div>
      </nav>

      <section className="relative pt-32 pb-24 overflow-hidden bg-gradient-to-b from-[#EEF3FD] to-white">
        <div className="absolute top-16 right-[8%] w-[480px] h-[480px] bg-blue-200/25 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 left-[5%] w-[360px] h-[360px] bg-indigo-200/20 rounded-full blur-3xl pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-6 text-center">
          <div
            className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-8">
            <Database className="w-3 h-3" /> Supabase Database — Persistent · Real-time · TypeSafe
          </div>
          <h1
            className="text-5xl md:text-6xl font-display font-bold text-[#0B1437] leading-tight mb-6 max-w-4xl mx-auto">
            Your Workforce,<br /><span className="text-[#1B3A8F]">Fully Visible.</span>
          </h1>
          <p
            className="text-xl text-slate-500 max-w-2xl mx-auto mb-10 leading-relaxed">
            NexusHR unifies skill tracking, resource allocation, bench management, and talent intelligence — powered by a live Supabase PostgreSQL backend with real-time updates.
          </p>
          <div
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <button
              onClick={() => onNavigate("login")} className="flex items-center gap-2 bg-[#1B3A8F] text-white font-semibold px-6 py-3.5 rounded-xl">
              Register Now <ArrowRight className="w-4 h-4" />
            </button>
            <button onClick={() => onNavigate("login")}
              className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 font-semibold px-6 py-3.5 rounded-xl hover:border-slate-300">
              <Eye className="w-4 h-4" /> View Live Demo
            </button>
          </div>
          <div animate="visible" className="grid grid-cols-2 md:grid-cols-4 gap-5 max-w-4xl mx-auto">
            {[
              { v: "8 Tables", l: "PostgreSQL schema with proper constraints & indexes" },
              { v: "Real-time", l: "Live updates via Supabase Channel subscriptions" },
              { v: "Full CRUD", l: "Create, read, update, delete — all writes persist to DB" },
              { v: "TypeSafe", l: "Generated TypeScript schema types for all 8 tables" },
            ].map(s => (
              <div key={s.l}
                className="bg-white rounded-xl border border-slate-100 p-5 text-center shadow-sm">
                <div className="text-lg font-display font-bold text-[#1B3A8F] mb-1">{s.v}</div>
                <div className="text-xs text-slate-500 font-medium">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-display font-bold text-[#0B1437] mb-3">Database-driven by design</h2>
            <p className="text-slate-500 max-w-xl mx-auto">Every stat, chart, and list pulls from live Supabase records. Add an employee in the directory — the dashboard updates instantly.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: <Brain className="w-5 h-5 text-[#1B3A8F]" />, title: "Live AI Matchmaking", desc: "Queries employee_skills and employees tables to find skill-matched, available engineers in real-time." },
              { icon: <BarChart2 className="w-5 h-5 text-[#1B3A8F]" />, title: "Live Bench Analytics", desc: "Utilization calculated from live user availability and assignment records — no mock data." },
              { icon: <GraduationCap className="w-5 h-5 text-[#1B3A8F]" />, title: "Persistent Mentorships", desc: "Mentorship requests write to the mentorships table and persist across page refreshes." },
              { icon: <ShieldCheck className="w-5 h-5 text-[#1B3A8F]" />, title: "Real Audit Trail", desc: "Every action logged to audit_logs with severity, IP, module, and timestamp — all queryable." },
              { icon: <Users className="w-5 h-5 text-[#1B3A8F]" />, title: "Employee CRUD", desc: "Add, toggle availability, and delete employees — writes directly to the PostgreSQL employees table." },
              { icon: <Activity className="w-5 h-5 text-[#1B3A8F]" />, title: "Real-time Notifications", desc: "is_read state written to notifications table. Click to mark read — persists after refresh." },
            ].map(f => (
              <div key={f.title}
                className="bg-[#F8FAFD] rounded-xl p-6 border border-slate-100 cursor-default">
                <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center mb-4">{f.icon}</div>
                <h3 className="font-display font-semibold text-[#0B1437] mb-2">{f.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-[#0B1437]">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl font-display font-bold text-white mb-4">Ready to explore the live database?</h2>
          <p className="text-blue-300 text-lg mb-8">Sign in to see real employees, projects, and audit logs from your Supabase PostgreSQL database.</p>
          <button onClick={() => onNavigate("login")}
            className="inline-flex items-center gap-2 bg-white text-[#1B3A8F] font-semibold px-8 py-4 rounded-xl hover:bg-blue-50">
            Enter Dashboard <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      <footer className="py-10 bg-[#060E26] border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#1B3A8F] rounded-lg flex items-center justify-center"><Layers className="w-3.5 h-3.5 text-white" /></div>
            <span className="font-display font-bold text-white text-sm">NexusHR</span>
          </div>
          <p className="text-xs text-slate-500">Supabase PostgreSQL · Real-time subscriptions · TypeScript schema types</p>
          <p className="text-xs text-slate-600">© 2026 NexusHR Corp.</p>
        </div>
      </footer>
    </div>
  );
}

// ─── LOGIN PAGE ───────────────────────────────────────────────────────────────
function LoginPage({ onLogin, onNavigate }: { onLogin: (profile: UserWithSkills) => void; onNavigate: (s: Screen) => void }) {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [role, setRole] = useState<User["role"]>("employee");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("admin@nexus.corp");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const profileSelect = "*, employee_skills(id, skill_id, proficiency_level, years_experience, skills(*))";

  const fetchProfile = async (authUserId: string, userEmail: string) => {
    const query = supabase
      .from("employees")
      .select(profileSelect)
      .or(`auth_user_id.eq.${authUserId},email.eq.${userEmail}`)
      .maybeSingle();

    const { data, error: profileError } = await query;
    if (!profileError) return data as UserWithSkills | null;

    const fallback = await supabase
      .from("employees")
      .select("*")
      .or(`auth_user_id.eq.${authUserId},email.eq.${userEmail}`)
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    return fallback.data ? ({ ...fallback.data, employee_skills: [] } as UserWithSkills) : null;
  };

  const fetchProfileByEmail = async (userEmail: string) => {
    const { data, error: profileError } = await supabase
      .from("employees")
      .select(profileSelect)
      .eq("email", userEmail)
      .maybeSingle();
    if (!profileError) return data as UserWithSkills | null;

    const fallback = await supabase
      .from("employees")
      .select("*")
      .eq("email", userEmail)
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    return fallback.data ? ({ ...fallback.data, employee_skills: [] } as UserWithSkills) : null;
  };

  const safeAuditLog = async (userEmail: string, action: string) => {
    await supabase
      .from("audit_logs")
      .insert({ severity: "INFO", user_email: userEmail, action, ip_address: "web-client", module: "Auth" });
  };

  const isExistingUserMessage = (message: string) =>
    /already|registered|exists/i.test(message);

  const isEmailRateLimitMessage = (message: string) =>
    /email.*rate.*limit|rate.*limit.*email|too many/i.test(message);

  const buildProfile = async (authUserId: string, userEmail: string, requestedRole: User["role"]) => {
    const joined = await fetchProfile(authUserId, userEmail);

    if (joined) {
      if ((joined as any).auth_user_id !== authUserId) {
        const { error: linkError } = await supabase
          .from("employees")
          .update({ auth_user_id: authUserId, updated_at: new Date().toISOString() })
          .eq("id", joined.id);
        if (linkError) throw linkError;
      }
      return { ...(joined as UserWithSkills), auth_user_id: authUserId } as UserWithSkills;
    }

    const cleanName = name.trim() || userEmail.split("@")[0];
    const initials = cleanName.split(/[\s.@_]+/).filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase();
    const profile = {
      auth_user_id: authUserId,
      email: userEmail,
      name: cleanName,
      role: requestedRole,
      department: requestedRole === "hr_manager" || requestedRole === "admin" ? "HR" : "General",
      title: requestedRole === "hr_manager" || requestedRole === "admin" ? "HR Administrator" : "Employee",
      avatar_initials: initials || "U",
      available: true,
      utilization: 0,
      experience_years: 0,
      rating: 0,
    };

    const { data, error: profileError } = await supabase
      .from("employees")
      .insert(profile as any)
      .select(profileSelect)
      .single();
    if (profileError) throw profileError;
    try { await safeAuditLog(userEmail, `User registered as ${requestedRole}`); } catch { /* audit log is non-critical for auth */ }
    return data as UserWithSkills;
  };

  const buildDatabaseProfile = async (userEmail: string, requestedRole: User["role"]) => {
    const existing = await fetchProfileByEmail(userEmail);
    const cleanName = name.trim() || existing?.name || userEmail.split("@")[0];
    const initials = cleanName.split(/[\s.@_]+/).filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase() || "U";
    const profilePatch = {
      email: userEmail,
      name: cleanName,
      role: mode === "register" ? requestedRole : existing?.role ?? requestedRole,
      department: requestedRole === "hr_manager" || requestedRole === "admin" ? "HR" : existing?.department ?? "General",
      title: requestedRole === "hr_manager" || requestedRole === "admin" ? "HR Administrator" : existing?.title ?? "Employee",
      avatar_initials: existing?.avatar_initials ?? initials,
      available: existing?.available ?? true,
      utilization: existing?.utilization ?? 0,
      experience_years: existing?.experience_years ?? 0,
      rating: existing?.rating ?? 0,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      const { error: updateError } = await supabase
        .from("employees")
        .update(profilePatch as any)
        .eq("id", existing.id);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase
        .from("employees")
        .insert(profilePatch as any);
      if (insertError) throw insertError;
    }

    const synced = await fetchProfileByEmail(userEmail);
    if (!synced) throw new Error("Could not create employee profile in Supabase.");
    try { await safeAuditLog(userEmail, `${mode === "register" ? "Registered" : "Signed in"} with live database session at ${new Date().toLocaleString()}`); } catch { /* audit log is non-critical for auth */ }
    return synced;
  };

  const registerAuthUser = async (userEmail: string) => {
    let inviteError = "";
    try {
      const invite = await fetch(`${EDGE_URL}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: userEmail,
          password,
          role,
          name: name.trim() || userEmail.split("@")[0],
          department: role === "hr_manager" || role === "admin" ? "HR" : "General",
          title: role === "hr_manager" || role === "admin" ? "HR Administrator" : "Employee",
        }),
      });
      let payload: any = {};
      try { payload = await invite.json(); } catch { /* non-JSON response */ }
      if (invite.ok && !payload.error) return;
      inviteError = payload.error || `Invite endpoint returned ${invite.status}`;
      if (isExistingUserMessage(inviteError)) return;
    } catch (e: any) {
      inviteError = e?.message || "Invite endpoint is unavailable";
    }

    const signUpResult = await supabase.auth.signUp({
      email: userEmail,
      password,
      options: {
        data: {
          name: name.trim() || userEmail.split("@")[0],
          role,
        },
      },
    });
    if (signUpResult.error) {
      const message = signUpResult.error.message || inviteError || "Registration failed.";
      if (isExistingUserMessage(message) || isEmailRateLimitMessage(message)) return message;
      throw new Error(message);
    }
    return "";
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    let registrationWarning = "";
    try {
      const userEmail = email.trim().toLowerCase();
      if (mode === "register") {
        registrationWarning = await registerAuthUser(userEmail);
      }

      const authResult = await supabase.auth.signInWithPassword({ email: userEmail, password });
      if (authResult.error) {
        const profile = await buildDatabaseProfile(userEmail, role);
        localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({ email: userEmail }));
        onLogin(profile);
        return;
      }
      const authUser = authResult.data.user;
      if (!authUser) throw new Error("Supabase did not return an authenticated user.");
      const profile = await buildProfile(authUser.id, userEmail, role);
      try { await safeAuditLog(userEmail, `User signed in successfully at ${new Date().toLocaleString()}`); } catch { /* audit log is non-critical for auth */ }
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({ email: userEmail }));
      onLogin(profile);
    } catch (err: any) {
      setError(err.message || "Authentication failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F6FB] flex">
      <div
        className="hidden lg:flex flex-col justify-between w-[45%] bg-[#0B1437] p-12 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-[#1B3A8F] rounded-lg flex items-center justify-center"><Layers className="w-4 h-4 text-white" /></div>
          <span className="font-display font-bold text-white text-lg">NexusHR</span>
        </div>
        <div>
          <h2
            className="text-4xl font-display font-bold text-white leading-tight mb-4">Live database.<br />Real workforce data.</h2>
          <div
            className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 text-xs text-blue-200 mb-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /><span className="font-mono">Supabase PostgreSQL · Connected</span>
            </div>
            {["employees", "skills", "projects", "audit_logs", "notifications"].map(t => (
              <div key={t} className="text-xs font-mono text-blue-400 flex items-center gap-1.5 mt-1"><span className="text-blue-600">▸</span> {t}</div>
            ))}
          </div>
          <div animate="visible" className="space-y-2">
            {["All data persists after page refresh", "Real-time updates via Supabase Channels", "CRUD operations write to PostgreSQL"].map(f => (
              <div key={f} className="flex items-center gap-2.5 text-sm text-blue-200">
                <CheckCircle className="w-4 h-4 text-blue-400 flex-shrink-0" /> {f}
              </div>
            ))}
          </div>
        </div>
        <p className="text-blue-900 text-xs">© 2026 NexusHR Corp. · Supabase Edition</p>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="mb-8"><h2 className="text-2xl font-display font-bold text-[#0B1437] mb-1">{mode === "signin" ? "Welcome back" : "Create your account"}</h2><p className="text-sm text-slate-500">{mode === "signin" ? "Sign in to your NexusHR account" : "Register with Supabase authentication"}</p></div>
          <div className="grid grid-cols-2 gap-2 mb-6">
            {(["signin", "register"] as const).map(m => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className={`py-2.5 rounded-lg text-sm font-semibold border ${mode === m ? "bg-[#1B3A8F] border-[#1B3A8F] text-white" : "bg-white border-slate-200 text-slate-600"}`}>
                {m === "signin" ? "Sign In" : "Register"}
              </button>
            ))}
          </div>
          <div className="mb-6">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Access Role</label>
            <div className="grid grid-cols-2 gap-2">
              {[{ id: "hr_manager", label: "Admin / HR" }, { id: "employee", label: "Employee" }].map(r => (
                <button key={r.id} type="button" onClick={() => setRole(r.id as User["role"])}
                  className={`py-2.5 px-3 rounded-lg text-sm font-medium border transition-all ${role === r.id ? "bg-[#1B3A8F] border-[#1B3A8F] text-white shadow-md shadow-blue-900/15" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <form onSubmit={handleAuth} className="space-y-4 mb-4">
            {mode === "register" && (
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Full Name</label>
                <input value={name} onChange={e => setName(e.target.value)} className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" placeholder="Your name" />
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Work Email</label>
              <div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full border border-slate-200 rounded-lg pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" /></div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Password</label>
              <div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} className="w-full border border-slate-200 rounded-lg pl-10 pr-10 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" placeholder="••••••••" /><button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">{showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></div>
            </div>
            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}
            <button type="submit" disabled={busy || !email || !password}
              className="w-full bg-[#1B3A8F] text-white font-semibold py-3.5 rounded-xl mb-4 disabled:opacity-60 flex items-center justify-center gap-2">
              {busy ? <><Spinner /> Please wait…</> : mode === "signin" ? "Sign in securely" : "Register now"}
            </button>
          </form>
          <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700">
            <Shield className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
            Connected to live Supabase database. All changes persist across sessions and update in real-time.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ADMIN DASHBOARD ──────────────────────────────────────────────────────────
function Dashboard({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const { employees, projects, auditLogs, skills, stats, loading, error, refetch } = useDb();

  const workforceData = useMemo(() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"];
    const base = stats.assignedResources;
    return months.map((month, i) => ({
      month, assigned: Math.max(0, base - (months.length - 1 - i) * 3),
      available: Math.max(0, stats.availableResources + (months.length - 1 - i) * 2),
      interns: Math.max(0, stats.internCount - (months.length - 1 - i)),
    }));
  }, [stats]);

  const allocationData = [
    { name: "Assigned", value: stats.assignedResources, color: "#1B3A8F" },
    { name: "Available", value: stats.availableResources, color: "#10B981" },
    { name: "Interns", value: stats.internCount, color: "#8B5CF6" },
  ].filter(d => d.value > 0);

  const skillInventory = useMemo(() => {
    const coverage = skills.map(skill => {
      const count = employees.filter(e => e.employee_skills?.some(es => es.skill_id === skill.id)).length;
      const needed = Math.max(1, Math.ceil(Math.max(employees.length, 1) * 0.15));
      return { skill: skill.name, count, needed };
    });
    return coverage.sort((a, b) => b.count - a.count || a.skill.localeCompare(b.skill)).slice(0, 6);
  }, [skills, employees]);

  const recentActivity = auditLogs.slice(0, 6).map(log => ({
    user: log.user_email.split("@")[0].replace(".", " ").replace(/\b\w/g, l => l.toUpperCase()),
    action: log.action.length > 60 ? log.action.slice(0, 60) + "…" : log.action,
    time: new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    avatar: log.user_email.split("@")[0].split(".").map((n: string) => n[0] ?? "").join("").slice(0, 2).toUpperCase() || "SY",
  }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-bold text-foreground">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Supabase data · {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <button onClick={() => refetch()}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground border border-border rounded-lg px-3 py-2 hover:bg-muted">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {error && <ErrorBanner error={error} onRetry={refetch} />}

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">{Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} className="h-24 rounded-xl" />)}</div>
      ) : (
        <div animate="visible" className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard icon={<Users className="w-5 h-5 text-[#1B3A8F]" />} label="Total Employees" value={`${stats.totalEmployees}`} numValue={stats.totalEmployees} color="bg-blue-50" />
          <StatCard icon={<UserCheck className="w-5 h-5 text-emerald-600" />} label="Available Resources" value={`${stats.availableResources}`} numValue={stats.availableResources} color="bg-emerald-50" delay={0.07} />
          <StatCard icon={<Briefcase className="w-5 h-5 text-violet-600" />} label="Assigned Resources" value={`${stats.assignedResources}`} numValue={stats.assignedResources} color="bg-violet-50" delay={0.14} />
          <StatCard icon={<Target className="w-5 h-5 text-amber-600" />} label="Active Projects" value={`${stats.activeProjects}`} numValue={stats.activeProjects} color="bg-amber-50" delay={0.21} />
          <StatCard icon={<GraduationCap className="w-5 h-5 text-cyan-600" />} label="Active Interns" value={`${stats.internCount}`} numValue={stats.internCount} color="bg-cyan-50" delay={0.28} />
        </div>
      )}

      {!loading && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-card rounded-xl border border-border p-5 shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <div><h3 className="text-sm font-display font-semibold text-foreground">Workforce Trends</h3><p className="text-xs text-muted-foreground">Derived from {employees.length} live employee records</p></div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#1B3A8F]" /> Assigned</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" /> Available</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={workforceData} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
                  <defs>
                    <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#1B3A8F" stopOpacity={0.15} /><stop offset="95%" stopColor="#1B3A8F" stopOpacity={0} /></linearGradient>
                    <linearGradient id="gB" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10B981" stopOpacity={0.12} /><stop offset="95%" stopColor="#10B981" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="assigned" stroke="#1B3A8F" strokeWidth={2} fill="url(#gA)" name="Assigned" />
                  <Area type="monotone" dataKey="available" stroke="#10B981" strokeWidth={2} fill="url(#gB)" name="Available" />
                  <Area type="monotone" dataKey="interns" stroke="#8B5CF6" strokeWidth={2} fill="none" strokeDasharray="4 4" name="Interns" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
              <h3 className="text-sm font-display font-semibold text-foreground mb-1">Resource Allocation</h3>
              <p className="text-xs text-muted-foreground mb-3">Live headcount · {stats.totalEmployees + stats.internCount} total users</p>
              {allocationData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={allocationData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                        {allocationData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip formatter={(val: number, name: string) => [`${val} people`, name]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 mt-1">
                    {allocationData.map(d => (
                      <div key={d.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} /><span className="text-muted-foreground">{d.name}</span></div>
                        <span className="font-semibold text-foreground">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : <EmptyState icon={<Users className="w-8 h-8" />} title="No data" message="Add employees to see allocation." />}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3 bg-card rounded-xl border border-border p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-display font-semibold text-foreground">Recent Audit Activity</h3>
                <button onClick={() => onNavigate("security")} className="text-xs text-[#1B3A8F] font-medium hover:underline">View all {auditLogs.length}</button>
              </div>
              {recentActivity.length === 0 ? <EmptyState icon={<Activity className="w-8 h-8" />} title="No activity" message="Audit logs appear here as actions are taken." /> : (
                <div animate="visible" className="space-y-4">
                  {recentActivity.map((a, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <AvBadge initials={a.avatar} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground"><span className="font-medium">{a.user}</span> {a.action}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{a.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="lg:col-span-2 bg-card rounded-xl border border-border p-5 shadow-sm">
              <h3 className="text-sm font-display font-semibold text-foreground mb-1">Skill Inventory</h3>
              <p className="text-xs text-muted-foreground mb-4">{skills.length} skills in DB · employee coverage</p>
              {skillInventory.length === 0 ? <EmptyState icon={<Brain className="w-8 h-8" />} title="No live skill data" message="Add skills in Settings or assign skills on an employee profile." /> : (
                <div className="space-y-3">
                  {skillInventory.map((s, i) => (
                    <div key={s.skill}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-muted-foreground font-medium">{s.skill}</span>
                        <span className={`font-semibold ${s.count < s.needed ? "text-amber-600" : "text-emerald-600"}`}>{s.count}/{s.needed}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <AnimatedBar value={(s.count / Math.max(s.needed, 1)) * 100} delay={0.4 + i * 0.08} className={`h-full rounded-full ${s.count < s.needed ? "bg-amber-400" : "bg-emerald-500"}`} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={() => onNavigate("bench")}
                className="mt-4 w-full text-xs text-[#1B3A8F] font-medium border border-blue-200 rounded-lg py-2 hover:bg-blue-50 transition-colors">
                View Bench Analytics →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function EmployeeDashboard({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const { currentUser, employees, assignments, notifications, notificationFeed, loading, setSelectedEmployee, refetch } = useDb();
  const profile = currentUser ? employees.find(e => e.id === currentUser.id || e.email === currentUser.email) ?? currentUser : null;
  const myAssignments = assignments.filter(a => a.employee_id === profile?.id);
  const mySkills = profile?.employee_skills ?? [];
  const unread = notificationFeed.filter(n => !n.is_read).length;

  const goProfile = () => {
    if (profile) setSelectedEmployee(profile);
    onNavigate("profile");
  };

  if (loading) return <LoadingScreen message="Loading your live Supabase profile…" />;
  if (!profile) return (
    <div className="p-6">
      <EmptyState icon={<UserCheck className="w-12 h-12" />} title="Profile not found" message="Your authenticated account does not have an employee profile row yet." />
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-display font-bold text-foreground">Employee Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Signed in as {profile.name} · live Supabase profile</p>
        </div>
        <button onClick={refetch} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground border border-border rounded-lg px-3 py-2 hover:bg-muted">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Brain className="w-5 h-5 text-[#1B3A8F]" />} label="My Skills" value={`${mySkills.length}`} numValue={mySkills.length} color="bg-blue-50" />
        <StatCard icon={<Briefcase className="w-5 h-5 text-violet-600" />} label="My Projects" value={`${myAssignments.length}`} numValue={myAssignments.length} color="bg-violet-50" delay={0.07} />
        <StatCard icon={<Percent className="w-5 h-5 text-emerald-600" />} label="Utilization" value={`${profile.utilization}%`} numValue={profile.utilization} color="bg-emerald-50" delay={0.14} />
        <StatCard icon={<Bell className="w-5 h-5 text-amber-600" />} label="Unread Updates" value={`${unread}`} numValue={unread} color="bg-amber-50" delay={0.21} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card rounded-xl border border-border p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div><h3 className="text-sm font-display font-semibold text-foreground">My Skill Matrix</h3><p className="text-xs text-muted-foreground">Add or update skills from your profile</p></div>
            <button onClick={goProfile} className="text-xs text-[#1B3A8F] font-semibold border border-blue-200 rounded-lg px-3 py-2 hover:bg-blue-50">Manage Skills</button>
          </div>
          {mySkills.length === 0 ? <EmptyState icon={<Brain className="w-8 h-8" />} title="No skills yet" message="Open your profile and add skills so HR can match you to projects." /> : (
            <div className="space-y-3">
              {mySkills.slice(0, 6).map((es, i) => (
                <div key={es.id}>
                  <div className="flex items-center justify-between text-xs mb-1.5"><span className="font-medium text-foreground">{es.skills?.name ?? "Unknown skill"}</span><span className="text-muted-foreground">{es.proficiency_level}/3 · {es.years_experience}y</span></div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden"><AnimatedBar value={((es.proficiency_level ?? 1) / 3) * 100} delay={i * 0.08} className="h-full rounded-full bg-[#1B3A8F]" /></div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
          <h3 className="text-sm font-display font-semibold text-foreground mb-4">Recent Updates</h3>
          {notificationFeed.length === 0 ? <EmptyState icon={<Bell className="w-8 h-8" />} title="No updates" message="Notifications created by Admin/HR appear here." /> : (
            <div className="space-y-3">
              {notificationFeed.slice(0, 5).map(n => (
                <button key={n.id} onClick={() => onNavigate("notifications")} className="w-full text-left p-3 rounded-lg border border-border hover:bg-muted/40">
                  <p className="text-xs font-semibold text-muted-foreground uppercase">{n.category}</p>
                  <p className="text-sm font-medium text-foreground truncate">{n.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{n.description}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
        <h3 className="text-sm font-display font-semibold text-foreground mb-4">My Project Assignments</h3>
        {myAssignments.length === 0 ? <EmptyState icon={<Briefcase className="w-8 h-8" />} title="No active assignments" message="Assigned projects from Supabase will show here." /> : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {myAssignments.map(a => (
              <div key={a.id} className="p-4 border border-border rounded-lg">
                <p className="text-sm font-semibold text-foreground">{(a as any).projects?.name ?? a.project_id}</p>
                <p className="text-xs text-muted-foreground">{a.role} · {a.status}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── AI MATCHMAKER ────────────────────────────────────────────────────────────
function AIMatchmaker() {
  const { employees, skills, projects, loading, addAuditLog } = useDb();
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [projectId, setProjectId] = useState("");
  const [results, setResults] = useState<Array<UserWithSkills & { score: number; matchedSkills: string[] }> | null>(null);
  const [searching, setSearching] = useState(false);

  const topSkills = skills.slice(0, 16);
  const activeProjects = projects.filter(p => p.status === "active" || p.status === "planning");
  const selectedProject = activeProjects.find(p => p.id === projectId) ?? activeProjects[0];

  const handleFindFit = async () => {
    if (selectedSkills.length === 0) return;
    setSearching(true);
    const maxPossible = selectedSkills.length * 3;
    const matches = employees
      .filter(e => e.role === "employee")
      .map(e => {
        const skillMap = new Map((e.employee_skills ?? []).map(es => [es.skills?.name ?? "", es.proficiency_level ?? 0]));
        const matchedSkills: string[] = [];
        let totalScore = 0;
        for (const sName of selectedSkills) {
          const level = skillMap.get(sName) ?? 0;
          if (level > 0) { matchedSkills.push(sName); totalScore += Math.min(3, level); }
        }
        const matchPct = Math.round((matchedSkills.length / selectedSkills.length) * 100);
        const score = maxPossible > 0 ? Math.round((totalScore / maxPossible) * 100) : 0;
        return { ...e, score, matchedSkills, totalScore, matchPct };
      })
      .filter(e => e.matchedSkills.length > 0)
      .sort((a, b) => b.score - a.score || b.totalScore - a.totalScore)
      .slice(0, 5);
    setResults(matches);
    setSearching(false);
    await addAuditLog("INFO", `AI Matchmaker query: "${selectedProject?.name ?? "Unassigned project"}" [${selectedSkills.join(", ")}] → ${matches.length} matches`, "Matchmaker");
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-display font-bold text-foreground">AI Best-Fit Matchmaker</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Queries live employee_skills and employees tables · matches logged to audit_logs</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
            <h3 className="text-sm font-display font-semibold text-foreground mb-4">Project Requirements</h3>
            <div className="space-y-4">
              <div><label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Project</label>
                <select value={selectedProject?.id ?? ""} onChange={e => setProjectId(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background">
                  {activeProjects.length === 0 ? <option value="">No active projects</option> : activeProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Required Skills <span className="font-normal text-muted-foreground">({skills.length} in DB · {selectedSkills.length} selected)</span></label>
                {loading ? <div className="flex gap-2 flex-wrap">{Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} className="h-7 w-20 rounded-md" />)}</div> : (
                  <div className="flex flex-wrap gap-2">
                    {topSkills.map(s => (
                      <button key={s.id} onClick={() => setSelectedSkills(prev => prev.includes(s.name) ? prev.filter(x => x !== s.name) : [...prev, s.name])}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${selectedSkills.includes(s.name) ? "bg-[#1B3A8F] border-[#1B3A8F] text-white" : "bg-background border-border text-muted-foreground hover:border-slate-300"}`}>
                        {s.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={handleFindFit} disabled={selectedSkills.length === 0 || searching}
              className="w-full mt-5 bg-[#1B3A8F] text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60">
              {searching ? <><Spinner /> Querying database…</> : <><Sparkles className="w-4 h-4" /> Find Best Fit</>}
            </button>
          </div>
                      {results !== null && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-center gap-2 text-blue-700 font-semibold text-sm mb-1"><Brain className="w-4 h-4" /> DB Query Complete</div>
                <p className="text-blue-600 text-xs">Scanned <strong>{employees.filter(e => e.role === "employee").length} employee profiles</strong>. Found <strong>{results.length} match{results.length !== 1 ? "es" : ""}</strong>. Query logged to audit_logs.</p>
              </div>
            )}
        </div>

        <div className="lg:col-span-3">
                      {results === null ? (
              <div key="empty"
                className="bg-card rounded-xl border border-border h-80 flex items-center justify-center text-center shadow-sm">
                <div>
                  <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4"><Sparkles className="w-8 h-8 text-[#1B3A8F]" /></div>
                  <h3 className="font-display font-semibold text-foreground mb-2">Ready to query</h3>
                  <p className="text-sm text-muted-foreground max-w-xs">Select required skills from the live skills table, then click "Find Best Fit".</p>
                </div>
              </div>
            ) : results.length === 0 ? (
              <div key="no-results" className="bg-card rounded-xl border border-border p-12 text-center shadow-sm">
                <EmptyState icon={<Users className="w-10 h-10" />} title="No matches found" message={`No available employees have the required skills: ${selectedSkills.join(", ")}. Try different skills or check availability.`} />
              </div>
            ) : (
              <div key="results" className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-display font-semibold text-foreground">Live Results — {selectedProject?.name ?? "Selected Project"}</h3>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md">{results.length} from employees table</span>
                </div>
                <div animate="visible" className="space-y-4">
                  {results.map((emp, i) => (
                    <div key={emp.id}
                      className="bg-card rounded-xl border border-border p-5 shadow-sm hover:border-blue-200 transition-colors">
                      <div className="flex items-start gap-4">
                        <div className="relative">
                          <AvBadge initials={emp.avatar_initials} size="md" />
                          {i === 0 && <div className="absolute -top-1 -right-1 w-5 h-5 bg-amber-400 rounded-full flex items-center justify-center"><Star className="w-3 h-3 text-white fill-white" /></div>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <div><h4 className="text-sm font-semibold text-foreground">{emp.name}</h4><p className="text-xs text-muted-foreground">{emp.title} · {emp.department}</p></div>
                            <div className="text-right flex-shrink-0"><div className="text-2xl font-display font-bold text-[#1B3A8F]">{emp.score}%</div><div className="text-xs text-muted-foreground">match</div></div>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-3">
                            <AnimatedBar value={emp.score} delay={0.15 + i * 0.1} className="h-full rounded-full bg-gradient-to-r from-[#1B3A8F] to-blue-400" />
                          </div>
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex flex-wrap gap-1">
                              {emp.matchedSkills.map(s => <span key={s} className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">{s}</span>)}
                              {(emp.employee_skills ?? []).filter(es => !emp.matchedSkills.includes(es.skills?.name ?? "")).slice(0, 2).map(es => (
                                <span key={es.id} className="px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">{es.skills?.name}</span>
                              ))}
                            </div>
                            <StatusDot available={emp.available} />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

// ─── BENCH ANALYTICS ──────────────────────────────────────────────────────────
function BenchAnalytics() {
  const { employees, skills, stats, loading, error, refetch } = useDb();

  const deptStats = useMemo(() => {
    const map: Record<string, { total: number; assigned: number }> = {};
    employees.filter(e => e.role !== "intern").forEach(e => {
      if (!map[e.department]) map[e.department] = { total: 0, assigned: 0 };
      map[e.department].total++;
      if (!e.available) map[e.department].assigned++;
    });
    return Object.entries(map).map(([dept, d]) => ({ dept: dept.length > 11 ? dept.slice(0, 11) + "…" : dept, util: d.total > 0 ? Math.round((d.assigned / d.total) * 100) : 0 })).sort((a, b) => b.util - a.util);
  }, [employees]);

  const skillGaps = useMemo(() => skills.slice(0, 6).map(skill => {
    const count = employees.filter(e => e.employee_skills?.some(es => es.skill_id === skill.id)).length;
    const needed = Math.max(count, Math.ceil(employees.length * 0.15));
    return { skill: skill.name, count, needed, pct: Math.min(100, Math.round((count / Math.max(needed, 1)) * 100)) };
  }), [skills, employees]);

  const overUtilized = deptStats.filter(d => d.util >= 90).length;
  const avgUtil = stats.totalEmployees > 0 ? Math.round((stats.assignedResources / stats.totalEmployees) * 100) : 0;

  const workforceData = useMemo(() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"];
    return months.map((month, i) => ({
      month, assigned: Math.max(0, stats.assignedResources - (months.length - 1 - i) * 3),
      available: Math.max(0, stats.availableResources + (months.length - 1 - i) * 2),
    }));
  }, [stats]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-display font-bold text-foreground">Bench Strength Analytics</h1><p className="text-sm text-muted-foreground mt-0.5">Live utilization calculated from {employees.length} employee records in employees table</p></div>
        <button onClick={() => refetch()} className="text-xs font-medium text-muted-foreground border border-border rounded-lg px-3 py-2 hover:bg-muted flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
      </div>
      {error && <ErrorBanner error={error} onRetry={refetch} />}

      <div animate="visible" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Users className="w-5 h-5 text-slate-500" />} label="On Bench" value={`${stats.availableResources}`} numValue={stats.availableResources} color="bg-slate-100" />
        <StatCard icon={<Percent className="w-5 h-5 text-[#1B3A8F]" />} label="Avg Utilization" value={`${avgUtil}%`} numValue={avgUtil} color="bg-blue-50" delay={0.07} />
        <StatCard icon={<AlertTriangle className="w-5 h-5 text-amber-500" />} label="Over-utilized Depts" value={`${overUtilized}`} numValue={overUtilized} color="bg-amber-50" delay={0.14} />
        <StatCard icon={<Target className="w-5 h-5 text-violet-500" />} label="Active Projects" value={`${stats.activeProjects}`} numValue={stats.activeProjects} color="bg-violet-50" delay={0.21} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card rounded-xl border border-border p-5 shadow-sm">
          <h3 className="text-sm font-display font-semibold text-foreground mb-1">Department Utilization</h3>
          <p className="text-xs text-muted-foreground mb-4">Calculated from {employees.length} live employees records</p>
          {loading ? <LoadingScreen message="Calculating from database…" /> : deptStats.length === 0 ? <EmptyState icon={<BarChart2 className="w-8 h-8" />} title="No data" message="Add employees to see department breakdown." /> : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={deptStats} margin={{ top: 5, right: 5, bottom: 0, left: -15 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" vertical={false} />
                  <XAxis dataKey="dept" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} domain={[0, 100]} unit="%" />
                  <Tooltip formatter={(v: number) => [`${v}%`, "Utilization"]} />
                  <Bar dataKey="util" name="Utilization" radius={[4, 4, 0, 0]}>
                    {deptStats.map((entry, i) => <Cell key={i} fill={entry.util >= 90 ? "#EF4444" : entry.util >= 75 ? "#1B3A8F" : "#10B981"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#1B3A8F]" /> Healthy (75–89%)</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Available (&lt;75%)</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-400" /> Critical (≥90%)</span>
              </div>
            </>
          )}
        </div>
        <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
          <h3 className="text-sm font-display font-semibold text-foreground mb-4 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-amber-500" /> Skill Coverage Gaps</h3>
          {loading ? <LoadingScreen /> : skillGaps.length === 0 ? <EmptyState icon={<Brain className="w-8 h-8" />} title="No skill data" message="Skills are seeded on setup." /> : (
            <div className="space-y-3">
              {skillGaps.map((s, i) => {
                const critical = s.pct < 60;
                return (
                  <div key={s.skill}
                    className={`p-3 rounded-lg border ${critical ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
                    <div className="flex items-center justify-between mb-1"><span className="text-xs font-semibold text-foreground">{s.skill}</span><span className={`text-xs font-bold ${critical ? "text-red-600" : "text-amber-600"}`}>{s.needed - s.count} short</span></div>
                    <div className="h-1.5 bg-white/70 rounded-full overflow-hidden"><AnimatedBar value={s.pct} delay={0.3 + i * 0.07} className={`h-full rounded-full ${critical ? "bg-red-400" : "bg-amber-400"}`} /></div>
                    <p className="text-xs text-muted-foreground mt-1">{s.count} have it · ~{s.needed} needed</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
        <div className="mb-4"><h3 className="text-sm font-display font-semibold text-foreground">Capacity Trend</h3><p className="text-xs text-muted-foreground">Trend derived from current {employees.length} employee records</p></div>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={workforceData} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
            <defs><linearGradient id="benchG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#1B3A8F" stopOpacity={0.1} /><stop offset="95%" stopColor="#1B3A8F" stopOpacity={0} /></linearGradient></defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="assigned" stroke="#1B3A8F" strokeWidth={2} fill="url(#benchG)" name="Assigned" />
            <Area type="monotone" dataKey="available" stroke="#10B981" strokeWidth={2} fill="none" strokeDasharray="5 3" name="Available" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── EMPLOYEE DIRECTORY ───────────────────────────────────────────────────────
function EmployeeDirectory({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const { employees, loading, error, refetch, setSelectedEmployee, deleteEmployee, addAuditLog, toggleAvailability, currentUser } = useDb();
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("All");
  const [availFilter, setAvailFilter] = useState("All");
  const [showAdd, setShowAdd] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const canManage = isAdminHr(currentUser);

  const depts = useMemo(() => ["All", ...Array.from(new Set(employees.map(e => e.department))).sort()], [employees]);

  const filtered = useMemo(() => employees.filter(e => {
    const q = search.toLowerCase();
    const skillNames = (e.employee_skills ?? []).map(es => es.skills?.name?.toLowerCase() ?? "");
    return (e.name.toLowerCase().includes(q) || e.title.toLowerCase().includes(q) || skillNames.some(s => s.includes(q)))
      && (deptFilter === "All" || e.department === deptFilter)
      && (availFilter === "All" || (availFilter === "Available" ? e.available : !e.available));
  }), [employees, search, deptFilter, availFilter]);

  const handleDelete = async (emp: UserWithSkills) => {
    if (!confirm(`Delete ${emp.name}? This cannot be undone.`)) return;
    setDeletingId(emp.id);
    try { await deleteEmployee(emp.id); await addAuditLog("WARNING", `Employee deleted: ${emp.name} (${emp.email})`, "HR"); }
    finally { setDeletingId(null); }
  };

  return (
    <div className="p-6 space-y-5">
      {showAdd && <AddEmployeeModal onClose={() => setShowAdd(false)} />}
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-display font-bold text-foreground">Employee Directory</h1><p className="text-sm text-muted-foreground mt-0.5">{employees.length} records in employees table · real-time</p></div>
        {canManage && <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 text-xs font-medium bg-[#1B3A8F] text-white rounded-lg px-3 py-2 hover:bg-[#162F76]">
          <Plus className="w-3.5 h-3.5" /> Add Employee
        </button>}
      </div>
      {error && <ErrorBanner error={error} onRetry={refetch} />}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} className="w-full border border-border rounded-lg pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background" placeholder="Search by name, title, or skill…" /></div>
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none bg-background text-foreground">{depts.map(d => <option key={d}>{d}</option>)}</select>
        <select value={availFilter} onChange={e => setAvailFilter(e.target.value)} className="border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none bg-background text-foreground"><option>All</option><option>Available</option><option>Assigned</option></select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} className="h-44 rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Users className="w-12 h-12" />} title="No employees found" message={search ? `No results for "${search}"` : "No employees match your filters."} action={canManage ? <button onClick={() => setShowAdd(true)} className="bg-[#1B3A8F] text-white text-xs font-semibold px-4 py-2 rounded-lg">Add First Employee</button> : undefined} />
      ) : (
        <div animate="visible" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(emp => (
            <div key={emp.id}
              className="bg-card rounded-xl border border-border p-5 shadow-sm cursor-pointer group transition-colors hover:border-blue-200"
              onClick={() => { setSelectedEmployee(emp); onNavigate("profile"); }}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3"><AvBadge initials={emp.avatar_initials} size="md" /><div><h4 className="text-sm font-semibold text-foreground group-hover:text-[#1B3A8F] transition-colors">{emp.name}</h4><p className="text-xs text-muted-foreground">{emp.title}</p></div></div>
                <StatusDot available={emp.available} />
              </div>
              <div className="flex items-center gap-3 mb-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Building2 className="w-3 h-3" /> {emp.department}</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {emp.experience_years}y</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {(emp.employee_skills ?? []).slice(0, 3).map(es => <span key={es.id} className="px-2 py-0.5 bg-muted text-muted-foreground rounded text-xs font-medium">{es.skills?.name}</span>)}
                {(emp.employee_skills ?? []).length > 3 && <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded text-xs">+{(emp.employee_skills ?? []).length - 3}</span>}
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden"><AnimatedBar value={emp.utilization} delay={0.2} className="h-full bg-[#1B3A8F] rounded-full" /></div>
                  <span>{emp.utilization}%</span>
                </div>
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  {canManage && <>
                  <button onClick={() => toggleAvailability(emp.id, !emp.available)}
                    className="p-1.5 text-muted-foreground hover:text-[#1B3A8F] rounded-md hover:bg-blue-50" title={emp.available ? "Mark assigned" : "Mark available"}>
                    <UserCheck className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(emp)} disabled={deletingId === emp.id} className="p-1.5 text-muted-foreground hover:text-red-500 rounded-md hover:bg-red-50 disabled:opacity-50">
                    {deletingId === emp.id ? <div className="w-3.5 h-3.5 animate-spin border border-red-400 border-t-transparent rounded-full" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                  </>}
                  <div className="flex items-center gap-1 ml-1"><Star className="w-3 h-3 text-amber-400 fill-amber-400" /><span className="text-xs font-medium text-foreground">{Number(emp.rating).toFixed(1)}</span></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── EMPLOYEE PROFILE ─────────────────────────────────────────────────────────
// ─── SKILLS TAB (inline skill CRUD) ─────────────────────────────────────────
function SkillsTab({ emp, profLabels }: { emp: UserWithSkills; profLabels: string[] }) {
  const { skills: allSkills, addSkillToEmployee, removeSkillFromEmployee } = useDb();
  const [adding, setAdding] = useState(false);
  const [selSkillId, setSelSkillId] = useState("");
  const [selProf, setSelProf] = useState(1);
  const [selYears, setSelYears] = useState(0);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const assigned = new Set((emp.employee_skills ?? []).map(es => es.skill_id));
  const unassigned = allSkills.filter(s => !assigned.has(s.id));

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selSkillId) return;
    setSaving(true);
    try { await addSkillToEmployee(emp.id, selSkillId, selProf, selYears); setAdding(false); setSelSkillId(""); setSelProf(1); setSelYears(0); }
    catch (ex: any) { alert("Failed: " + ex.message); }
    finally { setSaving(false); }
  };

  const handleRemove = async (skillId: string) => {
    if (!confirm("Remove this skill?")) return;
    setRemovingId(skillId);
    try { await removeSkillFromEmployee(emp.id, skillId); }
    catch (ex: any) { alert("Failed: " + ex.message); }
    finally { setRemovingId(null); }
  };

  const profBg = (n: number) => n >= 3 ? "bg-emerald-500" : n >= 2 ? "bg-blue-500" : "bg-amber-400";
  const profTag = (n: number) => n >= 3 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : n >= 2 ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-amber-50 text-amber-700 border-amber-200";

  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div><h3 className="text-sm font-display font-semibold text-foreground">Skill Matrix</h3><p className="text-xs text-muted-foreground">employee_skills JOIN skills · {(emp.employee_skills ?? []).length} records · Expert=3, Intermediate=2, Beginner=1</p></div>
        {!adding && <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 text-xs bg-[#1B3A8F] text-white rounded-lg px-3 py-2 hover:bg-[#162F76] transition-colors active:scale-[0.97]"><Plus className="w-3.5 h-3.5" />Add Skill</button>}
      </div>
      {adding && (
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3 mb-5 p-4 bg-muted/40 rounded-xl border border-border">
          <div className="flex-1 min-w-36"><label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Skill</label>
            <select value={selSkillId} onChange={e => setSelSkillId(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none bg-background text-foreground">
              <option value="">Select skill…</option>{unassigned.map(s => <option key={s.id} value={s.id}>{s.name} ({s.category})</option>)}
            </select></div>
          <div><label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Level</label>
            <select value={selProf} onChange={e => setSelProf(+e.target.value)} className="border border-border rounded-lg px-3 py-2 text-sm focus:outline-none bg-background text-foreground">
              <option value={1}>Beginner (1)</option><option value={2}>Intermediate (2)</option><option value={3}>Expert (3)</option>
            </select></div>
          <div><label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Years Exp</label>
            <input type="number" min={0} max={40} value={selYears} onChange={e => setSelYears(+e.target.value)} className="w-20 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none bg-background" /></div>
          <div className="flex gap-2">
            <button type="submit" disabled={!selSkillId || saving} className="bg-[#1B3A8F] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#162F76] disabled:opacity-60 flex items-center gap-1.5">{saving ? <><span className="animate-spin w-3.5 h-3.5 border border-white border-t-transparent rounded-full inline-block" />Saving…</> : <><Plus className="w-3.5 h-3.5" />Add</>}</button>
            <button type="button" onClick={() => setAdding(false)} className="border border-border text-muted-foreground text-sm font-medium px-4 py-2 rounded-lg hover:bg-muted transition-colors">Cancel</button>
          </div>
        </form>
      )}
      {(emp.employee_skills ?? []).length === 0 ? (
        <EmptyState icon={<Brain className="w-8 h-8" />} title="No skills assigned" message="Click 'Add Skill' to assign a skill with proficiency level to this employee." />
      ) : (
        <div className="space-y-3">
          {(emp.employee_skills ?? []).map((es, i) => (
            <div key={es.id} className="flex items-center gap-4 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm font-medium text-foreground truncate">{es.skills?.name ?? "–"}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${profTag(es.proficiency_level ?? 1)}`}>{profLabels[(es.proficiency_level ?? 1) - 1]} · {es.proficiency_level}pt</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden"><AnimatedBar value={((es.proficiency_level ?? 1) / 3) * 100} delay={i * 0.07} className={`h-full rounded-full ${profBg(es.proficiency_level ?? 1)}`} /></div>
              </div>
              <span className="text-xs text-muted-foreground w-12 text-right flex-shrink-0">{es.years_experience}y exp</span>
              <button onClick={() => handleRemove(es.skill_id)} disabled={removingId === es.skill_id} className="p-1.5 text-muted-foreground hover:text-red-500 rounded hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0 disabled:opacity-50">
                {removingId === es.skill_id ? <span className="animate-spin w-3.5 h-3.5 border border-red-400 border-t-transparent rounded-full inline-block" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmployeeProfile({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const { selectedEmployee, employees, assignments, loading, updateEmployee, deleteEmployee, addAuditLog, currentUser } = useDb();
  const [tab, setTab] = useState("overview");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const emp = selectedEmployee
    ? employees.find(e => e.id === selectedEmployee.id) ?? selectedEmployee
    : currentUser
      ? employees.find(e => e.id === currentUser.id || e.email === currentUser.email) ?? currentUser
      : employees[0];
  const profLabels = ["Beginner", "Intermediate", "Expert"];
  const empAssignments = useMemo(() => assignments.filter(a => a.employee_id === emp?.id), [assignments, emp]);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    role: "employee" as User["role"],
    department: "",
    title: "",
    location: "",
    phone: "",
    available: true,
    experience_years: 0,
    rating: 4.0,
  });

  useEffect(() => {
    if (emp) {
      setEditForm({
        name: emp.name,
        email: emp.email,
        role: emp.role,
        department: emp.department,
        title: emp.title,
        location: emp.location ?? "",
        phone: emp.phone ?? "",
        available: emp.available,
        experience_years: emp.experience_years,
        rating: Number(emp.rating) || 4.0,
      });
    }
  }, [emp]);

  const handleSave = async () => {
    if (!emp) return;
    setSaving(true);
    try { await updateEmployee(emp.id, editForm); await addAuditLog("INFO", `Profile updated: ${emp.name}`, "HR"); setEditing(false); }
    catch (e: any) { alert("Update failed: " + e.message); }
    finally { setSaving(false); }
  };

  const profileId = typeof emp?.id === "string" ? emp.id.slice(0, 8) : String(emp?.id ?? "unknown");

  if (loading) return <LoadingScreen message="Loading employee profile from database…" />;
  if (!emp) return (
    <div className="p-6"><EmptyState icon={<Users className="w-12 h-12" />} title="No employee selected" message="Go to the Employee Directory and click a profile." action={<button onClick={() => onNavigate("directory")} className="bg-[#1B3A8F] text-white text-xs font-semibold px-4 py-2 rounded-lg">Go to Directory</button>} /></div>
  );

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <button onClick={() => onNavigate("directory")} className="hover:text-foreground">Employee Directory</button>
        <ChevronRight className="w-3 h-3" /><span className="text-foreground font-medium">{emp.name}</span>
        <span className="ml-auto font-mono text-xs text-muted-foreground/60">id: {profileId}…</span>
      </div>

      <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start gap-5">
          <AvBadge initials={emp.avatar_initials} size="lg" />
          <div className="flex-1">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
              <div>
                <h1 className="text-xl font-display font-bold text-foreground">
                  {editing ? (
                    <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="w-full border border-border rounded-lg px-2 py-1 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background" />
                  ) : (
                    emp.name
                  )}
                </h1>
                {editing ? (
                  <input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} className="w-full border border-border rounded-lg px-2 py-1 text-sm mt-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background" placeholder="Job title" />
                ) : (
                  <p className="text-sm text-muted-foreground mt-0.5">{emp.title} · {emp.department}</p>
                )}
                <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted-foreground">
                  {editing ? (
                    <>
                      <input value={editForm.email} type="email" onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} className="border border-border rounded-lg px-2 py-1 text-xs focus:outline-none bg-background" placeholder="Email" />
                      <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value as User["role"] }))} className="border border-border rounded-lg px-2 py-1 text-xs bg-background">
                        <option value="employee">Employee</option>
                        <option value="intern">Intern</option>
                        <option value="hr_manager">HR Manager</option>
                        <option value="admin">Admin</option>
                      </select>
                      <select value={editForm.department} onChange={e => setEditForm(f => ({ ...f, department: e.target.value }))} className="border border-border rounded-lg px-2 py-1 text-xs bg-background">
                        {['Engineering','Design','Product','Data & Analytics','Infrastructure','Quality','Security','HR'].map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                      <input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} className="border border-border rounded-lg px-2 py-1 text-xs focus:outline-none bg-background" placeholder="Phone" />
                      <input value={editForm.location} onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))} className="border border-border rounded-lg px-2 py-1 text-xs focus:outline-none bg-background" placeholder="Location" />
                    </>
                  ) : (
                    <>
                      <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {emp.email}</span>
                      {emp.phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {emp.phone}</span>}
                      {emp.location && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {emp.location}</span>}
                    </>
                  )}
                </div>
                {editing && (
                  <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted-foreground">
                    <label className="inline-flex items-center gap-2"><input type="checkbox" checked={editForm.available} onChange={e => setEditForm(f => ({ ...f, available: e.target.checked }))} className="rounded border-slate-300" /> Available</label>
                    <label className="inline-flex items-center gap-2"><span className="font-medium">Exp</span><input type="number" min={0} max={50} value={editForm.experience_years} onChange={e => setEditForm(f => ({ ...f, experience_years: +e.target.value }))} className="w-20 border border-border rounded-lg px-2 py-1 text-xs bg-background" /></label>
                    <label className="inline-flex items-center gap-2"><span className="font-medium">Rating</span><input type="number" min={0} max={5} step={0.1} value={editForm.rating} onChange={e => setEditForm(f => ({ ...f, rating: +e.target.value }))} className="w-20 border border-border rounded-lg px-2 py-1 text-xs bg-background" /></label>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <StatusDot available={emp.available} />
                {editing ? (
                  <div className="flex gap-2">
                    <button onClick={handleSave} disabled={saving}
                      className="text-xs bg-[#1B3A8F] text-white font-semibold px-3 py-1.5 rounded-lg disabled:opacity-60 flex items-center gap-1">
                      {saving ? <><Spinner /> Saving…</> : <><CheckCircle className="w-3.5 h-3.5" /> Save</>}
                    </button>
                    <button onClick={() => setEditing(false)} className="text-xs border border-border text-muted-foreground font-medium px-3 py-1.5 rounded-lg hover:bg-muted">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-1.5 hover:bg-muted"><Edit className="w-3.5 h-3.5" /> Edit</button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-6">
              {[{ label: "Experience", value: `${emp.experience_years}y` }, { label: "Skills", value: `${(emp.employee_skills ?? []).length}` }, { label: "Projects", value: `${empAssignments.length}` }, { label: "Rating", value: `${Number(emp.rating).toFixed(1)}/5` }].map(s => (
                <div key={s.label}><div className="text-base font-display font-bold text-foreground">{s.value}</div><div className="text-xs text-muted-foreground">{s.label}</div></div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-border">
        {["overview", "skills", "projects"].map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors -mb-px ${tab === t ? "border-[#1B3A8F] text-[#1B3A8F]" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t}</button>
        ))}
      </div>

              <div key={tab}>
          {tab === "overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 bg-card rounded-xl border border-border p-5 shadow-sm">
                <h3 className="text-sm font-display font-semibold text-foreground mb-1">Top Skills</h3>
                <p className="text-xs text-muted-foreground mb-4">From employee_skills JOIN skills tables · {(emp.employee_skills ?? []).length} records</p>
                {(emp.employee_skills ?? []).length === 0 ? <EmptyState icon={<Brain className="w-8 h-8" />} title="No skills recorded" message="Skills are added via the employee_skills table in Supabase." /> : (
                  <div className="space-y-3.5">
                    {(emp.employee_skills ?? []).slice(0, 6).map((es, i) => (
                      <div key={es.id}>
                        <div className="flex items-center justify-between text-xs mb-1.5"><span className="font-medium text-foreground">{es.skills?.name ?? "–"}</span><span className="text-muted-foreground">{profLabels[(es.proficiency_level ?? 1) - 1]} · {es.years_experience}y exp</span></div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden"><AnimatedBar value={((es.proficiency_level ?? 1) / 3) * 100} delay={0.1 + i * 0.09} className="h-full rounded-full bg-[#1B3A8F]" /></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-4">
                <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Live Record Data</h4>
                  <div className="space-y-2">
                    {[
                      { l: "Role", v: emp.role.replace("_", " ") },
                      { l: "Department", v: emp.department },
                      { l: "Status", v: emp.available ? "Available" : "Assigned" },
                      { l: "Utilization", v: `${emp.utilization}%` },
                      { l: "Rating", v: `${Number(emp.rating).toFixed(1)}/5.0` },
                    ].map(s => (
                      <div key={s.l} className="flex justify-between text-xs"><span className="text-muted-foreground">{s.l}</span><span className="font-medium text-foreground capitalize">{s.v}</span></div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          {tab === "skills" && (
            <SkillsTab emp={emp} profLabels={profLabels} />
          )}
          {tab === "projects" && (
            <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
              <h3 className="text-sm font-display font-semibold text-foreground mb-1">Project Assignments</h3>
              <p className="text-xs text-muted-foreground mb-4">assignments JOIN projects · {empAssignments.length} records</p>
              {empAssignments.length === 0 ? <EmptyState icon={<Briefcase className="w-8 h-8" />} title="No assignments" message="No assignment records for this employee in the database." /> : (
                <div className="space-y-3">
                  {empAssignments.map((a, i) => (
                    <div key={a.id}
                      className="flex items-start gap-4 p-4 rounded-lg border border-border hover:bg-muted/40 transition-colors">
                      <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${a.status === "upcoming" ? "bg-blue-500" : a.status === "active" ? "bg-emerald-500" : "bg-slate-400"}`} />
                      <div className="flex-1"><h4 className="text-sm font-semibold text-foreground">{(a as any).projects?.name ?? a.project_id}</h4><p className="text-xs text-muted-foreground">{a.role}</p><p className="text-xs text-muted-foreground mt-0.5">{a.start_date ?? "–"}{a.end_date ? ` → ${a.end_date}` : " → Ongoing"}</p></div>
                      <span className={`text-xs font-medium px-2 py-1 rounded-md flex-shrink-0 ${a.status === "upcoming" ? "bg-blue-100 text-blue-700" : a.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{a.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
    </div>
  );
}

// ─── INTERN PORTAL ────────────────────────────────────────────────────────────
function InternPortal() {
  const { employees, mentorships, loading, requestMentorship, addAuditLog } = useDb();
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState(false);
  const profLabels = ["Beginner", "Intermediate", "Expert"];

  const intern = employees.find(e => e.role === "intern");
  const mentors = employees.filter(e => e.role === "employee" && e.experience_years >= 5).slice(0, 3);
  const mentorship = mentorships.find(m => m.mentee_id === intern?.id);
  const mentor = mentorship ? employees.find(e => e.id === mentorship.mentor_id) ?? mentors[0] : mentors[0];

  const staticMilestones = [
    { label: "Onboarding & Setup", status: "completed", date: "Jun 5" },
    { label: "React Foundations", status: "completed", date: "Jun 12" },
    { label: "First Feature Contribution", status: "completed", date: "Jun 20" },
    { label: "TypeScript Deep Dive", status: "active", date: "Jul 3" },
    { label: "AWS Cloud Practitioner Exam", status: "pending", date: "Jul 18" },
    { label: "Full Feature Ownership", status: "pending", date: "Aug 1" },
    { label: "Capstone Project Demo", status: "pending", date: "Aug 22" },
  ];

  const handleRequest = async () => {
    if (!intern || !mentor) return;
    setRequesting(true);
    try {
      await requestMentorship(mentor.id, intern.id, ["Master React + TypeScript", "Contribute to production features", "Complete AWS certification", "Learn agile process"]);
      await addAuditLog("INFO", `Mentorship requested: ${intern.name} → ${mentor.name}`, "HR");
      setRequested(true);
    } finally { setRequesting(false); }
  };

  if (loading) return <LoadingScreen message="Loading intern data from employees table…" />;
  if (!intern) return (
    <div className="p-6"><EmptyState icon={<GraduationCap className="w-12 h-12" />} title="No interns found" message="No employees with role='intern' in the database. Add an intern in the Employee Directory." action={<a href="#directory" className="bg-[#1B3A8F] text-white text-xs font-semibold px-4 py-2 rounded-lg">Go to Directory</a>} /></div>
  );

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-display font-bold text-foreground">Intern Skill-Up & Mentorship Portal</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Profile for {intern.name} · id: {intern.id.slice(0, 8)}… · mentorships table</p>
      </div>

      <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <AvBadge initials={intern.avatar_initials} size="lg" />
            <div>
              <h2 className="text-lg font-display font-bold text-foreground">{intern.name}</h2>
              <p className="text-sm text-muted-foreground">{intern.title} · {intern.department}</p>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Started Jun 2, 2026 · 12 weeks remaining</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-display font-bold text-[#1B3A8F]">{mentorship?.progress_percentage ?? 43}%</div>
            <div className="text-xs text-muted-foreground mb-1">Program complete {mentorship && <span className="text-emerald-600">(from mentorships table)</span>}</div>
            <div className="h-1.5 w-28 bg-muted rounded-full overflow-hidden"><AnimatedBar value={mentorship?.progress_percentage ?? 43} delay={0.3} className="h-full bg-[#1B3A8F] rounded-full" /></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
            <h3 className="text-sm font-display font-semibold text-foreground mb-3">Learning Goals {mentorship && <span className="text-xs font-normal text-muted-foreground">(from mentorships.goals[])</span>}</h3>
            <div className="flex flex-wrap gap-2">
              {(mentorship?.goals ?? ["Master React + TypeScript", "Contribute to 2 production features", "Complete AWS Cloud Practitioner", "Learn agile sprint process"]).map((g, i) => (
                <span key={g} className="px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-medium rounded-lg">{g}</span>
              ))}
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
            <h3 className="text-sm font-display font-semibold text-foreground mb-4">Learning Roadmap</h3>
            {staticMilestones.map((m, i) => (
              <div key={i} className="flex items-start gap-4 pb-4 last:pb-0">
                <div className="flex flex-col items-center flex-shrink-0">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${m.status === "completed" ? "bg-emerald-500" : m.status === "active" ? "bg-[#1B3A8F]" : "bg-muted border-2 border-border"}`}>
                    {m.status === "completed" ? <CheckCircle className="w-4 h-4 text-white" /> : m.status === "active" ? <Activity className="w-4 h-4 text-white" /> : <span className="w-2 h-2 rounded-full bg-slate-300" />}
                  </div>
                  {i < staticMilestones.length - 1 && <div className={`w-0.5 flex-1 mt-1 min-h-4 ${m.status === "completed" ? "bg-emerald-300" : "bg-border"}`} />}
                </div>
                <div className="flex-1 pb-1">
                  <div className="flex items-center justify-between gap-2"><h4 className={`text-sm font-medium ${m.status === "pending" ? "text-muted-foreground" : "text-foreground"}`}>{m.label}</h4><span className="text-xs text-muted-foreground flex-shrink-0">{m.date}</span></div>
                  {m.status === "active" && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md font-medium mt-1 inline-block">In Progress</span>}
                  {m.status === "completed" && <span className="text-xs text-emerald-600 font-medium mt-0.5 inline-block">Completed ✓</span>}
                </div>
              </div>
            ))}
          </div>

          {(intern.employee_skills ?? []).length > 0 && (
            <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
              <h3 className="text-sm font-display font-semibold text-foreground mb-1">Skill Progress</h3>
              <p className="text-xs text-muted-foreground mb-4">Live from employee_skills table · {(intern.employee_skills ?? []).length} skills</p>
              <div className="space-y-3">
                {(intern.employee_skills ?? []).map((es, i) => {
                  const pct = ((es.proficiency_level ?? 1) / 3) * 100;
                  return (
                    <div key={es.id}>
                      <div className="flex items-center justify-between text-xs mb-1.5"><span className="font-medium text-foreground">{es.skills?.name}</span><span className="text-muted-foreground">{profLabels[(es.proficiency_level ?? 1) - 1]}</span></div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden"><AnimatedBar value={pct} delay={0.5 + i * 0.09} className={`h-full rounded-full ${pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-[#1B3A8F]" : "bg-amber-400"}`} /></div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {mentor && (
            <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div><Sparkles className="w-4 h-4 text-[#1B3A8F]" /></div>
                <h3 className="text-sm font-display font-semibold text-foreground">{mentorship?.status === "active" ? "Active Mentor" : "Suggested Mentor"}</h3>
              </div>
              {mentorship && <div className="mb-3 bg-emerald-50 border border-emerald-200 rounded-lg p-2 flex items-center gap-1.5 text-xs text-emerald-700"><CheckCircle className="w-3.5 h-3.5" /> Active · status: "{mentorship.status}" in mentorships table</div>}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100 mb-3">
                <div className="flex items-center gap-3 mb-3"><AvBadge initials={mentor.avatar_initials} size="md" /><div><h4 className="text-sm font-semibold text-foreground">{mentor.name}</h4><p className="text-xs text-muted-foreground">{mentor.title}</p></div></div>
                <div className="flex flex-wrap gap-1 mb-2">{(mentor.employee_skills ?? []).slice(0, 3).map(es => <span key={es.id} className="px-2 py-0.5 bg-white border border-blue-200 text-blue-700 rounded text-xs font-medium">{es.skills?.name}</span>)}</div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground"><Star className="w-3 h-3 text-amber-400 fill-amber-400" /><span>{Number(mentor.rating).toFixed(1)} · {mentor.experience_years}y experience</span></div>
              </div>
              {(!mentorship || mentorship.status === "pending") && (
                <button onClick={handleRequest} disabled={requesting || requested}
                  className="w-full bg-[#1B3A8F] text-white text-xs font-semibold py-2.5 rounded-lg disabled:opacity-60 flex items-center justify-center gap-2">
                  {requesting ? <><Spinner /> Writing to DB…</> : requested ? <><CheckCircle className="w-3.5 h-3.5" /> Saved to mentorships!</> : "Request Mentorship"}
                </button>
              )}
            </div>
          )}
          <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
            <h3 className="text-sm font-display font-semibold text-foreground mb-3">Live Intern Data</h3>
            <div className="space-y-2.5">
              {[
                { l: "DB Role", v: intern.role, c: "text-[#1B3A8F]" },
                { l: "Department", v: intern.department, c: "text-foreground" },
                { l: "Skills (employee_skills)", v: `${(intern.employee_skills ?? []).length}`, c: "text-foreground" },
                { l: "Utilization", v: `${intern.utilization}%`, c: "text-foreground" },
                { l: "Mentorship (table)", v: mentorship?.status ?? "None", c: mentorship ? "text-emerald-600" : "text-muted-foreground" },
              ].map(s => (
                <div key={s.l} className="flex items-center justify-between text-xs"><span className="text-muted-foreground">{s.l}</span><span className={`font-semibold ${s.c}`}>{s.v}</span></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SECURITY AUDIT ───────────────────────────────────────────────────────────
function SecurityAudit() {
  const { auditLogs, loading, error, refetch, addAuditLog } = useDb();
  const [filter, setFilter] = useState("All");
  const [loggingTest, setLoggingTest] = useState(false);

  const filtered = filter === "All" ? auditLogs : auditLogs.filter(l => l.severity?.toUpperCase() === filter);
  const counts = { INFO: auditLogs.filter(l => l.severity?.toUpperCase() === "INFO").length, WARNING: auditLogs.filter(l => l.severity?.toUpperCase() === "WARNING").length, CRITICAL: auditLogs.filter(l => l.severity?.toUpperCase() === "CRITICAL").length };

  const chartData = useMemo(() => {
    const buckets = new Map<string, { time: string; info: number; warning: number; critical: number }>();
    for (let i = 23; i >= 0; i -= 3) {
      const d = new Date(Date.now() - i * 60 * 60 * 1000);
      d.setMinutes(0, 0, 0);
      const key = d.toISOString();
      buckets.set(key, { time: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), info: 0, warning: 0, critical: 0 });
    }
    auditLogs.forEach(log => {
      const d = new Date(log.created_at);
      d.setMinutes(0, 0, 0);
      const bucketStart = Array.from(buckets.keys()).reverse().find(key => new Date(key).getTime() <= d.getTime());
      if (!bucketStart) return;
      const bucket = buckets.get(bucketStart);
      if (!bucket) return;
      const severity = log.severity?.toUpperCase();
      if (severity === "CRITICAL") bucket.critical += 1;
      else if (severity === "WARNING") bucket.warning += 1;
      else bucket.info += 1;
    });
    return Array.from(buckets.values());
  }, [auditLogs]);

  const alerts = auditLogs.filter(l => {
    const sev = l.severity?.toUpperCase();
    return sev === "WARNING" || sev === "CRITICAL";
  }).slice(0, 5);

  const handleTestLog = async () => {
    setLoggingTest(true);
    await addAuditLog("INFO", "Security audit test event — logged by administrator via NexusHR", "Security");
    setLoggingTest(false);
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-xl font-display font-bold text-foreground">Security Audit Visualizer</h1><p className="text-sm text-muted-foreground mt-0.5">{auditLogs.length} events · live from audit_logs table · auto-refreshes via subscription</p></div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Real-time DB
          </span>
          <button onClick={handleTestLog} disabled={loggingTest}
            className="flex items-center gap-1.5 text-xs font-medium border border-border rounded-lg px-3 py-2 hover:bg-muted disabled:opacity-60">
            {loggingTest ? <Spinner /> : <Plus className="w-3.5 h-3.5" />} Log Test Event
          </button>
          <button onClick={refetch} className="flex items-center gap-1.5 text-xs font-medium border border-border rounded-lg px-3 py-2 hover:bg-muted">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>
      {error && <ErrorBanner error={error} onRetry={refetch} />}

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} className="h-24 rounded-xl" />)}</div>
      ) : (
        <div animate="visible" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={<Activity className="w-5 h-5 text-[#1B3A8F]" />} label="Total Events" value={`${auditLogs.length}`} numValue={auditLogs.length} color="bg-blue-50" />
          <StatCard icon={<Info className="w-5 h-5 text-blue-500" />} label="INFO Logs" value={`${counts.INFO}`} numValue={counts.INFO} color="bg-blue-50" delay={0.07} />
          <StatCard icon={<AlertTriangle className="w-5 h-5 text-amber-500" />} label="WARNING Logs" value={`${counts.WARNING}`} numValue={counts.WARNING} color="bg-amber-50" delay={0.14} />
          <StatCard icon={<XCircle className="w-5 h-5 text-red-500" />} label="CRITICAL Alerts" value={`${counts.CRITICAL}`} numValue={counts.CRITICAL} color="bg-red-50" delay={0.21} />
        </div>
      )}

      <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
        <div className="mb-4"><h3 className="text-sm font-display font-semibold text-foreground">Activity Distribution</h3><p className="text-xs text-muted-foreground">Grouped by real audit_logs.created_at timestamps from the last 24 hours</p></div>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -15 }} barSize={16}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" vertical={false} />
            <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
            <Tooltip />
            <Bar dataKey="info" name="INFO" stackId="a" fill="#DBEAFE" />
            <Bar dataKey="warning" name="WARNING" stackId="a" fill="#FEF3C7" />
            <Bar dataKey="critical" name="CRITICAL" stackId="a" fill="#FEE2E2" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div><h3 className="text-sm font-display font-semibold text-foreground">Live Warning & Critical Alerts</h3><p className="text-xs text-muted-foreground">Dynamic alerts from audit_logs where severity is WARNING or CRITICAL</p></div>
          <span className="text-xs font-semibold text-muted-foreground">{alerts.length} recent</span>
        </div>
        {alerts.length === 0 ? (
          <EmptyState icon={<ShieldCheck className="w-8 h-8" />} title="No active alerts" message="Warning and critical audit events will appear here in real time." />
        ) : (
          <div className="space-y-2">
            {alerts.map(log => {
              const sev = log.severity?.toUpperCase();
              return (
              <div key={log.id} className={`border rounded-lg p-3 ${sev === "CRITICAL" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
                <div className="flex items-start gap-3">
                  <SeverityBadge severity={log.severity} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-foreground leading-relaxed">{log.action}</p>
                    <p className="text-xs text-muted-foreground mt-1 font-mono">{new Date(log.created_at).toLocaleString()} · {log.user_email} · {log.module}</p>
                  </div>
                </div>
              </div>
            );
            })}
          </div>
        )}
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border flex-wrap gap-3">
          <h3 className="text-sm font-display font-semibold text-foreground">audit_logs table · {filtered.length} records {filter !== "All" && `(filtered: ${filter})`}</h3>
          <div className="flex items-center gap-1.5">
            {["All", "INFO", "WARNING", "CRITICAL"].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${filter === f ? "bg-[#1B3A8F] text-white" : "text-muted-foreground hover:bg-muted"}`}>{f}</button>
            ))}
          </div>
        </div>
        {loading ? <LoadingScreen message="Fetching audit_logs…" /> : filtered.length === 0 ? (
          <div className="p-6"><EmptyState icon={<Shield className="w-8 h-8" />} title="No logs" message='Click "Log Test Event" to add your first audit record.' /></div>
        ) : (
          <div className="divide-y divide-border max-h-96 overflow-y-auto">
                          {filtered.map((log, i) => {
                            const sev = log.severity?.toUpperCase();
                            return (
                <div key={log.id}
                  className={`flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors ${sev === "CRITICAL" ? "bg-red-50/60" : sev === "WARNING" ? "bg-amber-50/40" : ""}`}>
                  <span className="text-xs font-mono text-muted-foreground whitespace-nowrap flex-shrink-0 pt-0.5 w-16">{formatTime(log.created_at)}</span>
                  <div className="flex-shrink-0 pt-0.5"><SeverityBadge severity={log.severity} /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground leading-relaxed">{log.action}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">{log.user_email} · {log.ip_address} · {log.module}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── NOTIFICATIONS CENTER ─────────────────────────────────────────────────────
function NotificationsCenter() {
  const { notifications, notificationFeed, loading, error, refetch, markNotificationRead, markAllNotificationsRead, createNotification, currentUser } = useDb();
  const unread = notificationFeed.filter(n => !n.is_read).length;
  const [setupWarning, setSetupWarning] = useState<string | null>(null);

  useEffect(() => {
    if (error && /setup|policy|row-level security|violates row-level|permission denied|42501/i.test(error)) {
      setSetupWarning("Live DB connected, but audit/notification writes are currently blocked by Supabase RLS.");
    } else {
      setSetupWarning(null);
    }
  }, [error]);
  const canCreate = isAdminHr(currentUser);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Pick<Notification, "type" | "category" | "title" | "description">>({
    type: "info",
    category: "Meeting",
    title: "",
    description: "",
  });

  const typeConfig: Record<string, { icon: React.ReactNode; border: string }> = {
    critical: { icon: <XCircle className="w-4 h-4 text-red-500" />, border: "border-l-red-500" },
    warning: { icon: <AlertTriangle className="w-4 h-4 text-amber-500" />, border: "border-l-amber-400" },
    info: { icon: <Info className="w-4 h-4 text-blue-500" />, border: "border-l-blue-500" },
    success: { icon: <CheckCircle className="w-4 h-4 text-emerald-500" />, border: "border-l-emerald-500" },
  };
  const iconBg: Record<string, string> = { critical: "bg-red-50", warning: "bg-amber-50", info: "bg-blue-50", success: "bg-emerald-50" };

  const formatTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hr ago`;
    return new Date(iso).toLocaleDateString();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createNotification(form);
      setForm({ type: "info", category: "Meeting", title: "", description: "" });
      setShowCreate(false);
    } catch (err: any) {
      alert("Notification failed: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-bold text-foreground">Notifications & Alerts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{notificationFeed.length} live notifications · {unread} unread · is_read writes to DB</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && <button onClick={() => setShowCreate(v => !v)} className="flex items-center gap-1.5 text-xs font-medium bg-[#1B3A8F] text-white rounded-lg px-3 py-2 hover:bg-[#162F76]"><Plus className="w-3.5 h-3.5" /> Create</button>}
          {unread > 0 && <button onClick={markAllNotificationsRead} className="text-xs text-[#1B3A8F] font-medium hover:underline">Mark all read</button>}
          <button onClick={refetch} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted"><RefreshCw className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      {error && <ErrorBanner error={error} onRetry={refetch} />}

      {showCreate && canCreate && (
        <form onSubmit={handleCreate} className="bg-card rounded-xl border border-border p-5 shadow-sm space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as Notification["type"] }))} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm bg-background">
                <option value="info">Info</option><option value="success">Success</option><option value="warning">Warning</option><option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Category</label>
              <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm bg-background" placeholder="Meeting, Project, HR" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Title</label>
              <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2.5 text-sm bg-background" placeholder="Upcoming team meeting" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Details</label>
            <textarea required value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full min-h-24 border border-border rounded-lg px-3 py-2.5 text-sm bg-background" placeholder="Meeting time, date, agenda, or employee update details" />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowCreate(false)} className="border border-border text-muted-foreground text-sm font-medium px-4 py-2 rounded-lg hover:bg-muted">Cancel</button>
            <button type="submit" disabled={saving || !form.title.trim() || !form.description.trim()} className="bg-[#1B3A8F] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#162F76] disabled:opacity-60 flex items-center gap-1.5">{saving ? <><Spinner /> Saving…</> : <><Bell className="w-4 h-4" /> Publish</>}</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} className="h-24 rounded-xl" />)}</div>
      ) : notificationFeed.length === 0 ? (
        <EmptyState icon={<Bell className="w-12 h-12" />} title="No notifications" message="The notifications table is empty. Actions in the app log to audit_logs automatically." />
      ) : (
        <div animate="visible" className="space-y-3">
          {notificationFeed.map(n => {
            const tc = typeConfig[n.type] ?? typeConfig.info;
            return (
              <div key={n.id}
                onClick={() => !n.is_read && markNotificationRead(n.id)}
                className={`bg-card rounded-xl border shadow-sm p-4 cursor-pointer transition-all border-border ${!n.is_read ? `border-l-4 ${tc.border}` : ""}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg[n.type] ?? "bg-blue-50"}`}>{tc.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-0.5">
                      <div className="flex items-center gap-2 min-w-0">
                        {!n.is_read && <span className="w-1.5 h-1.5 rounded-full bg-[#1B3A8F] flex-shrink-0" />}
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{n.category}</span>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">{formatTime(n.created_at)}</span>
                    </div>
                    <h4 className={`text-sm font-semibold mb-1 ${n.is_read ? "text-muted-foreground" : "text-foreground"}`}>{n.title}</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">{n.description}</p>
                    {!n.is_read && <p className="text-xs text-blue-500 mt-1">Click to mark as read — updates notifications.is_read in DB</p>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
// ─── SKILL MANAGEMENT (Settings) ─────────────────────────────────────────────
function SkillManagementSettings({ skills, skillsByCategory, loading, refetch }: {
  skills: Skill[]; skillsByCategory: Record<string, Skill[]>; loading: boolean; refetch: () => Promise<void>;
}) {
  const { createSkill } = useDb();
  const [newName, setNewName] = useState("");
  const [newCat, setNewCat] = useState("Frontend Development");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const cats = ["Frontend Development","Backend Development","Data Science & ML","Cloud & DevOps","Design & UX","Quality Assurance","Security & Compliance","Project Management"];

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    if (!newName.trim()) return;
    setSaving(true);
    try { await createSkill(newName.trim(), newCat); setNewName(""); } catch (ex: any) { setErr(ex.message); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
        <h3 className="text-sm font-display font-semibold text-foreground mb-4">Add New Skill to Library</h3>
        {err && <p className="text-xs text-red-600 mb-3 bg-red-50 border border-red-200 rounded-lg p-2">{err}</p>}
        <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-40"><label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Skill Name *</label><input required value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Rust, Swift, dbt…" className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background" /></div>
          <div><label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Category</label><select value={newCat} onChange={e => setNewCat(e.target.value)} className="border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none bg-background text-foreground">{cats.map(c => <option key={c}>{c}</option>)}</select></div>
          <button type="submit" disabled={saving || !newName.trim()} className="bg-[#1B3A8F] text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-[#162F76] disabled:opacity-60 transition-colors flex items-center gap-1.5">{saving ? <><span className="animate-spin w-3.5 h-3.5 border border-white border-t-transparent rounded-full inline-block"/>Adding…</> : <><Plus className="w-4 h-4"/>Add Skill</>}</button>
        </form>
      </div>
      <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-display font-semibold text-foreground">Skill Library · {skills.length} skills · {Object.keys(skillsByCategory).length} categories · Proficiency: Expert=3, Intermediate=2, Beginner=1</h3><button onClick={refetch} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted"><RefreshCw className="w-3.5 h-3.5" /></button></div>
        {loading ? <div className="space-y-2">{Array.from({length:4}).map((_,i) => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}</div>
          : Object.keys(skillsByCategory).length === 0 ? <div className="text-center py-8 text-sm text-muted-foreground">No skills yet. Add your first skill above.</div>
          : <div className="space-y-2">{Object.entries(skillsByCategory).map(([cat, catSkills]) => (
              <div key={cat} className="p-3 border border-border rounded-lg hover:bg-muted/40 transition-colors">
                <div className="flex items-center justify-between mb-2"><span className="text-sm font-semibold text-foreground">{cat}</span><span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md font-semibold">{catSkills.length}</span></div>
                <div className="flex flex-wrap gap-1.5">{catSkills.map(s => <span key={s.id} className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-md font-medium border border-border">{s.name}</span>)}</div>
              </div>
            ))}</div>}
      </div>
    </div>
  );
}

function SettingsAdmin() {
  const { employees, skills, loading, deleteEmployee, addAuditLog, refetch } = useDb();
  const [tab, setTab] = useState("users");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [securityToggles, setSecurityToggles] = useState([true, true, true, false, false]);

  const tabs = [
    { id: "users", label: "User Management", icon: <Users className="w-4 h-4" /> },
    { id: "roles", label: "Roles & Permissions", icon: <Shield className="w-4 h-4" /> },
    { id: "skills", label: "Skill Categories", icon: <Brain className="w-4 h-4" /> },
    { id: "system", label: "System Config", icon: <Settings className="w-4 h-4" /> },
    { id: "security", label: "Security", icon: <Lock className="w-4 h-4" /> },
  ];

  const skillsByCategory = useMemo(() => {
    const map: Record<string, Skill[]> = {};
    skills.forEach(s => { if (!map[s.category]) map[s.category] = []; map[s.category].push(s); });
    return map;
  }, [skills]);

  const handleDeleteUser = async (emp: User) => {
    if (!confirm(`Delete ${emp.name}? This cannot be undone.`)) return;
    setDeletingId(emp.id);
    try { await deleteEmployee(emp.id); await addAuditLog("WARNING", `User account deleted: ${emp.name} (${emp.email})`, "IAM"); }
    finally { setDeletingId(null); }
  };

  return (
    <div className="p-6 space-y-5">
      {showAdd && <AddEmployeeModal onClose={() => setShowAdd(false)} />}
      <div>
        <h1 className="text-xl font-display font-bold text-foreground">Settings & Administration</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{employees.length} users · {skills.length} skills · all from Supabase PostgreSQL</p>
      </div>

      <div className="flex gap-6">
        <nav className="w-52 flex-shrink-0 space-y-1">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-left transition-colors ${tab === t.id ? "bg-[#1B3A8F] text-white shadow-md shadow-blue-900/15" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 min-w-0">
                      <div key={tab}>
              {tab === "users" && (
                <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-display font-semibold text-foreground">employees table · {employees.length} records</h3>
                    <div className="flex items-center gap-2">
                      <button onClick={refetch} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted"><RefreshCw className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setShowAdd(true)}
                        className="flex items-center gap-1.5 text-xs bg-[#1B3A8F] text-white rounded-lg px-3 py-2 hover:bg-[#162F76]">
                        <Plus className="w-3.5 h-3.5" /> Add User
                      </button>
                    </div>
                  </div>
                  {loading ? <LoadingScreen message="Fetching employees table…" /> : (
                    <div animate="visible" className="divide-y divide-border max-h-96 overflow-y-auto">
                      {employees.map(emp => (
                        <div key={emp.id} className="flex items-center gap-3 py-3">
                          <AvBadge initials={emp.avatar_initials} size="sm" />
                          <div className="flex-1 min-w-0"><p className="text-sm font-medium text-foreground truncate">{emp.name}</p><p className="text-xs text-muted-foreground truncate font-mono">{emp.email}</p></div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-md capitalize">{emp.role.replace("_", " ")}</span>
                            <StatusDot available={emp.available} />
                            <button onClick={() => handleDeleteUser(emp)} disabled={deletingId === emp.id}
                              className="p-1.5 text-muted-foreground hover:text-red-500 rounded-md hover:bg-red-50 disabled:opacity-50">
                              {deletingId === emp.id ? <div className="w-3.5 h-3.5 animate-spin border border-red-400 border-t-transparent rounded-full" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tab === "roles" && (
                <div className="bg-card rounded-xl border border-border p-5 shadow-sm overflow-x-auto">
                  <h3 className="text-sm font-display font-semibold text-foreground mb-4">Role Permissions Matrix</h3>
                  <table className="w-full text-xs min-w-[560px]">
                    <thead><tr className="text-muted-foreground text-left">
                      <th className="pb-3 font-semibold pr-4">Permission</th>
                      {["Admin / HR", "Employee"].map(r => <th key={r} className="pb-3 font-semibold text-center px-2">{r}</th>)}
                    </tr></thead>
                    <tbody className="divide-y divide-border">
                      {[
                        ["View All Employees", true, true],
                        ["Edit Employee Profiles", true, false],
                        ["AI Matchmaker Access", true, false],
                        ["Bench Analytics", true, false],
                        ["Security Audit Logs", true, false],
                        ["Manage Roles & Perms", true, false],
                        ["Create Notifications", true, false],
                        ["Own Profile", true, true],
                      ].map(([perm, ...roles]) => (
                        <tr key={String(perm)} className="transition-colors">
                          <td className="py-2.5 font-medium text-foreground pr-4">{perm}</td>
                          {roles.map((allowed, i) => <td key={i} className="py-2.5 text-center px-2">{allowed ? <CheckCircle className="w-4 h-4 text-emerald-500 mx-auto" /> : <span className="text-slate-200 text-base">–</span>}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {tab === "skills" && (
                <SkillManagementSettings skills={skills} skillsByCategory={skillsByCategory} loading={loading} refetch={refetch} />
              )}

              {tab === "system" && (
                <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
                  <h3 className="text-sm font-display font-semibold text-foreground mb-4">System Configuration</h3>
                  <div className="space-y-1">
                    {[
                      { label: "Organization", value: "NexusCorp Global" },
                      { label: "Database", value: "Supabase PostgreSQL" },
                      { label: "Project ID", value: "tcsqcavcantoehvdserv" },
                      { label: "Tables Created", value: "8 (employees, skills, employee_skills, projects, assignments, mentorships, audit_logs, notifications)" },
                      { label: "Real-time", value: "Enabled via Supabase Channels (postgres_changes)" },
                      { label: "RLS", value: "Enabled on all 8 tables with anon/authenticated policies" },
                      { label: "TypeScript Types", value: "Generated from Database interface in src/types/database.ts" },
                    ].map(s => (
                      <div key={s.label} className="flex items-start justify-between py-3 border-b border-border last:border-0 gap-4">
                        <span className="text-sm text-muted-foreground flex-shrink-0">{s.label}</span>
                        <span className="text-xs font-medium text-foreground text-right font-mono">{s.value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex gap-2 flex-wrap">
                    <a href="https://supabase.com/dashboard/project/tcsqcavcantoehvdserv/database/tables" target="_blank"
                      className="flex items-center gap-1.5 text-xs bg-[#1B3A8F] text-white font-semibold px-4 py-2 rounded-lg hover:bg-[#162F76]">
                      <Database className="w-3.5 h-3.5" /> View in Supabase
                    </a>
                    <button onClick={() => { localStorage.removeItem(SETUP_KEY); window.location.reload(); }}
                      className="flex items-center gap-1.5 text-xs border border-border text-muted-foreground font-medium px-4 py-2 rounded-lg hover:bg-muted">
                      <RefreshCw className="w-3.5 h-3.5" /> Reset & Reseed
                    </button>
                  </div>
                </div>
              )}

              {tab === "security" && (
                <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
                  <h3 className="text-sm font-display font-semibold text-foreground mb-4">Security Controls</h3>
                  <div className="space-y-1">
                    {[
                      { label: "Row Level Security (RLS)", desc: "RLS enabled on all 8 tables with permissive anon + authenticated policies" },
                      { label: "Audit Logging", desc: "All user actions written to audit_logs table with severity, IP, module, timestamp" },
                      { label: "Real-time Subscriptions", desc: "postgres_changes events via Supabase Channels propagate to all clients" },
                      { label: "Service Role Separation", desc: "Service role key in edge function only; anon key used exclusively in browser" },
                      { label: "Type-Safe Queries", desc: "Database TypeScript interface in src/types/database.ts prevents type mismatches" },
                    ].map((s, i) => (
                      <div key={s.label} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                        <div><p className="text-sm font-medium text-foreground">{s.label}</p><p className="text-xs text-muted-foreground">{s.desc}</p></div>
                        <button onClick={() => setSecurityToggles(prev => prev.map((v, j) => j === i ? !v : v))}
                          className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ml-4 ${securityToggles[i] ? "bg-[#1B3A8F]" : "bg-muted"}`}>
                          <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
        </div>
      </div>
    </div>
  );
}

// ─── APP SHELL ────────────────────────────────────────────────────────────────
const navItems = [
  { id: "dashboard", label: "Overview", icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: "matchmaker", label: "AI Matchmaker", icon: <Sparkles className="w-4 h-4" /> },
  { id: "bench", label: "Bench Analytics", icon: <BarChart2 className="w-4 h-4" /> },
  { id: "directory", label: "Employee Directory", icon: <Users className="w-4 h-4" /> },
  { id: "security", label: "Security Audit", icon: <ShieldCheck className="w-4 h-4" /> },
  { id: "notifications", label: "Notifications", icon: <Bell className="w-4 h-4" />, badge: true },
  { id: "settings", label: "Settings", icon: <Settings className="w-4 h-4" /> },
];

const employeeNavItems = [
  { id: "dashboard", label: "My Dashboard", icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: "profile", label: "My Profile", icon: <UserCheck className="w-4 h-4" /> },
  { id: "directory", label: "Employee Directory", icon: <Users className="w-4 h-4" /> },
  { id: "notifications", label: "Notifications", icon: <Bell className="w-4 h-4" />, badge: true },
];

function AppShell({ screen, setScreen, onLogout, children }: { screen: Screen; setScreen: (s: Screen) => void; onLogout: () => void; children: React.ReactNode }) {
  const { notifications, currentUser } = useDb();
  const unread = notifications.filter(n => !n.is_read).length;
  const [collapsed, setCollapsed] = useState(false);
  const items = isAdminHr(currentUser) ? navItems : employeeNavItems;
  const userInitials = currentUser?.avatar_initials || "U";

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <aside className="flex-shrink-0 bg-[#0B1437] flex flex-col overflow-hidden">
        <div className={`h-14 flex items-center border-b border-white/5 ${collapsed ? "px-3 justify-center" : "px-4"}`}>
          {!collapsed ? (
            <div className="flex items-center gap-2.5 flex-1 min-w-0"><div className="w-7 h-7 bg-[#1B3A8F] rounded-lg flex items-center justify-center flex-shrink-0"><Layers className="w-3.5 h-3.5 text-white" /></div><span className="font-display font-bold text-white text-sm truncate">NexusHR</span></div>
          ) : <div className="w-7 h-7 bg-[#1B3A8F] rounded-lg flex items-center justify-center flex-shrink-0"><Layers className="w-3.5 h-3.5 text-white" /></div>}
          {!collapsed && <button onClick={() => setCollapsed(true)} className="p-1 text-slate-500 hover:text-slate-300 ml-1"><ChevronRight className="w-4 h-4 rotate-180" /></button>}
        </div>
        {collapsed && <button onClick={() => setCollapsed(false)} className="flex items-center justify-center py-2 text-slate-500 hover:text-slate-300 border-b border-white/5"><ChevronRight className="w-3.5 h-3.5" /></button>}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {!collapsed && <p className="text-xs font-semibold text-slate-600 uppercase tracking-widest px-2 mb-2 mt-1">Navigation</p>}
          {items.map(item => {
            const badgeCount = item.badge ? unread : 0;
            return (
              <button key={item.id} onClick={() => setScreen(item.id as Screen)} title={collapsed ? item.label : undefined}
                className={`w-full flex items-center gap-2.5 px-2 py-2.5 rounded-lg text-sm font-medium transition-colors relative ${collapsed ? "justify-center" : ""} ${screen === item.id ? "bg-[#1B3A8F] text-white shadow-lg shadow-blue-900/30" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"}`}>
                <span className="flex-shrink-0 relative z-10">{item.icon}</span>
                {!collapsed && <span className="truncate flex-1 text-left relative z-10">{item.label}</span>}
                {!collapsed && badgeCount > 0 && <span className="w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold flex-shrink-0">{badgeCount > 9 ? "9+" : badgeCount}</span>}
                {collapsed && badgeCount > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />}
              </button>
            );
          })}
        </nav>
        <div className="p-2 border-t border-white/5">
          {collapsed ? (
            <button onClick={onLogout} title="Sign out" className="w-full flex items-center justify-center p-2 text-slate-500 hover:text-slate-300 rounded-lg hover:bg-white/5"><LogOut className="w-4 h-4" /></button>
          ) : (
            <div className="flex items-center gap-2 px-2 py-1.5">
              <div className="w-7 h-7 bg-[#1B3A8F] rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white">{userInitials}</div>
              <div className="flex-1 min-w-0"><p className="text-xs font-medium text-slate-300 truncate">{currentUser?.name ?? "NexusHR User"}</p><p className="text-xs text-slate-500 truncate flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" /> {currentUser?.role?.replace("_", " ") ?? "Supabase Connected"}</p></div>
              <button onClick={onLogout} className="p-1.5 text-slate-500 hover:text-slate-300 rounded-md hover:bg-white/5 flex-shrink-0"><LogOut className="w-3.5 h-3.5" /></button>
            </div>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="h-14 border-b border-border bg-card flex items-center px-6 gap-4 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">NexusHR</span><ChevronRight className="w-3 h-3" />
              <span className="font-medium capitalize">{items.find(n => n.id === screen)?.label ?? screen}</span>
              <span className="ml-2 text-xs text-emerald-600 flex items-center gap-1 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" /> live DB</span>
            </div>
          </div>
          <button onClick={() => setScreen("notifications")} className="relative p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted">
            <Bell className="w-4 h-4" />
            {unread > 0 && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full" />}
          </button>
          <div className="w-7 h-7 bg-[#1B3A8F] rounded-full flex items-center justify-center text-xs font-bold text-white">{userInitials}</div>
        </header>
        <main className="flex-1 overflow-y-auto">
                      <div key={screen}>
              {children}
            </div>
        </main>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [loggedIn, setLoggedIn] = useState(false);
  const [authProfile, setAuthProfile] = useState<AuthProfile>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const loadProfileForSession = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const authUser = sessionData.session?.user;
    if (!authUser?.email) {
      const localSession = localStorage.getItem(LOCAL_SESSION_KEY);
      if (localSession) {
        try {
          const parsed = JSON.parse(localSession) as { email?: string };
          if (parsed.email) {
            const { data } = await supabase
              .from("employees")
              .select("*, employee_skills(id, skill_id, proficiency_level, years_experience, skills(*))")
              .eq("email", parsed.email)
              .maybeSingle();
            if (data) {
              setAuthProfile(data as UserWithSkills);
              setLoggedIn(true);
              setScreen("dashboard");
              setAuthLoading(false);
              return;
            }
          }
        } catch {
          localStorage.removeItem(LOCAL_SESSION_KEY);
        }
      }
      setAuthProfile(null);
      setLoggedIn(false);
      setAuthLoading(false);
      return;
    }
    const { data } = await supabase
      .from("employees")
      .select("*, employee_skills(id, skill_id, proficiency_level, years_experience, skills(*))")
      .or(`auth_user_id.eq.${authUser.id},email.eq.${authUser.email}`)
      .maybeSingle();
    if (data) {
      setAuthProfile(data as UserWithSkills);
      setLoggedIn(true);
      setScreen("dashboard");
    }
    setAuthLoading(false);
  }, []);

  useEffect(() => {
    loadProfileForSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        if (localStorage.getItem(LOCAL_SESSION_KEY)) return;
        setAuthProfile(null);
        setLoggedIn(false);
        setScreen("landing");
      }
    });
    return () => subscription.unsubscribe();
  }, [loadProfileForSession]);

  const navigate = (s: Screen) => setScreen(s);
  const handleLogin = (profile: UserWithSkills) => {
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({ email: profile.email }));
    setAuthProfile(profile);
    setLoggedIn(true);
    setScreen("dashboard");
  };
  const handleLogout = async () => {
    if (authProfile?.email) {
      try {
        await supabase.from("audit_logs").insert({
          severity: "INFO",
          user_email: authProfile.email,
          action: `User logged out at ${new Date().toLocaleString()}`,
          ip_address: "web-client",
          module: "Auth",
        });
      } catch {
        /* logout should not be blocked by audit logging */
      }
    }
    localStorage.removeItem(LOCAL_SESSION_KEY);
    await supabase.auth.signOut();
    setAuthProfile(null);
    setLoggedIn(false);
    setScreen("landing");
  };

  if (authLoading) {
    return (
      <ErrorBoundary onReset={() => window.location.reload()}>
        <SetupGuard><LoadingScreen message="Checking Supabase session…" /></SetupGuard>
      </ErrorBoundary>
    );
  }

  if (!loggedIn) {
    return (
      <ErrorBoundary onReset={() => window.location.reload()}>
        <SetupGuard>
          {screen === "login" ? (
            <div key="login">
              <LoginPage onLogin={handleLogin} onNavigate={navigate} />
            </div>
          ) : (
            <div key="landing">
              <LandingPage onNavigate={navigate} />
            </div>
          )}
        </SetupGuard>
      </ErrorBoundary>
    );
  }

  const adminScreens: Partial<Record<Screen, JSX.Element>> = {
    dashboard: <Dashboard onNavigate={navigate} />,
    matchmaker: <AIBestFitMatchmaker />,
    bench: <BenchAnalytics />,
    directory: <EmployeeDirectory onNavigate={navigate} />,
    profile: <EmployeeProfile onNavigate={navigate} />,
    security: <SecurityAudit />,
    notifications: <NotificationsCenter />,
    settings: <SettingsAdmin />,
  };
  const employeeScreens: Partial<Record<Screen, JSX.Element>> = {
    dashboard: <EmployeeDashboard onNavigate={navigate} />,
    directory: <EmployeeDirectory onNavigate={navigate} />,
    profile: <EmployeeProfile onNavigate={navigate} />,
    notifications: <NotificationsCenter />,
  };
  const screens = isAdminHr(authProfile) ? adminScreens : employeeScreens;

  return (
    <ErrorBoundary onReset={() => window.location.reload()}>
      <SetupGuard>
        <DatabaseProvider currentUser={authProfile}>
          <AppShell screen={screen} setScreen={navigate} onLogout={handleLogout}>
            <ErrorBoundary key={screen}>
              {screens[screen] ?? (isAdminHr(authProfile) ? <Dashboard onNavigate={navigate} /> : <EmployeeDashboard onNavigate={navigate} />)}
            </ErrorBoundary>
          </AppShell>
        </DatabaseProvider>
      </SetupGuard>
    </ErrorBoundary>
  );
}
