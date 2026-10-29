/** Window membership is metadata only; the backend still owns exactly one active project per window. */
import { getCurrentWindow } from "@tauri-apps/api/window";
import { create } from "zustand";
import { t } from "@/platform/i18n";
import { call, isTauri, type FileEntry, type IdeError } from "@/platform/ipc";
import { basename, closeProject, confirmLeaveProject, openProject, useProject } from "@/platform/project";
import { isRemoteWindow } from "@/platform/remote";
import { invokeLocal } from "@/platform/tauriCore";
import { notifications } from "@/workbench/contributions";

export interface WindowProject {
  path: string;
  name: string;
}

export const useWindowProjects = create<{ projects: WindowProject[]; busy: boolean }>(() => ({
  projects: [],
  busy: false,
}));

let storageKey = "openidea.window.projects:main";

/** Match native Windows paths without creating duplicate entries for slash or case differences. */
export function projectPathKey(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
  return /^(?:[a-z]:(?:\/|$)|\/\/)/i.test(normalized) ? normalized.toLowerCase() : normalized;
}

function persist(projects: WindowProject[]) {
  useWindowProjects.setState({ projects });
  try {
    localStorage.setItem(storageKey, JSON.stringify(projects));
  } catch {
    // Keep this window usable when webview storage is unavailable.
  }
}

export function attachWindowProjects(paths: readonly string[]) {
  const projects = [...useWindowProjects.getState().projects];
  for (const path of paths) {
    const key = projectPathKey(path);
    if (!projects.some((p) => projectPathKey(p.path) === key)) {
      const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
      projects.push({ path: path.replace(/\\/g, "/"), name: basename(normalized) || normalized });
    }
  }
  persist(projects);
}

/** Also records projects opened through File > Open, the command line, or session restore. */
export function trackWindowProjects(label = isTauri() ? getCurrentWindow().label : "main"): () => void {
  storageKey = `openidea.window.projects:${label}`;
  let projects: WindowProject[] = [];
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    if (Array.isArray(value)) {
      projects = value.filter(
        (p): p is WindowProject =>
          p !== null && typeof p === "object" && typeof p.path === "string" && !!p.path && typeof p.name === "string",
      );
    }
  } catch {
    // A damaged list must not prevent startup.
  }
  useWindowProjects.setState({ projects, busy: false });
  const record = () => {
    const project = useProject.getState().project;
    if (!project || isRemoteWindow()) return;
    attachWindowProjects([project.root]);
    persist(
      useWindowProjects
        .getState()
        .projects.map((p) =>
          projectPathKey(p.path) === projectPathKey(project.root) ? { path: project.root, name: project.name } : p,
        ),
    );
  };
  record();
  return useProject.subscribe((s, prev) => {
    if (s.project !== prev.project) record();
  });
}

function report(error: unknown) {
  notifications().notify({
    level: "error",
    title: t("windowProjects.failed"),
    body: error instanceof Error ? error.message : String(error),
  });
}

async function exclusive(operation: () => Promise<boolean>): Promise<boolean> {
  if (useWindowProjects.getState().busy || useProject.getState().opening) return false;
  useWindowProjects.setState({ busy: true });
  try {
    return await operation();
  } catch (e) {
    report(e);
    return false;
  } finally {
    useWindowProjects.setState({ busy: false });
  }
}

/** Adds folders without opening them or allocating any project services. */
export function addWindowProjects(): Promise<boolean> {
  return exclusive(async () => {
    if (!isTauri()) return false;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ directory: true, multiple: true, title: t("windowProjects.add") });
    if (!picked) return false;
    attachWindowProjects(Array.isArray(picked) ? picked : [picked]);
    return true;
  });
}

async function leaveCurrentProject(): Promise<boolean> {
  const before = useProject.getState();
  if (!(await confirmLeaveProject())) return false;
  const now = useProject.getState();
  // Another entry point may have opened a project while the confirmation was displayed.
  if (now.opening || now.project !== before.project || now.lightEdit !== before.lightEdit) return false;
  if (before.project || before.lightEdit) await closeProject();
  return true;
}

/** Close first so failed opens leave the UI and backend consistently without an active project. */
export function activateWindowProject(path: string): Promise<boolean> {
  return exclusive(async () => {
    if (!isTauri()) return false;
    const current = useProject.getState().project;
    if (current && !isRemoteWindow() && projectPathKey(current.root) === projectPathKey(path)) return true;
    // Reject missing / unreadable directories before discarding the current session.
    // This picker always selects local folders, even when the active project is remote.
    await call(
      invokeLocal<{ status: "ok"; data: FileEntry[] } | { status: "error"; error: IdeError }>("fs_read_dir", { path }),
    );
    if (useProject.getState().project !== current || useProject.getState().opening) return false;
    if (!(await leaveCurrentProject())) return false;
    const opened = await openProject(path);
    // The backend resolves symlinks / junctions. Replace that alias, retaining its list position.
    const projects = useWindowProjects.getState().projects;
    const seen = new Set<string>();
    persist(
      projects
        .map((p) => (projectPathKey(p.path) === projectPathKey(path) ? { path: opened.root, name: opened.name } : p))
        .filter((p) => {
          const key = projectPathKey(p.path);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }),
    );
    return true;
  });
}

export function closeWindowProject(): Promise<boolean> {
  return exclusive(leaveCurrentProject);
}

/** Removing membership never deletes files. Removing the active item first runs the close guard. */
export function removeWindowProject(path: string): Promise<boolean> {
  return exclusive(async () => {
    const current = useProject.getState().project;
    if (current && !isRemoteWindow() && projectPathKey(current.root) === projectPathKey(path)) {
      if (!(await leaveCurrentProject())) return false;
    }
    persist(useWindowProjects.getState().projects.filter((p) => projectPathKey(p.path) !== projectPathKey(path)));
    return true;
  });
}
