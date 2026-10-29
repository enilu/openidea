import clsx from "clsx";
import { useId } from "react";
import { useT } from "@/platform/i18n";
import { useProject } from "@/platform/project";
import { useRemote } from "@/platform/remote";
import { Button, Icon, IconButton } from "@/ui";
import {
  activateWindowProject,
  addWindowProjects,
  closeWindowProject,
  projectPathKey,
  removeWindowProject,
  setWindowProjectsCollapsed,
  useWindowProjects,
} from "./windowProjectList";
import { ProjectBadge } from "./RecentList";
import styles from "./WindowProjects.module.css";

export function WindowProjects() {
  const listId = useId();
  const t = useT();
  const projects = useWindowProjects((s) => s.projects);
  const busy = useWindowProjects((s) => s.busy);
  const collapsed = useWindowProjects((s) => s.collapsed);
  const opening = useProject((s) => s.opening);
  const root = useProject((s) => s.project?.root);
  const remote = useRemote((s) => s.session !== null);
  const disabled = busy || opening;
  return (
    <aside
      className={clsx(styles.sidebar, collapsed && styles.collapsed)}
      aria-label={t("windowProjects.title")}
      aria-busy={disabled}
    >
      <div className={styles.header}>
        {!collapsed && <h2>{t("windowProjects.title")}</h2>}
        {!collapsed && (
          <IconButton
            icon="plus"
            title={t("windowProjects.add")}
            disabled={disabled}
            onClick={() => void addWindowProjects()}
          />
        )}
        <IconButton
          icon={collapsed ? "chevron-right" : "chevron-left"}
          title={t(collapsed ? "windowProjects.expand" : "windowProjects.collapse")}
          aria-expanded={!collapsed}
          aria-controls={listId}
          onClick={() => setWindowProjectsCollapsed(!collapsed)}
        />
      </div>
      {!collapsed && <p className={styles.hint}>{t("windowProjects.hint")}</p>}
      <ul id={listId} className={styles.list}>
        {projects.map((project) => {
          const active = !remote && !!root && projectPathKey(root) === projectPathKey(project.path);
          return (
            <li key={projectPathKey(project.path)} className={clsx(styles.project, active && styles.active)}>
              <button
                type="button"
                className={styles.open}
                title={
                  collapsed
                    ? `${project.name}\n${project.path}\n${t(active ? "windowProjects.open" : "windowProjects.closed")}`
                    : project.path
                }
                aria-label={
                  collapsed
                    ? `${project.name} — ${t(active ? "windowProjects.open" : "windowProjects.closed")}`
                    : undefined
                }
                aria-current={active ? "true" : undefined}
                disabled={disabled || active}
                onClick={() => void activateWindowProject(project.path)}
              >
                {collapsed ? (
                  <ProjectBadge name={project.name} className={styles.badge} />
                ) : (
                  <>
                    <Icon name={active ? "folder-open" : "folder"} size={16} />
                    <span className={styles.details}>
                      <span className={styles.name}>{project.name}</span>
                      <span className={styles.path}>{project.path}</span>
                      <span className={styles.status}>
                        {t(active ? "windowProjects.open" : "windowProjects.closed")}
                      </span>
                    </span>
                  </>
                )}
              </button>
              {!collapsed && (
                <div className={styles.actions}>
                  {active && (
                    <IconButton
                      icon="close"
                      size="small"
                      title={t("windowProjects.close")}
                      disabled={disabled}
                      onClick={() => void closeWindowProject()}
                    />
                  )}
                  <IconButton
                    icon="minus"
                    size="small"
                    title={t("windowProjects.remove")}
                    disabled={disabled}
                    onClick={() => void removeWindowProject(project.path)}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {!collapsed && !projects.length && <p className={styles.empty}>{t("windowProjects.empty")}</p>}
      {collapsed ? (
        <IconButton
          icon="plus"
          title={t("windowProjects.add")}
          disabled={disabled}
          onClick={() => void addWindowProjects()}
        />
      ) : (
        <Button icon="plus" variant="ghost" size="small" disabled={disabled} onClick={() => void addWindowProjects()}>
          {t("windowProjects.add")}
        </Button>
      )}
    </aside>
  );
}
