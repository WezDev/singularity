// ============================================
// OpenClaw Configuration Types
// Mirrors the Zod schema at src/config/zod-schema.ts in openclaw/openclaw
// ============================================

export interface OpenClawConfig {
  meta?: ConfigMeta;
  gateway?: GatewayConfig;
  identity?: IdentityConfig;
  agents?: AgentsConfig;
  channels?: ChannelsConfig;
  models?: ModelsConfig;
  auth?: AuthConfig;
  tools?: ToolsConfig;
  memory?: MemoryConfig;
  session?: SessionConfig;
  wizard?: WizardConfig;
  cron?: CronJobDefinition[];
  // $schema is allowed as the only unknown key
  $schema?: string;
}

// ---- Meta ----
export interface ConfigMeta {
  lastTouchedVersion?: string;
  lastTouchedAt?: string;
}

// ---- Gateway ----
export interface GatewayConfig {
  port?: number;
  mode?: 'local' | 'hybrid' | 'remote';
  bind?: 'loopback' | 'all';
  auth?: GatewayAuth;
  reload?: boolean;
  remote?: string;
}

export interface GatewayAuth {
  mode?: 'token' | 'password' | 'none';
  token?: string;
  password?: string;
  allowTailscale?: boolean;
}

// ---- Identity ----
export interface IdentityConfig {
  name?: string;
  emoji?: string;
  theme?: string;
  avatar?: string;
}

// ---- Agents ----
export interface AgentsConfig {
  defaults?: AgentDefaults;
  list?: AgentEntry[];
  bindings?: AgentBinding[];
}

export interface AgentDefaults {
  workspace?: string;
  model?: ModelSelection;
  models?: Record<string, ModelMeta>;
  heartbeat?: HeartbeatConfig;
  elevated?: ElevatedConfig;
  elevatedDefault?: string;
}

export interface AgentEntry {
  id: string;
  name?: string;
  default?: boolean;
  workspace?: string;
  model?: ModelSelection;
  tools?: AgentToolsConfig;
  description?: string;
  role?: string;
}

export interface AgentToolsConfig {
  policy?: {
    deny?: string[];
    allow?: string[];
  };
}

export interface AgentBinding {
  agentId: string;
  match: {
    channel?: string;
    peer?: {
      kind?: 'group' | 'dm';
      id?: string;
    };
  };
}

export interface ModelSelection {
  primary?: string;
  fallbacks?: string[];
}

export interface ModelMeta {
  alias?: string;
}

export interface HeartbeatConfig {
  every?: string;
  target?: 'last' | 'isolated';
}

export interface ElevatedConfig {
  enabled?: boolean;
  default?: string;
}

// ---- Channels ----
export interface ChannelsConfig {
  telegram?: TelegramChannelConfig;
  discord?: DiscordChannelConfig;
  slack?: SlackChannelConfig;
  signal?: SignalChannelConfig;
  imessage?: iMessageChannelConfig;
  whatsapp?: WhatsAppChannelConfig;
  [key: string]: ChannelConfigBase | undefined;
}

export interface ChannelConfigBase {
  enabled?: boolean;
}

export interface TelegramChannelConfig extends ChannelConfigBase {
  botToken?: string;
  dmPolicy?: 'pairing' | 'allowlist' | 'open' | 'disabled';
  allowFrom?: string[];
}

export interface DiscordChannelConfig extends ChannelConfigBase {
  botToken?: string;
}

export interface SlackChannelConfig extends ChannelConfigBase {
  botToken?: string;
  appToken?: string;
}

export interface SignalChannelConfig extends ChannelConfigBase {}
export interface iMessageChannelConfig extends ChannelConfigBase {}
export interface WhatsAppChannelConfig extends ChannelConfigBase {
  allowFrom?: string[];
}

// ---- Models ----
export interface ModelsConfig {
  mode?: 'merge' | 'replace';
  providers?: Record<string, ModelProvider>;
}

export interface ModelProvider {
  baseUrl?: string;
  apiKey?: string;
  api?: 'openai-completions' | 'openai-responses' | 'anthropic';
  models?: ModelDefinition[];
}

export interface ModelDefinition {
  id: string;
  name?: string;
  reasoning?: boolean;
  input?: string[];
  cost?: {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  contextWindow?: number;
  maxTokens?: number;
}

// ---- Auth ----
export interface AuthConfig {
  profiles?: Record<string, AuthProfile>;
  order?: Record<string, string[]>;
}

export interface AuthProfile {
  mode: 'oauth' | 'api_key';
  email?: string;
}

// ---- Tools ----
export interface ToolsConfig {
  web?: Record<string, unknown>;
  browser?: Record<string, unknown>;
  elevated?: Record<string, unknown>;
  sandbox?: SandboxConfig;
  [key: string]: unknown;
}

export interface SandboxConfig {
  mode?: string;
  scope?: string;
  docker?: {
    image?: string;
    network?: string;
    readOnlyRoot?: boolean;
  };
}

// ---- Memory ----
export interface MemoryConfig {
  flush?: {
    softThresholdTokens?: number;
    prompt?: string;
  };
}

// ---- Session ----
export interface SessionConfig {
  [key: string]: unknown;
}

// ---- Wizard ----
export interface WizardConfig {
  lastRunAt?: string;
  lastRunVersion?: string;
  lastRunCommand?: string;
  lastRunMode?: string;
}

// ---- Cron ----
export interface CronJobDefinition {
  name: string;
  schedule: {
    kind: 'cron';
    expr: string;
  };
  sessionTarget?: 'isolated' | 'last';
  agentId?: string;
  payload?: {
    kind: 'agentTurn';
    message: string;
    model?: string;
    timeoutSeconds?: number;
  };
}

// ---- SDK Options ----
export interface OpenClawSDKOptions {
  configPath?: string;
  gatewayUrl?: string;
  gatewayToken?: string;
  dbPath?: string;
}
