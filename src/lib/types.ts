export type ExecutorId =
  | "claude"
  | "claude-code"
  | "codex"
  | "cursor"
  | "local"

export type AgentKind = "orchestrator" | "worker"

export type RunStatus = "queued" | "running" | "done" | "error" | "cancelled"

export type SidebarView = "chats" | "agents" | "projects" | "settings"

export interface Agent {
  id: string
  name: string
  role: string
  instructions: string
  executor: ExecutorId
  model: string
  color: string
  kind: AgentKind
  canSpawn: boolean
  system: boolean
  enabled: boolean
  createdAt: string
}

export interface Project {
  id: string
  name: string
  path: string
  githubUrl?: string
  createdAt: string
}

export interface Thread {
  id: string
  projectId: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface ChatMessage {
  id: string
  threadId: string
  role: "user" | "assistant" | "system"
  agentId?: string
  runId?: string
  content: string
  createdAt: string
}

export type RunEventType =
  | "status"
  | "thinking"
  | "token"
  | "tool"
  | "spawn"
  | "diff"
  | "usage"
  | "error"
  | "done"

export interface RunEvent {
  id: string
  rootRunId: string
  runId: string
  type: RunEventType
  text?: string
  tool?: string
  path?: string
  patch?: string
  agentId?: string
  childRunId?: string
  inputTokens?: number
  outputTokens?: number
  ts: string
}

export interface Run {
  id: string
  threadId: string
  projectId: string
  agentId: string
  parentRunId?: string
  rootRunId: string
  prompt: string
  content: string
  thinking: string
  status: RunStatus
  executor: ExecutorId
  model: string
  usedMock: boolean
  worktreePath?: string
  error?: string
  events: RunEvent[]
  createdAt: string
  finishedAt?: string
}

export interface Settings {
  anthropicApiKey: string
  starimgApiKey: string
  starimgBaseUrl: string
  openaiApiKey: string
  cursorApiKey: string
  githubToken: string
  preferCli: boolean
}

export interface ProbeResult {
  executor: ExecutorId
  available: boolean
  detail: string
}

export interface ClaudeSubscription {
  installed: boolean
  loggedIn: boolean
  ready: boolean
  binary: string | null
  email: string | null
  detail: string
  hint: string
}

export interface ArtelState {
  version: 1
  projects: Project[]
  agents: Agent[]
  threads: Thread[]
  messages: ChatMessage[]
  runs: Run[]
  settings: Settings
}

export interface GithubAccount {
  connected: boolean
  login: string | null
  name: string | null
  detail: string
}

export interface GithubRepo {
  fullName: string
  name: string
  htmlUrl: string
  cloneUrl: string
  private: boolean
  description: string
  defaultBranch: string
}

export interface FileNode {
  name: string
  path: string
  type: "file" | "dir"
  children?: FileNode[]
}
