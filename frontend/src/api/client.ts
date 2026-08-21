import type { Project } from '../model/types';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
let token: string | null = localStorage.getItem('token');

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 401) {
    api.logout();
  }
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.status === 204 ? (undefined as T) : res.json();
}

export interface PlanImportResult {
  project: Project;
  confidence: 'high' | 'medium' | 'low';
  scale_basis: string;
  units_found_on_plan: string;
  rooms: { name: string; approx_area_m2: number }[];
  warnings: string[];
  stats: { levels: number; walls: number; openings: number };
}

export interface ProjectSummary {
  id: string;
  name: string;
  updated_at: string;
}

export const api = {
  isLoggedIn: () => !!token,
  async register(email: string, password: string) {
    await req('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) });
    return this.login(email, password);
  },
  async login(email: string, password: string) {
    const r = await req<{ access_token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    token = r.access_token;
    localStorage.setItem('token', token);
  },
  logout() {
    token = null;
    localStorage.removeItem('token');
  },
  listProjects: () => req<ProjectSummary[]>('/projects'),
  getProject: (id: string) => req<{ id: string; name: string; data: Project }>(`/projects/${id}`),
  createProject: (p: Project) =>
    req<{ id: string }>('/projects', { method: 'POST', body: JSON.stringify({ name: p.name, data: p }) }),
  updateProject: (id: string, p: Project) =>
    req<void>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify({ name: p.name, data: p }) }),
  deleteProject: (id: string) => req<void>(`/projects/${id}`, { method: 'DELETE' }),
  shareProject: (id: string) => req<{ token: string }>(`/projects/${id}/share`, { method: 'POST' }),
  unshareProject: (id: string) => req<void>(`/projects/${id}/share`, { method: 'DELETE' }),
  async importPlan(file: File, hints: { widthM?: number; depthM?: number; notes?: string }): Promise<PlanImportResult> {
    const form = new FormData();
    form.append('file', file);
    if (hints.widthM) form.append('width_m', String(hints.widthM));
    if (hints.depthM) form.append('depth_m', String(hints.depthM));
    if (hints.notes) form.append('notes', hints.notes);
    const res = await fetch(BASE + '/import/plan', {
      method: 'POST',
      body: form, // no Content-Type header: the browser sets the multipart boundary
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.status === 401) api.logout();
    if (!res.ok) {
      let detail = await res.text();
      try { detail = JSON.parse(detail).detail ?? detail; } catch { /* plain text */ }
      throw new Error(detail);
    }
    return res.json();
  },
  getShared: (token: string) => req<{ id: string; name: string; data: Project }>(`/shared/${encodeURIComponent(token)}`),
};
