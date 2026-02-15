import { html, nothing } from "lit";
import type { Tab } from "../navigation.ts";
import { icons } from "../icons.ts";

export type QuickSettingsSection = "models" | "skills" | "cron" | "memory" | "channels";

export type ModelOption = { id: string; label: string };

export type QuickSettingsNavigateOptions = {
  agentsPanel?: "overview" | "files" | "tools" | "skills" | "channels" | "cron";
};

export type QuickSettingsProps = {
  open: boolean;
  connected: boolean;
  section: QuickSettingsSection;
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
  onModelPrimaryChange: (modelId: string | null) => void;
  onModelFallbacksChange: (fallbacks: string[]) => void;
  onSaveConfig: () => void;
};

function sectionLabel(section: QuickSettingsSection) {
  switch (section) {
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

  const sections: QuickSettingsSection[] = ["models", "skills", "cron", "memory", "channels"];

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
