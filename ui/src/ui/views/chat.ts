import { html, nothing } from "lit";
import { ref } from "lit/directives/ref.js";
import { repeat } from "lit/directives/repeat.js";
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
import { icons } from "../icons.ts";
import { renderMarkdownSidebar } from "./markdown-sidebar.ts";
import "../components/resizable-divider.ts";

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
    section: "gateway" | "models" | "skills" | "cron" | "memory" | "channels",
  ) => void;
  onNavigateToTab?: (tab: "channels" | "cron" | "skills" | "agents" | "config") => void;
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

  const openQuick = (section: "gateway" | "models" | "skills" | "cron" | "memory" | "channels") => {
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
          <button class="ahr-tab active" type="button">Context</button>
          <button class="ahr-tab" type="button" @click=${() => navigateTab("agents")}>Employees</button>
          <button class="ahr-tab" type="button" @click=${() => navigateTab("cron")}>Activity</button>
        </div>
        <div class="ahr-action__body">
          ${
            sidebarOpen
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
