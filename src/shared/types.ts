export type TaskStatus = "backlog" | "active" | "done";

export type SessionStatus =
  | "pending"
  | "provisioning"
  | "running"
  | "waiting_for_input"
  | "done"
  | "failed";

export interface Project {
  id: string;
  name: string;
  repoUrl: string | null;
  localPath: string;
  createdAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  pinned: boolean;
  status: TaskStatus;
  sessionStatus: SessionStatus | null;
  worktreePath: string | null;
  branch: string | null;
  sessionStartedAt: string | null;
  sessionError: string | null;
  createdAt: string;
}

export interface SessionLog {
  id: string;
  taskId: string;
  startedAt: string;
  endedAt: string;
  exitStatus: "done" | "failed";
  error: string | null;
}

export interface Attachment {
  id: string;
  taskId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  createdAt: string;
}
