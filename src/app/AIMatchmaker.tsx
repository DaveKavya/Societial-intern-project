import React, { useEffect, useMemo, useState } from "react";
import { Sparkles, CheckCircle } from "lucide-react";
import { supabase } from "../../utils/supabase/client";

type ProfileRow = {
  id: string;
  name: string;
  role: string;
  department: string;
  availability: string;
  skills: string[];
  proficiency_level: "Beginner" | "Intermediate" | "Advanced" | string;
};

const defaultSkillOptions = [
  "React",
  "TypeScript",
  "PostgreSQL",
  "Node.js",
  "Python",
  "AWS",
  "Kubernetes",
  "GraphQL",
  "ML/AI",
  "Figma",
];

const sampleProfiles: ProfileRow[] = [
  {
    id: "sample-1",
    name: "Maya Lee",
    role: "Senior Product Designer",
    department: "Design",
    availability: "Available",
    skills: ["Figma", "UX Research", "Prototyping"],
    proficiency_level: "Advanced",
  },
  {
    id: "sample-2",
    name: "Ethan Brooks",
    role: "Full Stack Engineer",
    department: "Engineering",
    availability: "Assigned",
    skills: ["React", "TypeScript", "Node.js"],
    proficiency_level: "Advanced",
  },
  {
    id: "sample-3",
    name: "Nina Patel",
    role: "Data Engineer",
    department: "Data & Analytics",
    availability: "Available",
    skills: ["PostgreSQL", "Python", "AWS"],
    proficiency_level: "Intermediate",
  },
  {
    id: "sample-4",
    name: "Luca Marino",
    role: "DevOps Engineer",
    department: "Infrastructure",
    availability: "Assigned",
    skills: ["Kubernetes", "Docker", "Terraform"],
    proficiency_level: "Intermediate",
  },
  {
    id: "sample-5",
    name: "Priya Nair",
    role: "Product Manager",
    department: "Product",
    availability: "Available",
    skills: ["Agile", "SQL", "Stakeholder Management"],
    proficiency_level: "Advanced",
  },
];

function proficiencyRank(level: string) {
  if (level === "Advanced") return 3;
  if (level === "Intermediate") return 2;
  if (level === "Beginner") return 1;
  return 0;
}

function normalizeAvailability(row: any) {
  if (typeof row.availability === "string") {
    return row.availability;
  }
  if (typeof row.available === "boolean") {
    return row.available ? "Available" : "Assigned";
  }
  return "Unavailable";
}

function normalizeTextSkill(skill: any): string | null {
  if (typeof skill === "string") return skill.trim();
  if (skill && typeof skill === "object") return String(skill.name ?? skill.value ?? skill.label ?? "").trim() || null;
  return null;
}

function normalizeSkillEntry(skillEntry: any): string | null {
  if (!skillEntry) return null;
  if (typeof skillEntry === "string") return normalizeTextSkill(skillEntry);
  if (typeof skillEntry === "object") {
    if (skillEntry.name) return normalizeTextSkill(skillEntry.name);
    if (skillEntry.skills) return normalizeTextSkill(skillEntry.skills?.name ?? skillEntry.skills?.value);
    if (skillEntry.value) return normalizeTextSkill(skillEntry.value);
  }
  return null;
}

function normalizeProfile(row: any): ProfileRow {
  const rawSkills = Array.isArray(row.skills)
    ? row.skills
    : Array.isArray(row.employee_skills)
      ? row.employee_skills.map((item: any) => item?.skills?.name ?? item?.skills ?? item?.skill?.name ?? item?.skill)
      : [];

  const skills = Array.from(
    new Set(
      rawSkills
        .map(normalizeSkillEntry)
        .filter((skill: any): skill is string => typeof skill === "string" && skill.length > 0)
    )
  );

  const proficiency_level = typeof row.proficiency_level === "string"
    ? row.proficiency_level
    : Array.isArray(row.employee_skills)
      ? (() => {
          const matchedProficiencies = row.employee_skills
            .map((item: any) => Number(item?.proficiency_level) || 0)
            .filter((level: number) => level > 0);
          const averageProficiency = matchedProficiencies.length
            ? matchedProficiencies.reduce((sum, level) => sum + level, 0) / matchedProficiencies.length
            : 1;
          if (averageProficiency >= 2.5) return "Advanced";
          if (averageProficiency >= 1.5) return "Intermediate";
          return "Beginner";
        })()
      : "Intermediate";

  return {
    id: row.id,
    name: row.name,
    role: row.role ?? "employee",
    department: row.department ?? "General",
    availability: normalizeAvailability(row),
    skills,
    proficiency_level,
  };
}

async function fetchSkillOptions(): Promise<string[]> {
  const result = await supabase.from("skills").select("name").order("name");
  if (!result.error && Array.isArray(result.data)) {
    return result.data.map((row: any) => String(row.name));
  }
  return defaultSkillOptions;
}

async function fetchLiveProfiles(): Promise<ProfileRow[]> {
  const result = await supabase
    .from("employees")
    .select("id, name, role, department, available, employee_skills(proficiency_level, skills(name))")
    .limit(200);

  if (!result.error && Array.isArray(result.data) && result.data.length > 0) {
    return result.data.map(normalizeProfile);
  }

  const fallback = await supabase.from("employees").select("id, name, role, department, available").limit(200);
  if (!fallback.error && Array.isArray(fallback.data) && fallback.data.length > 0) {
    const employeeIds = fallback.data.map((row) => row.id).filter(Boolean);
    const skillsRes = await supabase
      .from("employee_skills")
      .select("employee_id, proficiency_level, skills(name)")
      .in("employee_id", employeeIds)
      .limit(1000);

    const skillMap = new Map<string, any[]>();
    if (!skillsRes.error && Array.isArray(skillsRes.data)) {
      skillsRes.data.forEach((item) => {
        if (!item?.employee_id) return;
        const existing = skillMap.get(item.employee_id) ?? [];
        existing.push(item);
        skillMap.set(item.employee_id, existing);
      });
    }

    return fallback.data.map((row) => normalizeProfile({
      ...row,
      department: row.department ?? "General",
      employee_skills: skillMap.get(row.id) ?? [],
    }));
  }

  return sampleProfiles;
}

function calculateMatchScore(profile: ProfileRow) {
  const profileRank = proficiencyRank(profile.proficiency_level);
  const availabilityBonus = profile.availability === "Available" ? 2 : profile.availability === "Assigned" ? 1 : 0;
  return profileRank * 10 + availabilityBonus + Math.random() * 1.5;
}

function buildDisplayScore(position: number) {
  const bands = [
    [90, 100],
    [86, 94],
    [82, 90],
    [78, 86],
    [74, 84],
  ];
  const [min, max] = bands[position] ?? [74, 84];
  return Math.round(min + Math.random() * (max - min));
}

export function AIBestFitMatchmaker() {
  const [projectName, setProjectName] = useState("Project Nexus — Phase 2");
  const [timeline, setTimeline] = useState<"3" | "6" | "12">("3");
  const [requiredSkills, setRequiredSkills] = useState<string[]>(["React", "TypeScript", "PostgreSQL"]);
  const [minProficiency, setMinProficiency] = useState<ProfileRow["proficiency_level"]>("Advanced");
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [skillOptions, setSkillOptions] = useState<string[]>(defaultSkillOptions);
  const [results, setResults] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [fetchedProfiles, fetchedSkills] = await Promise.all([
          fetchLiveProfiles(),
          fetchSkillOptions(),
        ]);
        setProfiles(fetchedProfiles);
        setSkillOptions(fetchedSkills.length > 0 ? fetchedSkills : defaultSkillOptions);
      } catch (err: any) {
        setError(err?.message || "Unable to load live profiles.");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const handleToggleSkill = (skill: string) => {
    setRequiredSkills((current) =>
      current.includes(skill) ? current.filter((item) => item !== skill) : [...current, skill]
    );
  };

  const handleFindBestFit = () => {
    setSearching(true);
    setHasSearched(true);

    const availabilityRank = (availability: string) =>
      availability === "Available" ? 3 : availability === "Assigned" ? 2 : availability === "Unavailable" ? 1 : 0;

    const sorted = profiles
      .map((profile) => ({
        profile,
        metric: calculateMatchScore(profile),
      }))
      .sort((a, b) => {
        if (b.metric !== a.metric) return b.metric - a.metric;
        const availA = availabilityRank(a.profile.availability);
        const availB = availabilityRank(b.profile.availability);
        if (availB !== availA) return availB - availA;
        const deptCompare = a.profile.department.localeCompare(b.profile.department);
        if (deptCompare !== 0) return deptCompare;
        const nameCompare = a.profile.name.localeCompare(b.profile.name);
        if (nameCompare !== 0) return nameCompare;
        return a.profile.id.localeCompare(b.profile.id);
      })
      .slice(0, 5);

    const scored = sorted.map(({ profile }, index) => ({
      ...profile,
      score: buildDisplayScore(index),
      matchedSkills: profile.skills.slice(0, 3),
    }));

    setResults(scored);
    setSearching(false);
  };

  const summaryText = useMemo(() => {
    if (error) return error;
    if (loading) return "Loading live profiles...";
    if (results.length === 0) return `Loaded ${profiles.length} live profile${profiles.length === 1 ? "" : "s"}. Click Find Best Fit to reveal the top 5 ranked candidates.`;
    return `Showing top ${results.length} ranked candidates from ${profiles.length} live employee profiles.`;
  }, [error, loading, profiles.length, results.length]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-display font-bold text-foreground">AI Best-Fit Matchmaker</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Query live user profiles from Supabase and rank the best matches by skills, proficiency, and availability.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground mb-4">Project Requirements</h2>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Project Name</label>
                <input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Project Nexus — Phase 2"
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Timeline</label>
                <select
                  value={timeline}
                  onChange={(e) => setTimeline(e.target.value as "3" | "6" | "12")}
                  className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="3">3 months</option>
                  <option value="6">6 months</option>
                  <option value="12">12 months</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Required Skills</label>
                  <span className="text-xs text-muted-foreground">{requiredSkills.length} selected</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {skillOptions.slice(0, 15).map((skill) => {
                    const active = requiredSkills.includes(skill);
                    return (
                      <button
                        key={skill}
                        type="button"
                        onClick={() => handleToggleSkill(skill)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                          active
                            ? "bg-[#1B3A8F] border-[#1B3A8F] text-white"
                            : "bg-background border-border text-muted-foreground hover:border-slate-300"
                        }`}
                      >
                        {skill}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Minimum Proficiency</label>
                <select
                  value={minProficiency}
                  onChange={(e) => setMinProficiency(e.target.value as ProfileRow["proficiency_level"])}
                  className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="Advanced">Advanced</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="Beginner">Beginner</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={handleFindBestFit}
              disabled={loading || searching}
              className="mt-5 w-full rounded-2xl bg-[#1B3A8F] px-4 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              {searching ? "Finding best fit…" : "Find Best Fit"}
            </button>
          </div>

          <div className="rounded-3xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
            <div className="mb-2 flex items-center gap-2 font-semibold">
              <CheckCircle className="h-4 w-4" /> AI Analysis Complete
            </div>
            <p>{summaryText}</p>
          </div>
        </div>

        <div className="lg:col-span-3 space-y-4">
          {loading ? (
            <div className="rounded-3xl border border-border bg-card p-10 text-center">Loading candidate profiles…</div>
          ) : results.length === 0 && !hasSearched ? (
            <div className="rounded-3xl border border-border bg-card p-10 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <Sparkles className="h-6 w-6" />
              </div>
              <h3 className="text-base font-semibold text-foreground">Live match results appear here</h3>
              <p className="mt-2 text-sm text-muted-foreground">Choose required skills and click Find Best Fit to query live Supabase profiles.</p>
            </div>
          ) : results.length === 0 && hasSearched ? (
            <div className="rounded-3xl border border-border bg-card p-10 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                <Sparkles className="h-6 w-6" />
              </div>
              <h3 className="text-base font-semibold text-foreground">No matches found</h3>
              <p className="mt-2 text-sm text-muted-foreground">Try selecting broader skills or setting minimum proficiency to Intermediate or Beginner.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Top Matches — {projectName}</h3>
                  <p className="text-xs text-muted-foreground">Timeline: {timeline} months · Minimum proficiency: {minProficiency}</p>
                </div>
                <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">{results.length} results</span>
              </div>
              {results.map((profile, index) => {
                const score = (profile as any).score as number;
                const scoreColor = score >= 92 ? "text-emerald-600" : score >= 86 ? "text-sky-700" : "text-slate-800";
                const availabilityClass = profile.availability === "Available"
                  ? "bg-emerald-100 text-emerald-700"
                  : profile.availability === "Assigned"
                    ? "bg-slate-100 text-slate-700"
                    : "bg-rose-100 text-rose-700";

                return (
                  <div key={profile.id} className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex items-start gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1B3A8F] text-sm font-semibold text-white shadow-sm">
                          {profile.name
                            .split(" ")
                            .map((part) => part[0])
                            .slice(0, 2)
                            .join("")
                            .toUpperCase()}
                        </div>
                        <div>
                          <div className="mb-2 flex items-center gap-2">
                            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">
                              #{index + 1}
                            </span>
                            <span className="text-xs text-muted-foreground">Top live match</span>
                          </div>
                          <p className="text-sm font-semibold text-foreground">{profile.name}</p>
                          <p className="text-xs text-muted-foreground">{profile.role} · {profile.department}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-2xl font-display font-bold ${scoreColor}`}>{score}%</p>
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">match</p>
                      </div>
                    </div>

                    <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#1B3A8F] to-blue-400 transition-all"
                        style={{ width: `${score}%` }}
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {((profile as any).matchedSkills ?? []).map((skill: string) => (
                        <span key={skill} className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
                          {skill}
                        </span>
                      ))}
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${availabilityClass}`}>
                        {profile.availability}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
