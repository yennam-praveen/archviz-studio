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
  getShared: (token: string) => req<{ id: string; name: string; data: Project }>(`/shared/${encodeURIComponent(token)}`),
};
