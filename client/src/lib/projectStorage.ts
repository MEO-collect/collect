/**
 * LocalStorage utility for storing project metadata
 */

export type ProjectStatus = "created" | "recorded" | "transcribed" | "summarized";

export interface TokenUsage {
  transcription?: { input: number; output: number };
  summary?: { input: number; output: number };
  minutes?: { input: number; output: number };
  karte?: { input: number; output: number };
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  status: ProjectStatus;
  recordingDuration: number; // seconds
  transcription: string | null;
  summary: string | null;
  minutes: string | null;
  karte: string | null;
  tokenUsage: TokenUsage;
  speakerCount: number | null; // null means auto
}

const STORAGE_KEY = "btob-ai-projects";

export function getProjects(): Project[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveProjects(projects: Project[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

export function getProject(id: string): Project | null {
  const projects = getProjects();
  return projects.find(p => p.id === id) ?? null;
}

export function createProject(name: string): Project {
  const projects = getProjects();
  const now = Date.now();
  const project: Project = {
    id: `project-${now}-${Math.random().toString(36).substr(2, 9)}`,
    name: name || new Date().toLocaleString("ja-JP"),
    createdAt: now,
    updatedAt: now,
    status: "created",
    recordingDuration: 0,
    transcription: null,
    summary: null,
    minutes: null,
    karte: null,
    tokenUsage: {},
    speakerCount: null,
  };
  projects.unshift(project);
  saveProjects(projects);
  return project;
}

export function updateProject(id: string, updates: Partial<Project>): Project | null {
  const projects = getProjects();
  const index = projects.findIndex(p => p.id === id);
  if (index === -1) return null;

  projects[index] = {
    ...projects[index],
    ...updates,
    updatedAt: Date.now(),
  };
  saveProjects(projects);
  return projects[index];
}

export function deleteProject(id: string): boolean {
  const projects = getProjects();
  const index = projects.findIndex(p => p.id === id);
  if (index === -1) return false;

  projects.splice(index, 1);
  saveProjects(projects);
  return true;
}

// Gemini Flash pricing (per 1M tokens, in JPY)
// Input: $0.075/1M tokens ≈ ¥11.25/1M tokens
// Output: $0.30/1M tokens ≈ ¥45/1M tokens
const INPUT_PRICE_PER_MILLION = 11.25;
const OUTPUT_PRICE_PER_MILLION = 45;

export function calculateTokenCost(tokenUsage: TokenUsage): number {
  let totalInput = 0;
  let totalOutput = 0;

  Object.values(tokenUsage).forEach(usage => {
    if (usage) {
      totalInput += usage.input;
      totalOutput += usage.output;
    }
  });

  const inputCost = (totalInput / 1_000_000) * INPUT_PRICE_PER_MILLION;
  const outputCost = (totalOutput / 1_000_000) * OUTPUT_PRICE_PER_MILLION;

  return Math.round((inputCost + outputCost) * 100) / 100;
}

export function getTotalTokens(tokenUsage: TokenUsage): { input: number; output: number } {
  let totalInput = 0;
  let totalOutput = 0;

  Object.values(tokenUsage).forEach(usage => {
    if (usage) {
      totalInput += usage.input;
      totalOutput += usage.output;
    }
  });

  return { input: totalInput, output: totalOutput };
}
