import { html, nothing } from "lit";
import type { HrCoreSettings } from "../agenthr/hr-core-storage.ts";
import type { Tab } from "../navigation.ts";
import type { UiSettings } from "../storage.ts";
import { icons } from "../icons.ts";

export type QuickSettingsSection =
  | "gateway"
  | "hrcore"
  | "models"
  | "skills"
  | "cron"
  | "memory"
  | "channels";

export type ModelOption = { id: string; label: string };

export type QuickSettingsNavigateOptions = {
  agentsPanel?: "overview" | "files" | "tools" | "skills" | "channels" | "cron";
};

export type QuickSettingsProps = {
  open: boolean;
  connected: boolean;
  section: QuickSettingsSection;
  settings: UiSettings;
  password: string;
  lastError: string | null;
  agentId: string | null;
  configLoaded: boolean;
  configSaving: boolean;
  configDirty: boolean;
  modelOptions: ModelOption[];
  modelPrimary: string | null;
  modelFallbacks: string[];
  onClose: () => void;
  onSectionChange: (section: QuickSettingsSection) => void;
  onNavigate: (tab: Tab, opts?: QuickSettingsNavigateOptions) => void;
  onSettingsChange: (next: UiSettings) => void;
  onPasswordChange: (next: string) => void;
  onConnect: () => void;
  // HR Core auth/settings (AgentHR)
  hrCoreSettings: HrCoreSettings;
  hrCoreLoginUsername: string;
  hrCoreLoginPassword: string;
  hrCoreLoginBusy: boolean;
  hrCoreError: string | null;
  onHrCoreSettingsChange: (next: HrCoreSettings) => void;
  onHrCoreLoginUsernameChange: (next: string) => void;
  onHrCoreLoginPasswordChange: (next: string) => void;
  onHrCoreLogin: () => void;
  onHrCoreLogout: () => void;
  onModelPrimaryChange: (modelId: string | null) => void;
  onModelFallbacksChange: (fallbacks: string[]) => void;
  onSaveConfig: () => void;
};

function sectionLabel(section: QuickSettingsSection) {
  switch (section) {
    case "gateway":
      return "连接";
    case "hrcore":
      return "HR Core";
    case "models":
      return "模型";
    case "skills":
      return "Skill";
    case "cron":
      return "定时作业";
    case "memory":
      return "Memory";
    case "channels":
      return "Channel";
    default:
      return "设置";
  }
}

function parseCsvList(raw: string) {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function renderSectionContent(props: QuickSettingsProps) {
  if (props.section === "gateway") {
    const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
    const proto = location.protocol === "https:" ? "wss" : "ws";
    // Prefer whatever the user already configured; otherwise suggest AgentHR dev gateway.
    const suggestedGateway =
      props.settings.gatewayUrl.trim() ||
      (isLocal ? `${proto}://127.0.0.1:19001` : props.settings.gatewayUrl);
    const lastError = props.lastError?.trim() || null;

    return html`
      <div class="qs-section-title">连接 Gateway</div>
      <div class="muted qs-section-sub">
        你现在是通过 Vite dev server 打开的页面，需单独连接到 Gateway WebSocket 才能聊天/加载 Threads。
      </div>

      ${lastError ? html`<div class="callout danger" style="margin-top: 12px;">${lastError}</div>` : nothing}

      <div class="form-grid" style="margin-top: 14px;">
        <label class="field">
          <span>Gateway URL (ws/wss)</span>
          <input
            class="mono"
            .value=${props.settings.gatewayUrl}
            placeholder="ws://127.0.0.1:19001"
            @input=${(e: Event) => {
              const v = (e.target as HTMLInputElement).value;
              props.onSettingsChange({ ...props.settings, gatewayUrl: v });
            }}
          />
        </label>

        <label class="field">
          <span>Token (optional)</span>
          <input
            type="password"
            class="mono"
            .value=${props.settings.token}
            placeholder="gateway token"
            @input=${(e: Event) => {
              const v = (e.target as HTMLInputElement).value;
              props.onSettingsChange({ ...props.settings, token: v });
            }}
          />
        </label>

        <label class="field">
          <span>Password (optional)</span>
          <input
            type="password"
            class="mono"
            .value=${props.password}
            placeholder="shared/system password"
            @input=${(e: Event) => props.onPasswordChange((e.target as HTMLInputElement).value)}
          />
        </label>
      </div>

      <div class="row" style="margin-top: 14px;">
        <button
          class="btn"
          @click=${() => {
            props.onSettingsChange({ ...props.settings, gatewayUrl: suggestedGateway });
          }}
          title="Fill local dev gateway URL"
        >
          ${icons.link} 用本机 Gateway (${suggestedGateway})
        </button>
        <button class="btn primary" @click=${() => props.onConnect()}>
          ${props.connected ? icons.check : icons.zap} ${props.connected ? "已连接" : "Connect"}
        </button>
      </div>

      <div class="muted" style="margin-top: 10px;">
        本机启动 Gateway 示例: <span class="mono">pnpm -C vendor/openclaw gateway:dev</span>
      </div>
    `;
  }

  if (props.section === "hrcore") {
    const token = props.hrCoreSettings.token.trim();
    const baseUrl = props.hrCoreSettings.baseUrl.trim();
    const user = props.hrCoreSettings.user;
    const passwordLen = (props.hrCoreLoginPassword ?? "").length;
    return html`
      <div class="qs-section-title">HR Core 登录</div>
      <div class="muted qs-section-sub">
        Directory 面板的数据来自 HR Core 数据库；登录/登出在这里管理。
      </div>

      ${
        props.hrCoreError
          ? html`<div class="callout danger" style="margin-top: 12px;">${props.hrCoreError}</div>`
          : nothing
      }

      <div class="form-grid" style="margin-top: 14px;">
        <label class="field">
          <span>HR Core Base URL</span>
          <input
            class="mono"
            .value=${baseUrl}
            placeholder="http://127.0.0.1:3001"
            @input=${(e: Event) => {
              const v = (e.target as HTMLInputElement).value;
              props.onHrCoreSettingsChange({ ...props.hrCoreSettings, baseUrl: v });
            }}
          />
        </label>

        <label class="field">
          <span>Token (JWT)</span>
          <input
            type="password"
            class="mono"
            .value=${props.hrCoreSettings.token}
            placeholder="paste token"
            @input=${(e: Event) => {
              const v = (e.target as HTMLInputElement).value;
              props.onHrCoreSettingsChange({ ...props.hrCoreSettings, token: v });
            }}
          />
        </label>

        <div class="muted" style="grid-column: 1 / -1;">
          或使用账号密码获取 token（dev seed 默认: <span class="mono">hr001 / hr123456</span>）。
        </div>

        <label class="field">
          <span>Username</span>
          <input
            class="mono"
            .value=${props.hrCoreLoginUsername}
            placeholder="hr001"
            @input=${(e: Event) =>
              props.onHrCoreLoginUsernameChange((e.target as HTMLInputElement).value)}
          />
        </label>

        <label class="field">
          <span>Password</span>
          <input
            type="password"
            class="mono"
            .value=${props.hrCoreLoginPassword}
            placeholder="hr123456"
            @input=${(e: Event) =>
              props.onHrCoreLoginPasswordChange((e.target as HTMLInputElement).value)}
          />
          <div class="muted" style="margin-top: 6px;">Password length: ${passwordLen}</div>
        </label>
      </div>

      <div class="row" style="margin-top: 14px; flex-wrap: wrap;">
        <button class="btn primary" ?disabled=${props.hrCoreLoginBusy} @click=${() => props.onHrCoreLogin()}>
          ${props.hrCoreLoginBusy ? icons.loader : icons.zap} Login
        </button>
        <button class="btn" type="button" @click=${() => props.onHrCoreLoginPasswordChange("")}>
          ${icons.x} Clear password
        </button>
        <button class="btn" ?disabled=${!token} @click=${() => props.onHrCoreLogout()}>
          ${icons.x} Logout
        </button>
        ${
          token
            ? html`<span class="muted" style="align-self:center;">
                当前用户: <span class="mono">${user ? `${user.username} (${user.role})` : "unknown"}</span>
              </span>`
            : nothing
        }
      </div>
    `;
  }

  if (!props.connected) {
    return html`
      <div class="callout danger">未连接 Gateway，无法修改设置。</div>
    `;
  }

  if (props.section === "models") {
    if (!props.configLoaded) {
      return html`
        <div class="callout danger">Config 尚未加载，无法切换模型。</div>
        <div class="row" style="margin-top: 12px;">
          <button class="btn" @click=${() => props.onNavigate("config")}>打开 Config</button>
          <button class="btn" @click=${() => props.onNavigate("agents", { agentsPanel: "overview" })}>
            打开 Agents
          </button>
        </div>
      `;
    }

    const fallbacksText = (props.modelFallbacks ?? []).join(", ");
    const hasOptions = props.modelOptions.length > 0;
    return html`
      <div class="qs-section-title">切换模型</div>
      <div class="muted qs-section-sub">
        当前 Agent: <span class="mono">${props.agentId ?? "-"}</span>
      </div>

      <div class="form-grid" style="margin-top: 14px;">
        <label class="field">
          <span>Primary model</span>
          <select
            .value=${props.modelPrimary ?? ""}
            ?disabled=${!hasOptions}
            @change=${(e: Event) => {
              const next = (e.target as HTMLSelectElement).value.trim();
              props.onModelPrimaryChange(next ? next : null);
            }}
          >
            <option value="">(默认)</option>
            ${props.modelOptions.map((opt) => html`<option value=${opt.id}>${opt.label}</option>`)}
          </select>
          ${
            !hasOptions
              ? html`
                  <div class="muted" style="margin-top: 6px">未配置可选模型。</div>
                `
              : nothing
          }
        </label>

        <label class="field">
          <span>Fallbacks (comma-separated)</span>
          <input
            .value=${fallbacksText}
            placeholder="provider/model, provider/model"
            @change=${(e: Event) => {
              const raw = (e.target as HTMLInputElement).value;
              props.onModelFallbacksChange(parseCsvList(raw));
            }}
          />
        </label>
      </div>

      <div class="row" style="margin-top: 14px;">
        <button
          class="btn"
          ?disabled=${props.configSaving || !props.configDirty}
          @click=${() => props.onSaveConfig()}
          title=${props.configDirty ? "保存 openclaw.json" : "没有未保存的修改"}
        >
          ${props.configSaving ? icons.loader : icons.check} 保存 Config
        </button>
        <button class="btn" @click=${() => props.onNavigate("agents", { agentsPanel: "overview" })}>
          打开 Agents
        </button>
      </div>
    `;
  }

  if (props.section === "skills") {
    return html`
      <div class="qs-section-title">写 Skill / 管理 Skill</div>
      <div class="muted qs-section-sub">
        Skill 安装、启用、API Key 注入在 Skills 页面管理；Agent 级别的 skills allow/deny 在 Agents 页面。
      </div>
      <div class="row" style="margin-top: 14px;">
        <button class="btn" @click=${() => props.onNavigate("skills")}>打开 Skills</button>
        <button class="btn" @click=${() => props.onNavigate("agents", { agentsPanel: "skills" })}>
          打开 Agents (Skills)
        </button>
      </div>
    `;
  }

  if (props.section === "cron") {
    return html`
      <div class="qs-section-title">定时作业</div>
      <div class="muted qs-section-sub">创建/启用/运行 Cron Jobs。</div>
      <div class="row" style="margin-top: 14px;">
        <button class="btn" @click=${() => props.onNavigate("cron")}>打开 Cron Jobs</button>
        <button class="btn" @click=${() => props.onNavigate("agents", { agentsPanel: "cron" })}>
          打开 Agents (Cron)
        </button>
      </div>
    `;
  }

  if (props.section === "memory") {
    return html`
      <div class="qs-section-title">修改 Memory</div>
      <div class="muted qs-section-sub">
        Memory 文件通过 Agents 的 Files 面板编辑（例如 AGENTS.md、SOUL.md、USER.md、memory/*.md）。
      </div>
      <div class="row" style="margin-top: 14px;">
        <button class="btn" @click=${() => props.onNavigate("agents", { agentsPanel: "files" })}>
          打开 Agents (Files)
        </button>
      </div>
    `;
  }

  if (props.section === "channels") {
    return html`
      <div class="qs-section-title">配置 Channel</div>
      <div class="muted qs-section-sub">管理 WhatsApp / Telegram / Discord / Signal / iMessage 等。</div>
      <div class="row" style="margin-top: 14px;">
        <button class="btn" @click=${() => props.onNavigate("channels")}>打开 Channels</button>
        <button class="btn" @click=${() => props.onNavigate("agents", { agentsPanel: "channels" })}>
          打开 Agents (Channels)
        </button>
      </div>
    `;
  }

  return nothing;
}

export function renderQuickSettings(props: QuickSettingsProps) {
  if (!props.open) {
    return nothing;
  }

  const sections: QuickSettingsSection[] = [
    "gateway",
    "hrcore",
    "models",
    "skills",
    "cron",
    "memory",
    "channels",
  ];

  return html`
    <div
      class="quick-settings-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Quick settings"
      @click=${() => props.onClose()}
    >
      <div class="quick-settings-card" @click=${(e: Event) => e.stopPropagation()}>
        <div class="quick-settings-header">
          <div>
            <div class="quick-settings-title">设置</div>
            <div class="quick-settings-sub">模型 / Skill / 定时 / Memory / Channel</div>
          </div>
          <button class="btn btn--sm btn--icon" @click=${() => props.onClose()} title="Close">
            ${icons.x}
          </button>
        </div>

        <div class="quick-settings-body">
          <aside class="quick-settings-nav">
            ${sections.map((section) => {
              const active = props.section === section;
              return html`
                <button
                  class="quick-settings-nav-item ${active ? "active" : ""}"
                  @click=${() => props.onSectionChange(section)}
                  aria-pressed=${active}
                >
                  <span class="quick-settings-nav-text">${sectionLabel(section)}</span>
                </button>
              `;
            })}
          </aside>

          <section class="quick-settings-content">
            ${renderSectionContent(props)}
          </section>
        </div>
      </div>
    </div>
  `;
}
