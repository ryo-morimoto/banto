export type TaskStatus = "backlog" | "active" | "done";

export type SessionStatus = "pending" | "provisioning" | "running" | "done" | "failed";

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
  createdAt: string;
}

export type Session =
  | { id: string; taskId: string; status: "pending"; createdAt: string }
  | {
      id: string;
      taskId: string;
      status: "provisioning";
      containerName: string;
      createdAt: string;
    }
  | {
      id: string;
      taskId: string;
      status: "running";
      containerName: string;
      ccSessionId: string;
      branch: string;
      createdAt: string;
    }
  | {
      id: string;
      taskId: string;
      status: "done";
      containerName: string;
      ccSessionId: string;
      branch: string;
      createdAt: string;
      completedAt: string;
    }
  | {
      id: string;
      taskId: string;
      status: "failed";
      containerName: string;
      error: string;
      createdAt: string;
      completedAt: string;
    };
