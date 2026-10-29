import clsx from "clsx";
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
  useWindowProjects,
} from "./windowProjectList";
import styles from "./WindowProjects.module.css";

export function WindowProjects() {
  const t = useT();
  const projects = useWindowProjects((s) => s.projects);
  const busy = useWindowProjects((s) => s.busy);
  const opening = useProject((s) => s.opening);
  const root = useProject((s) => s.project?.root);
  const remote = useRemote((s) => s.session !== null);
  const disabled = busy || opening;
  return (
    <aside className={styles.sidebar} aria-label={t("windowProjects.title")} aria-busy={disabled}>
      <div className={styles.header}>
        <h2>{t("windowProjects.title")}</h2>
        <IconButton
          icon="plus"
          title={t("windowProjects.add")}
          disabled={disabled}
          onClick={() => void addWindowProjects()}
        />
      </div>
      <p className={styles.hint}>{t("windowProjects.hint")}</p>
      <ul className={styles.list}>
        {projects.map((project) => {
          const active = !remote && !!root && projectPathKey(root) === projectPathKey(project.path);
          return (
            <li key={projectPathKey(project.path)} className={clsx(styles.project, active && styles.active)}>
              <button
                type="button"
                className={styles.open}
                title={project.path}
                aria-current={active ? "true" : undefined}
                disabled={disabled || active}
                onClick={() => void activateWindowProject(project.path)}
              >
                <Icon name={active ? "folder-open" : "folder"} size={16} />
                <span className={styles.details}>
                  <span className={styles.name}>{project.name}</span>
                  <span className={styles.path}>{project.path}</span>
                  <span className={styles.status}>{t(active ? "windowProjects.open" : "windowProjects.closed")}</span>
                </span>
              </button>
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
            </li>
          );
        })}
      </ul>
      {!projects.length && <p className={styles.empty}>{t("windowProjects.empty")}</p>}
      <Button icon="plus" variant="ghost" size="small" disabled={disabled} onClick={() => void addWindowProjects()}>
        {t("windowProjects.add")}
      </Button>
    </aside>
  );
}
