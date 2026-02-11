export type TaskStatus = "backlog" | "active" | "done";

export interface Attachment {
  id: string;
  taskId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  createdAt: string;
}

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
  createdAt: string;
}

export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
}

export type MessageRole = "user" | "assistant" | "tool" | "status" | "error";

export interface Message {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  toolName: string | null;
  createdAt: string;
}

export type Session =
  | { id: string; taskId: string; status: "pending"; todos: TodoItem[] | null; createdAt: string }
  | {
      id: string;
      taskId: string;
      status: "provisioning";
      containerName: string;
      worktreePath: string;
      todos: TodoItem[] | null;
      createdAt: string;
    }
  | {
      id: string;
      taskId: string;
      status: "running";
      containerName: string;
      worktreePath: string;
      ccSessionId: string;
      branch: string;
      todos: TodoItem[] | null;
      createdAt: string;
    }
  | {
      id: string;
      taskId: string;
      status: "waiting_for_input";
      containerName: string;
      worktreePath: string;
      ccSessionId: string;
      branch: string;
      todos: TodoItem[] | null;
      createdAt: string;
    }
  | {
      id: string;
      taskId: string;
      status: "done";
      containerName: string;
      worktreePath: string;
      ccSessionId: string;
      branch: string;
      todos: TodoItem[] | null;
      createdAt: string;
      completedAt: string;
    }
  | {
      id: string;
      taskId: string;
      status: "failed";
      containerName: string;
      worktreePath: string | null;
      error: string;
      todos: TodoItem[] | null;
      createdAt: string;
      completedAt: string;
    };
