import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  readDir: vi.fn(),
  open: vi.fn(),
  close: vi.fn(),
  leave: vi.fn(),
  pick: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("@/platform/ipc", async (original) => {
  const real = await original<typeof import("@/platform/ipc")>();
  return { ...real, isTauri: () => true, commands: { ...real.commands, fsReadDir: mocks.readDir } };
});
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ label: "main" }) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mocks.pick }));
vi.mock("@/platform/remote", () => ({
  isRemoteWindow: () => false,
  useRemote: (selector: (s: { session: null }) => unknown) => selector({ session: null }),
}));
vi.mock("@/platform/tauriCore", async (original) => {
  const real = await original<typeof import("@/platform/tauriCore")>();
  return {
    ...real,
    invokeLocal: (cmd: string, args: { path: string }) =>
      cmd === "fs_read_dir" ? mocks.readDir(args.path) : real.invokeLocal(cmd, args),
  };
});
vi.mock("@/platform/project", async (original) => {
  const real = await original<typeof import("@/platform/project")>();
  return { ...real, openProject: mocks.open, closeProject: mocks.close, confirmLeaveProject: mocks.leave };
});
vi.mock("@/workbench/contributions", async (original) => {
  const real = await original<typeof import("@/workbench/contributions")>();
  return { ...real, notifications: () => ({ notify: mocks.notify }) };
});

import { useProject } from "@/platform/project";
import { WindowProjects } from "./WindowProjects";
import {
  activateWindowProject,
  addWindowProjects,
  attachWindowProjects,
  closeWindowProject,
  projectPathKey,
  removeWindowProject,
  trackWindowProjects,
  useWindowProjects,
} from "./windowProjectList";

const project = (root: string) => ({ root, name: root.split("/").at(-1)!, isGit: false, settings: {} });
let off: () => void;
let calls: string[];
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  useProject.setState({ project: null, lightEdit: false, opening: false, settings: null });
  useWindowProjects.setState({ projects: [], busy: false });
  calls = [];
  mocks.readDir.mockResolvedValue({ status: "ok", data: [] });
  mocks.leave.mockResolvedValue(true);
  mocks.open.mockImplementation(async (path: string) => {
    calls.push(`open:${path}`);
    const opened = project(path);
    useProject.setState({ project: opened });
    return opened;
  });
  mocks.close.mockImplementation(async () => {
    calls.push("close");
    useProject.setState({ project: null, lightEdit: false });
  });
  off = trackWindowProjects("main");
});
afterEach(() => off());

describe("window project membership", () => {
  it("adds multiple folders without opening or reading any of them", async () => {
    mocks.pick.mockResolvedValue(["/p/api", "/p/web"]);
    expect(await addWindowProjects()).toBe(true);
    expect(useWindowProjects.getState().projects.map((p) => p.path)).toEqual(["/p/api", "/p/web"]);
    expect(mocks.open).not.toHaveBeenCalled();
    expect(mocks.readDir).not.toHaveBeenCalled();
    expect(useProject.getState().project).toBeNull();
  });

  it("keeps membership when the folder picker is cancelled", async () => {
    attachWindowProjects(["/p/api"]);
    mocks.pick.mockResolvedValue(null);
    expect(await addWindowProjects()).toBe(false);
    expect(useWindowProjects.getState().projects).toHaveLength(1);
  });

  it("deduplicates Windows slashes, trailing slashes and case while keeping POSIX case", () => {
    attachWindowProjects(["C:\\Work\\App", "c:/work/app/", "/p/App", "/p/app"]);
    expect(useWindowProjects.getState().projects).toHaveLength(3);
    expect(projectPathKey("C:/")).toBe(projectPathKey("c:\\"));
  });

  it("restores a separate list per window without opening its closed projects", () => {
    attachWindowProjects(["/p/api"]);
    off();
    off = trackWindowProjects("project-1");
    expect(useWindowProjects.getState().projects).toEqual([]);
    attachWindowProjects(["/p/web"]);
    off();
    off = trackWindowProjects("main");
    expect(useWindowProjects.getState().projects.map((p) => p.path)).toEqual(["/p/api"]);
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it("tolerates corrupt persisted metadata", () => {
    off();
    localStorage.setItem("openidea.window.projects:main", "broken");
    off = trackWindowProjects("main");
    expect(useWindowProjects.getState().projects).toEqual([]);
  });

  it("records a project opened through another entry point and keeps it after closing", async () => {
    useProject.setState({ project: project("/p/api") });
    await closeWindowProject();
    expect(useWindowProjects.getState().projects.map((p) => p.path)).toEqual(["/p/api"]);
    expect(useProject.getState().project).toBeNull();
  });

  it("removes a closed entry without closing the active project or deleting files", async () => {
    attachWindowProjects(["/p/api", "/p/web"]);
    useProject.setState({ project: project("/p/api") });
    await removeWindowProject("/p/web");
    expect(useWindowProjects.getState().projects.map((p) => p.path)).toEqual(["/p/api"]);
    expect(mocks.close).not.toHaveBeenCalled();
  });
});

describe("single active project", () => {
  it("closes the old project before opening the new one and retains both entries", async () => {
    attachWindowProjects(["/p/api", "/p/web"]);
    useProject.setState({ project: project("/p/api") });
    expect(await activateWindowProject("/p/web")).toBe(true);
    expect(calls).toEqual(["close", "open:/p/web"]);
    expect(useProject.getState().project?.root).toBe("/p/web");
    expect(useWindowProjects.getState().projects).toHaveLength(2);
  });

  it("does not reopen the active project", async () => {
    useProject.setState({ project: project("/p/api") });
    expect(await activateWindowProject("/p/api")).toBe(true);
    expect(calls).toEqual([]);
  });

  it("keeps the current project when unsaved-changes confirmation is cancelled", async () => {
    useProject.setState({ project: project("/p/api") });
    mocks.leave.mockResolvedValue(false);
    expect(await activateWindowProject("/p/web")).toBe(false);
    expect(calls).toEqual([]);
    expect(useProject.getState().project?.root).toBe("/p/api");
  });

  it("keeps the old session when the target directory cannot be read", async () => {
    useProject.setState({ project: project("/p/api") });
    mocks.readDir.mockResolvedValue({ status: "error", error: { kind: "notFound", message: "missing" } });
    expect(await activateWindowProject("/p/web")).toBe(false);
    expect(calls).toEqual([]);
    expect(mocks.notify).toHaveBeenCalled();
  });

  it("leaves no stale active project if opening fails after close", async () => {
    useProject.setState({ project: project("/p/api") });
    attachWindowProjects(["/p/web"]);
    mocks.open.mockRejectedValue(new Error("index unavailable"));
    expect(await activateWindowProject("/p/web")).toBe(false);
    expect(useProject.getState().project).toBeNull();
    expect(useWindowProjects.getState().projects).toHaveLength(2);
    expect(useWindowProjects.getState().busy).toBe(false);
  });

  it("rejects a second switch while the first is pending", async () => {
    let finish!: (value: boolean) => void;
    mocks.leave.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    useProject.setState({ project: project("/p/api") });
    const first = activateWindowProject("/p/web");
    await vi.waitFor(() => expect(mocks.leave).toHaveBeenCalled());
    expect(await activateWindowProject("/p/other")).toBe(false);
    finish(true);
    expect(await first).toBe(true);
    expect(calls).toEqual(["close", "open:/p/web"]);
  });

  it("does not switch while another project open is in progress", async () => {
    useProject.setState({ opening: true });
    expect(await activateWindowProject("/p/web")).toBe(false);
    expect(calls).toEqual([]);
  });

  it("does not close a project opened elsewhere during the leave confirmation", async () => {
    useProject.setState({ project: project("/p/api") });
    mocks.leave.mockImplementation(async () => {
      useProject.setState({ project: project("/p/newer") });
      return true;
    });
    expect(await activateWindowProject("/p/web")).toBe(false);
    expect(useProject.getState().project?.root).toBe("/p/newer");
    expect(calls).toEqual([]);
  });

  it("does not switch after the active project changed during directory validation", async () => {
    useProject.setState({ project: project("/p/api") });
    mocks.readDir.mockImplementation(async () => {
      useProject.setState({ project: project("/p/newer") });
      return { status: "ok", data: [] };
    });
    expect(await activateWindowProject("/p/web")).toBe(false);
    expect(calls).toEqual([]);
  });

  it("closes a LightEdit session through the same leave guard", async () => {
    useProject.setState({ lightEdit: true });
    await activateWindowProject("/p/web");
    expect(mocks.leave).toHaveBeenCalled();
    expect(calls).toEqual(["close", "open:/p/web"]);
  });

  it("deduplicates a junction alias after the backend returns its canonical root", async () => {
    attachWindowProjects(["/alias/web", "/p/web"]);
    mocks.open.mockImplementation(async () => {
      const opened = project("/p/web");
      useProject.setState({ project: opened });
      return opened;
    });
    await activateWindowProject("/alias/web");
    expect(useWindowProjects.getState().projects).toEqual([{ path: "/p/web", name: "web" }]);
  });

  it("does not remove or close the active entry when its close is cancelled", async () => {
    useProject.setState({ project: project("/p/api") });
    mocks.leave.mockResolvedValue(false);
    expect(await removeWindowProject("/p/api")).toBe(false);
    expect(useWindowProjects.getState().projects).toHaveLength(1);
    expect(mocks.close).not.toHaveBeenCalled();
  });

  it("closes the active project before removing its entry", async () => {
    useProject.setState({ project: project("/p/api") });
    expect(await removeWindowProject("/p/api")).toBe(true);
    expect(calls).toEqual(["close"]);
    expect(useWindowProjects.getState().projects).toEqual([]);
  });
});

describe("window project sidebar", () => {
  it("shows one active entry, switches in place, and keeps the sidebar when all projects close", async () => {
    attachWindowProjects(["/p/api", "/p/web"]);
    useProject.setState({ project: project("/p/api") });
    render(<WindowProjects />);
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]!).getByText("Open")).toBeTruthy();
    expect(within(rows[1]!).getByText("Closed")).toBeTruthy();
    await act(async () => fireEvent.click(within(rows[1]!).getByRole("button", { name: /web/ })));
    expect(calls).toEqual(["close", "open:/p/web"]);
    expect(screen.getAllByText("Open")).toHaveLength(1);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Close project" })));
    expect(screen.getAllByText("Closed")).toHaveLength(2);
    expect(screen.getByRole("complementary", { name: "Window Projects" })).toBeTruthy();
  });
});
