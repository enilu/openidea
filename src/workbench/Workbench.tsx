/**
 * The IDEA-style shell (Islands): title bar, tool window stripes and island
 * panels around the editor area on the frame background, status bar, and the
 * overlay layer. Without an open project the welcome view replaces the frame,
 * or, editing loose files (LightEdit), a frame with the editor only.
 */
import { useEditorRegistry } from "@/editor/api";
import type { ReactNode } from "react";
import { basename, useProject } from "@/platform/project";
import { useDistractionFree } from "./distractionFree";
import { EditorArea } from "./EditorArea";
import { OverlayHost } from "./OverlayHost";
import { projectColorVars } from "./projectColor";
import { StatusBar } from "./StatusBar";
import { TitleBar } from "./TitleBar";
import { useApplyTheme } from "./theme";
import { ToolWindowLayout } from "./toolwindows/ToolWindows";
import { Welcome } from "./Welcome";
import { useWorkbenchSlots } from "./contributions";
import { ErrorBoundary, Slot } from "./ErrorBoundary";
import styles from "./Workbench.module.css";

/** LightEdit: editor tabs only; no tool windows, toolbar widgets or project status items. */
function LightEditFrame({ sidebar }: { sidebar: ReactNode }) {
  const path = useEditorRegistry((s) => s.active?.ctx.path);
  const distractionFree = useDistractionFree((s) => s.active);
  return (
    <>
      <TitleBar lightEdit bare={distractionFree} title={path ? basename(path) : "LightEdit"} />
      <main className={styles.lightEdit} data-light-edit>
        {sidebar}
        <div className={styles.lightEditIsland}>
          <EditorArea />
        </div>
      </main>
      {!distractionFree && <StatusBar lightEdit />}
    </>
  );
}

export function Workbench() {
  useApplyTheme();
  const project = useProject((s) => s.project);
  const lightEdit = useProject((s) => s.lightEdit);
  const root = project?.root ?? null;
  const distractionFree = useDistractionFree((s) => s.active);
  const Sidebar = useWorkbenchSlots((s) => s.projectSidebar);
  const sidebar =
    Sidebar && !distractionFree ? (
      <ErrorBoundary name="window projects">
        <Slot component={Sidebar} />
      </ErrorBoundary>
    ) : null;
  const frame = project ? styles.framed : lightEdit ? styles.lightEditFrame : undefined;

  return (
    <div
      className={frame ? `${styles.workbench} ${frame}` : styles.workbench}
      style={project ? projectColorVars(project.name) : undefined}
    >
      {project ? (
        <>
          {/* Distraction Free Mode keeps the bar for the traffic lights and window dragging only. */}
          <TitleBar bare={distractionFree} />
          <div className={styles.body}>
            {sidebar}
            <ToolWindowLayout key={root} editor={<EditorArea />} />
          </div>
          {!distractionFree && <StatusBar />}
        </>
      ) : lightEdit ? (
        <LightEditFrame sidebar={sidebar} />
      ) : (
        <Welcome sidebar={sidebar} />
      )}
      <OverlayHost />
    </div>
  );
}
