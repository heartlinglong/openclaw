import { html, nothing } from "lit";
import { ref } from "lit/directives/ref.js";
import { repeat } from "lit/directives/repeat.js";
import type { HrCoreSettings } from "../agenthr/hr-core-storage.ts";
import type {
  HrCoreEmployee,
  HrCoreLegalEntity,
  HrCoreOrgUnit,
  HrCorePosition,
  HrCoreSearchResult,
} from "../agenthr/hr-core.ts";
import type { SessionsListResult } from "../types.ts";
import type { GatewaySessionRow } from "../types.ts";
import type { ChatItem, MessageGroup } from "../types/chat-types.ts";
import type { ChatAttachment, ChatQueueItem } from "../ui-types.ts";
import {
  renderMessageGroup,
  renderReadingIndicatorGroup,
  renderStreamingGroup,
} from "../chat/grouped-render.ts";
import { normalizeMessage, normalizeRoleForGrouping } from "../chat/message-normalizer.ts";
import "../components/resizable-divider.ts";
import { icons } from "../icons.ts";
import { renderMarkdownSidebar } from "./markdown-sidebar.ts";

export type CompactionIndicatorStatus = {
  active: boolean;
  startedAt: number | null;
  completedAt: number | null;
};

export type ChatProps = {
  sessionKey: string;
  onSessionKeyChange: (next: string) => void;
  thinkingLevel: string | null;
  showThinking: boolean;
  loading: boolean;
  sending: boolean;
  canAbort?: boolean;
  compactionStatus?: CompactionIndicatorStatus | null;
  messages: unknown[];
  toolMessages: unknown[];
  stream: string | null;
  streamStartedAt: number | null;
  assistantAvatarUrl?: string | null;
  draft: string;
  queue: ChatQueueItem[];
  connected: boolean;
  canSend: boolean;
  disabledReason: string | null;
  error: string | null;
  sessions: SessionsListResult | null;
  // Focus mode
  focusMode: boolean;
  // Sidebar state
  sidebarOpen?: boolean;
  sidebarContent?: string | null;
  sidebarError?: string | null;
  splitRatio?: number;
  assistantName: string;
  assistantAvatar: string | null;
  // Chat settings popover
  settingsMenuOpen?: boolean;
  onSettingsMenuOpenChange?: (open: boolean) => void;
  onOpenQuickSettings?: (
    section: "gateway" | "hrcore" | "models" | "skills" | "cron" | "memory" | "channels",
  ) => void;
  onNavigateToTab?: (tab: "channels" | "cron" | "skills" | "agents" | "config") => void;
  // Right action panel
  actionPanelTab: "context" | "directory" | "activity";
  onActionPanelTabChange: (tab: "context" | "directory" | "activity") => void;
  // HR Core directory (DB-backed; not memory)
  hrCoreSettings: HrCoreSettings;
  hrCoreLoginUsername: string;
  hrCoreLoginPassword: string;
  hrCoreLoginBusy: boolean;
  hrCoreError: string | null;
  hrCoreQuery: string;
  hrCoreSearching: boolean;
  hrCoreSearchResult: HrCoreSearchResult | null;
  hrCoreSearchNotice: string | null;
  hrCoreSelected:
    | { kind: "employee"; empNo: string; data: HrCoreEmployee | null }
    | { kind: "orgUnit"; code: string; data: HrCoreOrgUnit | null }
    | { kind: "position"; code: string; data: HrCorePosition | null }
    | { kind: "legalEntity"; code: string; data: HrCoreLegalEntity | null }
    | null;
  hrCoreOrgUnitsLoading: boolean;
  hrCoreOrgUnits: HrCoreOrgUnit[];
  hrCoreOrgExpanded: Record<string, boolean>;
  onHrCoreSettingsChange: (next: HrCoreSettings) => void;
  onHrCoreLoginUsernameChange: (next: string) => void;
  onHrCoreLoginPasswordChange: (next: string) => void;
  onHrCoreLogin: () => void;
  onHrCoreLogout: () => void;
  onHrCoreQueryChange: (next: string) => void;
  onHrOrgUnitsLoad: () => void;
  onHrOrgExpandedToggle: (code: string) => void;
  onHrCoreHitSelect: (hit: {
    kind: "employee" | "orgUnit" | "position" | "legalEntity";
    key: string;
  }) => void;
  // Image attachments
  attachments?: ChatAttachment[];
  onAttachmentsChange?: (attachments: ChatAttachment[]) => void;
  // Scroll control
  showNewMessages?: boolean;
  onScrollToBottom?: () => void;
  // Event handlers
  onRefresh: () => void;
  onToggleFocusMode: () => void;
  onDraftChange: (next: string) => void;
  onSend: () => void;
  onAbort?: () => void;
  onQueueRemove: (id: string) => void;
  onNewSession: () => void;
  onOpenSidebar?: (content: string) => void;
  onCloseSidebar?: () => void;
  onSplitRatioChange?: (ratio: number) => void;
  onChatScroll?: (event: Event) => void;
};

const COMPACTION_TOAST_DURATION_MS = 5000;

function adjustTextareaHeight(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

function renderCompactionIndicator(status: CompactionIndicatorStatus | null | undefined) {
  if (!status) {
    return nothing;
  }

  // Show "compacting..." while active
  if (status.active) {
    return html`
      <div class="callout info compaction-indicator compaction-indicator--active">
        ${icons.loader} Compacting context...
      </div>
    `;
  }

  // Show "compaction complete" briefly after completion
  if (status.completedAt) {
    const elapsed = Date.now() - status.completedAt;
    if (elapsed < COMPACTION_TOAST_DURATION_MS) {
      return html`
        <div class="callout success compaction-indicator compaction-indicator--complete">
          ${icons.check} Context compacted
        </div>
      `;
    }
  }

  return nothing;
}

function generateAttachmentId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function handlePaste(e: ClipboardEvent, props: ChatProps) {
  const items = e.clipboardData?.items;
  if (!items || !props.onAttachmentsChange) {
    return;
  }

  const imageItems: DataTransferItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type.startsWith("image/")) {
      imageItems.push(item);
    }
  }

  if (imageItems.length === 0) {
    return;
  }

  e.preventDefault();

  for (const item of imageItems) {
    const file = item.getAsFile();
    if (!file) {
      continue;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const dataUrl = reader.result as string;
      const newAttachment: ChatAttachment = {
        id: generateAttachmentId(),
        dataUrl,
        mimeType: file.type,
      };
      const current = props.attachments ?? [];
      props.onAttachmentsChange?.([...current, newAttachment]);
    });
    reader.readAsDataURL(file);
  }
}

function renderAttachmentPreview(props: ChatProps) {
  const attachments = props.attachments ?? [];
  if (attachments.length === 0) {
    return nothing;
  }

  return html`
    <div class="chat-attachments cp-attachments">
      ${attachments.map(
        (att) => html`
          <div class="chat-attachment cp-attachment cp-attachment--image">
            <img
              src=${att.dataUrl}
              alt="Attachment preview"
              class="chat-attachment__img cp-attachment__preview"
            />
            <button
              class="chat-attachment__remove cp-attachment__remove"
              type="button"
              aria-label="Remove attachment"
              @click=${() => {
                const next = (props.attachments ?? []).filter((a) => a.id !== att.id);
                props.onAttachmentsChange?.(next);
              }}
            >
              ${icons.x}
            </button>
          </div>
        `,
      )}
    </div>
  `;
}

function renderKv(label: string, value: unknown) {
  const text = value == null ? "" : String(value);
  return html`
    <div class="ahr-kv">
      <div class="ahr-kv__k">${label}</div>
      <div class="ahr-kv__v mono">${text || "-"}</div>
    </div>
  `;
}

function renderDirectory(props: ChatProps) {
  const token = props.hrCoreSettings.token.trim();
  const baseUrl = props.hrCoreSettings.baseUrl.trim();
  const q = props.hrCoreQuery;
  const res = props.hrCoreSearchResult;

  if (!token) {
    return html`
      <div class="ahr-card">
        <div class="ahr-card__title">Directory (DB)</div>
        <div class="muted ahr-card__sub">
          Directory 只做数据库检索与查看。请在左下角 <b>设置</b> 里登录 HR Core。
        </div>
        <div class="row" style="margin-top: 12px;">
          <button
            class="btn primary"
            type="button"
            @click=${() => props.onOpenQuickSettings?.("hrcore")}
          >
            ${icons.settings} 去设置登录
          </button>
        </div>
      </div>
    `;
  }

  const searchBox = html`
    <div class="ahr-searchbox">
      <span class="ahr-searchbox__icon">${icons.search}</span>
      <input
        class="ahr-searchbox__input"
        .value=${q}
        placeholder="搜索 法人/组织/岗位/员工档案…"
        ?disabled=${!token}
        @input=${(e: Event) => props.onHrCoreQueryChange((e.target as HTMLInputElement).value)}
      />
      ${
        props.hrCoreSearching
          ? html`<span class="ahr-searchbox__spin">${icons.loader}</span>`
          : nothing
      }
    </div>
  `;

  const results = res
    ? html`
        <div class="ahr-dir-results">
          ${
            res.legal_entities.length
              ? html`
                <div class="ahr-dir-group">
                  <div class="ahr-dir-group__title">法人</div>
                  ${res.legal_entities.map(
                    (le) => html`
                      <button
                        class="ahr-dir-item"
                        type="button"
                        @click=${() => props.onHrCoreHitSelect({ kind: "legalEntity", key: le.code })}
                      >
                        <div class="ahr-dir-item__title">${le.name}</div>
                        <div class="ahr-dir-item__sub mono">${le.code} · ${le.country}</div>
                      </button>
                    `,
                  )}
                </div>
              `
              : nothing
          }

          ${
            res.org_units.length
              ? html`
                <div class="ahr-dir-group">
                  <div class="ahr-dir-group__title">组织</div>
                  ${res.org_units.map(
                    (o) => html`
                      <button
                        class="ahr-dir-item"
                        type="button"
                        @click=${() => props.onHrCoreHitSelect({ kind: "orgUnit", key: o.code })}
                      >
                        <div class="ahr-dir-item__title">${o.name}</div>
                        <div class="ahr-dir-item__sub mono">${o.code} · ${o.type}</div>
                      </button>
                    `,
                  )}
                </div>
              `
              : nothing
          }

          ${
            res.positions.length
              ? html`
                <div class="ahr-dir-group">
                  <div class="ahr-dir-group__title">岗位</div>
                  ${res.positions.map(
                    (p) => html`
                      <button
                        class="ahr-dir-item"
                        type="button"
                        @click=${() => props.onHrCoreHitSelect({ kind: "position", key: p.code })}
                      >
                        <div class="ahr-dir-item__title">${p.name}</div>
                        <div class="ahr-dir-item__sub mono">${p.code} · ${p.org_unit.code}</div>
                      </button>
                    `,
                  )}
                </div>
              `
              : nothing
          }

          ${
            res.employees.length
              ? html`
                <div class="ahr-dir-group">
                  <div class="ahr-dir-group__title">人员</div>
                  ${res.employees.map(
                    (e) => html`
                      <button
                        class="ahr-dir-item"
                        type="button"
                        @click=${() => props.onHrCoreHitSelect({ kind: "employee", key: e.emp_no })}
                      >
                        <div class="ahr-dir-item__title">${e.legal_name ?? "(未填写姓名)"}</div>
                        <div class="ahr-dir-item__sub mono">
                          ${e.emp_no}${e.org_unit ? ` · ${e.org_unit.code}` : ""}
                        </div>
                      </button>
                    `,
                  )}
                </div>
              `
              : nothing
          }
        </div>
      `
    : nothing;

  const selected = (() => {
    const sel = props.hrCoreSelected;
    if (!sel || !sel.data) return nothing;
    if (sel.kind === "employee") {
      const e = sel.data;
      return html`
        <div class="ahr-card">
          <div class="ahr-card__title">员工档案</div>
          <div class="ahr-card__sub mono">${e.emp_no}</div>
          <div class="ahr-kvgrid">
            ${renderKv("legal_name", e.profile?.legal_name ?? null)}
            ${renderKv("primary_phone", e.profile?.primary_phone ?? null)}
            ${renderKv("primary_email", e.profile?.primary_email ?? null)}
            ${renderKv("legal_entity", e.employment?.legal_entity?.code ?? null)}
            ${renderKv("org_unit", e.job_info?.org_unit?.code ?? null)}
            ${renderKv("position", e.job_info?.position?.code ?? null)}
            ${renderKv("manager", e.job_info?.manager_user?.username ?? null)}
          </div>
        </div>
      `;
    }
    if (sel.kind === "orgUnit") {
      const o = sel.data;
      return html`
        <div class="ahr-card">
          <div class="ahr-card__title">组织详情</div>
          <div class="ahr-card__sub mono">${o.code}</div>
          <div class="ahr-kvgrid">
            ${renderKv("code", o.code)}
            ${renderKv("name", o.name)}
            ${renderKv("type", o.type)}
            ${renderKv("parentCode", o.parentCode)}
          </div>
        </div>
      `;
    }
    if (sel.kind === "position") {
      const p = sel.data;
      return html`
        <div class="ahr-card">
          <div class="ahr-card__title">岗位详情</div>
          <div class="ahr-card__sub mono">${p.code}</div>
          <div class="ahr-kvgrid">
            ${renderKv("code", p.code)}
            ${renderKv("name", p.name)}
            ${renderKv("org_unit", p.org_unit?.code ?? null)}
            ${renderKv("status", p.status)}
          </div>
        </div>
      `;
    }
    const le = sel.data;
    return html`
      <div class="ahr-card">
        <div class="ahr-card__title">法人详情</div>
        <div class="ahr-card__sub mono">${le.code}</div>
        <div class="ahr-kvgrid">
          ${renderKv("code", le.code)}
          ${renderKv("name", le.name)}
          ${renderKv("country", le.country)}
          ${renderKv("status", le.status)}
        </div>
      </div>
    `;
  })();

  const orgTree = (() => {
    if (!token) return nothing;
    const nodes = props.hrCoreOrgUnits;
    if (nodes.length === 0) {
      return html`
        <div class="ahr-card">
          <div class="ahr-card__title">组织树</div>
          <div class="muted ahr-card__sub">点击加载组织数据后可展开/折叠。</div>
          <button class="btn" ?disabled=${props.hrCoreOrgUnitsLoading} @click=${props.onHrOrgUnitsLoad}>
            ${props.hrCoreOrgUnitsLoading ? icons.loader : icons.link} Load org units
          </button>
        </div>
      `;
    }

    const byParent = new Map<string | null, HrCoreOrgUnit[]>();
    for (const row of nodes) {
      const parent = row.parentCode ?? null;
      const list = byParent.get(parent) ?? [];
      list.push(row);
      byParent.set(parent, list);
    }
    for (const [k, list] of byParent.entries()) {
      list.sort((a, b) => a.code.localeCompare(b.code));
      byParent.set(k, list);
    }

    const renderNode = (row: HrCoreOrgUnit, depth: number) => {
      const children = byParent.get(row.code) ?? [];
      const hasChildren = children.length > 0;
      const expanded = Boolean(props.hrCoreOrgExpanded[row.code]);
      return html`
        <div class="ahr-tree__row" style=${`padding-left: ${8 + depth * 14}px`}>
          <button
            class="ahr-tree__toggle"
            type="button"
            ?disabled=${!hasChildren}
            @click=${() => props.onHrOrgExpandedToggle(row.code)}
          >
            ${hasChildren ? (expanded ? "▾" : "▸") : "·"}
          </button>
          <button
            class="ahr-tree__item"
            type="button"
            @click=${() => props.onHrCoreHitSelect({ kind: "orgUnit", key: row.code })}
          >
            <span class="mono">${row.code}</span>
            <span class="ahr-tree__name">${row.name}</span>
          </button>
        </div>
        ${hasChildren && expanded ? children.map((c) => renderNode(c, depth + 1)) : nothing}
      `;
    };

    const roots = byParent.get(null) ?? [];
    return html`
      <div class="ahr-card">
        <div class="ahr-card__title">组织树</div>
        <div class="muted ahr-card__sub">点击组织查看字段；展开/折叠子组织。</div>
        <div class="ahr-tree">
          ${roots.map((r) => renderNode(r, 0))}
        </div>
      </div>
    `;
  })();

  return html`
    ${
      token
        ? html`
      <div class="ahr-dir-top">
        ${searchBox}
        <div class="ahr-dir-meta">
          <span class="ahr-badge">DB</span>
          <span class="mono">${baseUrl}</span>
          ${
            props.hrCoreSettings.user
              ? html`<span class="muted">${props.hrCoreSettings.user.username} (${props.hrCoreSettings.user.role})</span>`
              : nothing
          }
        </div>
      </div>
    `
        : nothing
    }

    ${props.hrCoreSearchNotice ? html`<div class="callout info">${props.hrCoreSearchNotice}</div>` : nothing}
    ${props.hrCoreError ? html`<div class="callout danger">${props.hrCoreError}</div>` : nothing}
    ${token ? results : nothing}
    ${token ? selected : nothing}
    ${token ? orgTree : nothing}
  `;
}

export function renderChat(props: ChatProps) {
  const canCompose = props.connected;
  const isBusy = props.sending || props.stream !== null;
  const canAbort = Boolean(props.canAbort && props.onAbort);
  const activeSession = props.sessions?.sessions?.find((row) => row.key === props.sessionKey);
  const reasoningLevel = activeSession?.reasoningLevel ?? "off";
  const showReasoning = props.showThinking && reasoningLevel !== "off";
  const assistantIdentity = {
    name: props.assistantName,
    avatar: props.assistantAvatar ?? props.assistantAvatarUrl ?? null,
  };

  const hasAttachments = (props.attachments?.length ?? 0) > 0;
  const composePlaceholder = props.connected
    ? hasAttachments
      ? "Add a message or paste more images..."
      : "Message (↩ to send, Shift+↩ for line breaks, paste images)"
    : "Connect to the gateway to start chatting…";

  const splitRatio = props.splitRatio ?? 0.6;
  const sidebarOpen = Boolean(props.sidebarOpen && props.onCloseSidebar);
  const settingsMenuOpen = Boolean(props.settingsMenuOpen && props.onSettingsMenuOpenChange);

  const openQuick = (
    section: "gateway" | "hrcore" | "models" | "skills" | "cron" | "memory" | "channels",
  ) => {
    props.onSettingsMenuOpenChange?.(false);
    props.onOpenQuickSettings?.(section);
  };

  const navigateTab = (tab: "channels" | "cron" | "skills" | "agents" | "config") => {
    props.onSettingsMenuOpenChange?.(false);
    props.onNavigateToTab?.(tab);
  };
  const serverSessions = props.sessions?.sessions ?? [];
  const hasActiveInList = serverSessions.some((row) => row.key === props.sessionKey);
  const syntheticActive: GatewaySessionRow = {
    key: props.sessionKey,
    kind: "direct",
    label: "New thread",
    displayName: "New thread",
    updatedAt: null,
  };
  const threads = hasActiveInList ? serverSessions : [syntheticActive, ...serverSessions];

  const thread = html`
    <div
      class="chat-thread cp-chat-thread"
      role="log"
      aria-live="polite"
      @scroll=${props.onChatScroll}
    >
      ${
        props.loading
          ? html`
              <div class="muted">Loading chat…</div>
            `
          : nothing
      }
      ${repeat(
        buildChatItems(props),
        (item) => item.key,
        (item) => {
          if (item.kind === "reading-indicator") {
            return renderReadingIndicatorGroup(assistantIdentity);
          }

          if (item.kind === "stream") {
            return renderStreamingGroup(
              item.text,
              item.startedAt,
              props.onOpenSidebar,
              assistantIdentity,
            );
          }

          if (item.kind === "group") {
            return renderMessageGroup(item, {
              onOpenSidebar: props.onOpenSidebar,
              showReasoning,
              assistantName: props.assistantName,
              assistantAvatar: assistantIdentity.avatar,
            });
          }

          return nothing;
        },
      )}
    </div>
  `;

  return html`
    <section class="ahr-main">
      <div class="ahr-panel ahr-sidebar">
        <div class="ahr-sidebar__head">
          <div class="ahr-sidebar__head-row">
            <div class="ahr-sidebar__title">Threads</div>
            <button
              class="btn ahr-chip"
              type="button"
              @click=${() => (props.connected ? props.onNewSession() : openQuick("gateway"))}
            >
              + New
            </button>
          </div>
          <div class="ahr-search">Search threads…</div>
        </div>

        <div class="ahr-sidebar__list">
          ${threads.map((row) => {
            const active = row.key === props.sessionKey;
            const label = (row.label || row.displayName || row.key).trim();
            return html`
              <button
                class="ahr-thread ${active ? "active" : ""}"
                type="button"
                @click=${() => props.onSessionKeyChange(row.key)}
                title=${row.key}
              >
                <div class="ahr-thread__title">${label}</div>
                <div class="ahr-thread__meta">
                  ${row.model ? html`<span class="ahr-thread__pill">${row.model}</span>` : nothing}
                  <span class="ahr-thread__key mono">${row.key}</span>
                </div>
              </button>
            `;
          })}
        </div>

        <div class="ahr-sidebar__footer">
          <div class="ahr-settings">
            <button
              class="ahr-settings__btn"
              type="button"
              @click=${() => props.onSettingsMenuOpenChange?.(!settingsMenuOpen)}
            >
              <span class="ahr-settings__icon">${icons.settings}</span>
              <span>设置</span>
            </button>

            ${
              settingsMenuOpen
                ? html`
                    <div
                      class="ahr-settings__backdrop"
                      @click=${() => props.onSettingsMenuOpenChange?.(false)}
                    ></div>
                    <div class="ahr-settings__popover" role="menu" aria-label="Settings">
                      <div class="ahr-settings__account">
                        <div class="ahr-settings__avatar">${icons.circle}</div>
                        <div>
                          <div class="ahr-settings__account-title">
                            ${props.assistantName || "Agent"}
                          </div>
                          <div class="ahr-settings__account-sub">
                            ${activeSession?.displayName ?? activeSession?.key ?? "main"}
                          </div>
                        </div>
                      </div>
                    <div class="ahr-settings__divider"></div>
                      <button class="ahr-settings__item" type="button" @click=${() => openQuick("gateway")}>
                        <span class="ahr-settings__item-left">
                          <span class="ahr-settings__miniicon">${icons.link}</span>
                          连接 Gateway
                        </span>
                        <span class="ahr-settings__chev">›</span>
                      </button>
                      <button class="ahr-settings__item" type="button" @click=${() => openQuick("hrcore")}>
                        <span class="ahr-settings__item-left">
                          <span class="ahr-settings__miniicon">${icons.search}</span>
                          HR Core 登录/登出
                        </span>
                        <span class="ahr-settings__chev">›</span>
                      </button>
                      <div class="ahr-settings__divider"></div>
                      <button class="ahr-settings__item" type="button" @click=${() => openQuick("models")}>
                        <span class="ahr-settings__item-left">
                          <span class="ahr-settings__miniicon">${icons.globe}</span>
                          切换模型
                        </span>
                        <span class="ahr-settings__chev">›</span>
                      </button>
                      <button class="ahr-settings__item" type="button" @click=${() => openQuick("skills")}>
                        <span class="ahr-settings__item-left">
                          <span class="ahr-settings__miniicon">${icons.zap}</span>
                          写 Skill
                        </span>
                        <span class="ahr-settings__chev">›</span>
                      </button>
                      <button class="ahr-settings__item" type="button" @click=${() => openQuick("cron")}>
                        <span class="ahr-settings__item-left">
                          <span class="ahr-settings__miniicon">${icons.loader}</span>
                          设置定时作业
                        </span>
                        <span class="ahr-settings__chev">›</span>
                      </button>
                      <button class="ahr-settings__item" type="button" @click=${() => openQuick("memory")}>
                        <span class="ahr-settings__item-left">
                          <span class="ahr-settings__miniicon">${icons.fileText}</span>
                          修改 Memory
                        </span>
                        <span class="ahr-settings__chev">›</span>
                      </button>
                      <button class="ahr-settings__item" type="button" @click=${() => openQuick("channels")}>
                        <span class="ahr-settings__item-left">
                          <span class="ahr-settings__miniicon">${icons.link}</span>
                          配置 Channel
                        </span>
                        <span class="ahr-settings__chev">›</span>
                      </button>
                      <div class="ahr-settings__divider"></div>
                      <button class="ahr-settings__item" type="button" @click=${() => navigateTab("config")}>
                        <span class="ahr-settings__item-left">
                          <span class="ahr-settings__miniicon">${icons.settings}</span>
                          Config
                        </span>
                        <span class="ahr-settings__chev">›</span>
                      </button>
                    </div>
                  `
                : nothing
            }
          </div>
        </div>
      </div>

      <div class="ahr-panel ahr-chat">
        ${props.disabledReason ? html`<div class="callout">${props.disabledReason}</div>` : nothing}
        ${props.error ? html`<div class="callout danger">${props.error}</div>` : nothing}
        ${renderCompactionIndicator(props.compactionStatus)}

        <div class="ahr-chat__head">
          <div>
            <div class="ahr-chat__head-title">Thread: ${activeSession?.key ?? props.sessionKey}</div>
            <div class="ahr-chat__head-sub muted">Direct chat session.</div>
          </div>
          <div class="ahr-chat__head-actions">
            ${
              props.connected
                ? html`
                    <button class="btn btn--sm" @click=${props.onRefresh}>Refresh</button>
                  `
                : html`
                    <button class="btn btn--sm primary" @click=${() => openQuick("gateway")}>
                      Connect
                    </button>
                  `
            }
          </div>
        </div>

        <div class="ahr-chat__messages">${thread}</div>

        <div class="ahr-chat__compose">
          ${renderAttachmentPreview(props)}
          <div class="ahr-compose-row">
            <textarea
              class="ahr-compose-input"
              ${ref((el) => el && adjustTextareaHeight(el as HTMLTextAreaElement))}
              .value=${props.draft}
              ?disabled=${!props.connected}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key !== "Enter") return;
                if (e.isComposing || e.keyCode === 229) return;
                if (e.shiftKey) return;
                if (!props.connected) return;
                e.preventDefault();
                if (canCompose) props.onSend();
              }}
              @input=${(e: Event) => {
                const target = e.target as HTMLTextAreaElement;
                adjustTextareaHeight(target);
                props.onDraftChange(target.value);
              }}
              @paste=${(e: ClipboardEvent) => handlePaste(e, props)}
              placeholder=${composePlaceholder}
            ></textarea>
            <button class="btn primary" ?disabled=${!props.connected} @click=${props.onSend}>
              ${isBusy ? "Queue" : "Send"}
            </button>
          </div>
        </div>
      </div>

      <div class="ahr-panel ahr-action">
        <div class="ahr-action__tabs">
          <button
            class="ahr-tab ${props.actionPanelTab === "context" ? "active" : ""}"
            type="button"
            @click=${() => props.onActionPanelTabChange("context")}
          >
            Context
          </button>
          <button
            class="ahr-tab ${props.actionPanelTab === "directory" ? "active" : ""}"
            type="button"
            @click=${() => props.onActionPanelTabChange("directory")}
          >
            Directory
          </button>
          <button
            class="ahr-tab ${props.actionPanelTab === "activity" ? "active" : ""}"
            type="button"
            @click=${() => props.onActionPanelTabChange("activity")}
          >
            Activity
          </button>
        </div>
        <div class="ahr-action__body">
          ${
            props.actionPanelTab === "directory"
              ? renderDirectory(props)
              : props.actionPanelTab === "activity"
                ? html`
                    <div class="muted">Activity (WIP)</div>
                  `
                : sidebarOpen
                  ? renderMarkdownSidebar({
                      content: props.sidebarContent ?? null,
                      error: props.sidebarError ?? null,
                      onClose: props.onCloseSidebar!,
                      onViewRawText: () => {
                        if (!props.sidebarContent || !props.onOpenSidebar) return;
                        props.onOpenSidebar(`\`\`\`\n${props.sidebarContent}\n\`\`\``);
                      },
                    })
                  : html`
                      <div class="muted">Tool output will appear here.</div>
                    `
          }
        </div>
      </div>
    </section>
  `;
}

const CHAT_HISTORY_RENDER_LIMIT = 200;

function groupMessages(items: ChatItem[]): Array<ChatItem | MessageGroup> {
  const result: Array<ChatItem | MessageGroup> = [];
  let currentGroup: MessageGroup | null = null;

  for (const item of items) {
    if (item.kind !== "message") {
      if (currentGroup) {
        result.push(currentGroup);
        currentGroup = null;
      }
      result.push(item);
      continue;
    }

    const normalized = normalizeMessage(item.message);
    const role = normalizeRoleForGrouping(normalized.role);
    const timestamp = normalized.timestamp || Date.now();

    if (!currentGroup || currentGroup.role !== role) {
      if (currentGroup) {
        result.push(currentGroup);
      }
      currentGroup = {
        kind: "group",
        key: `group:${role}:${item.key}`,
        role,
        messages: [{ message: item.message, key: item.key }],
        timestamp,
        isStreaming: false,
      };
    } else {
      currentGroup.messages.push({ message: item.message, key: item.key });
    }
  }

  if (currentGroup) {
    result.push(currentGroup);
  }
  return result;
}

function buildChatItems(props: ChatProps): Array<ChatItem | MessageGroup> {
  const items: ChatItem[] = [];
  const history = Array.isArray(props.messages) ? props.messages : [];
  const tools = Array.isArray(props.toolMessages) ? props.toolMessages : [];
  const historyStart = Math.max(0, history.length - CHAT_HISTORY_RENDER_LIMIT);
  if (historyStart > 0) {
    items.push({
      kind: "message",
      key: "chat:history:notice",
      message: {
        role: "system",
        content: `Showing last ${CHAT_HISTORY_RENDER_LIMIT} messages (${historyStart} hidden).`,
        timestamp: Date.now(),
      },
    });
  }
  for (let i = historyStart; i < history.length; i++) {
    const msg = history[i];
    const normalized = normalizeMessage(msg);

    if (!props.showThinking && normalized.role.toLowerCase() === "toolresult") {
      continue;
    }

    items.push({
      kind: "message",
      key: messageKey(msg, i),
      message: msg,
    });
  }
  if (props.showThinking) {
    for (let i = 0; i < tools.length; i++) {
      items.push({
        kind: "message",
        key: messageKey(tools[i], i + history.length),
        message: tools[i],
      });
    }
  }

  if (props.stream !== null) {
    const key = `stream:${props.sessionKey}:${props.streamStartedAt ?? "live"}`;
    if (props.stream.trim().length > 0) {
      items.push({
        kind: "stream",
        key,
        text: props.stream,
        startedAt: props.streamStartedAt ?? Date.now(),
      });
    } else {
      items.push({ kind: "reading-indicator", key });
    }
  }

  return groupMessages(items);
}

function messageKey(message: unknown, index: number): string {
  const m = message as Record<string, unknown>;
  const toolCallId = typeof m.toolCallId === "string" ? m.toolCallId : "";
  if (toolCallId) {
    return `tool:${toolCallId}`;
  }
  const id = typeof m.id === "string" ? m.id : "";
  if (id) {
    return `msg:${id}`;
  }
  const messageId = typeof m.messageId === "string" ? m.messageId : "";
  if (messageId) {
    return `msg:${messageId}`;
  }
  const timestamp = typeof m.timestamp === "number" ? m.timestamp : null;
  const role = typeof m.role === "string" ? m.role : "unknown";
  if (timestamp != null) {
    return `msg:${role}:${timestamp}:${index}`;
  }
  return `msg:${role}:${index}`;
}
