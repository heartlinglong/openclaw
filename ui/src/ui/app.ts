import { LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { EventLogEntry } from "./app-events.ts";
import type { AppViewState } from "./app-view-state.ts";
import type { DevicePairingList } from "./controllers/devices.ts";
import type { ExecApprovalRequest } from "./controllers/exec-approval.ts";
import type { ExecApprovalsFile, ExecApprovalsSnapshot } from "./controllers/exec-approvals.ts";
import type { SkillMessage } from "./controllers/skills.ts";
import type { GatewayBrowserClient, GatewayHelloOk } from "./gateway.ts";
import type { Tab } from "./navigation.ts";
import type { ResolvedTheme, ThemeMode } from "./theme.ts";
import type {
  AgentsListResult,
  AgentsFilesListResult,
  AgentIdentityResult,
  ConfigSnapshot,
  ConfigUiHints,
  CronJob,
  CronRunLogEntry,
  CronStatus,
  HealthSnapshot,
  LogEntry,
  LogLevel,
  PresenceEntry,
  ChannelsStatusSnapshot,
  SessionsListResult,
  SkillStatusReport,
  StatusSummary,
  NostrProfile,
} from "./types.ts";
import type { NostrProfileFormState } from "./views/channels.nostr-profile-form.ts";
import {
  loadHrCoreSettings,
  saveHrCoreSettings,
  type HrCoreSettings,
} from "./agenthr/hr-core-storage.ts";
import {
  hrCoreGetEmployee,
  hrCoreGetLegalEntity,
  hrCoreGetOrgUnit,
  hrCoreGetPosition,
  HrCoreHttpError,
  hrCoreListEmployees,
  hrCoreListLegalEntities,
  hrCoreListOrgUnits,
  hrCoreListPositions,
  hrCoreLogin,
  hrCoreSearch,
  type HrCoreEmployee,
  type HrCoreLegalEntity,
  type HrCoreOrgUnit,
  type HrCorePosition,
  type HrCoreSearchResult,
} from "./agenthr/hr-core.ts";
import {
  handleChannelConfigReload as handleChannelConfigReloadInternal,
  handleChannelConfigSave as handleChannelConfigSaveInternal,
  handleNostrProfileCancel as handleNostrProfileCancelInternal,
  handleNostrProfileEdit as handleNostrProfileEditInternal,
  handleNostrProfileFieldChange as handleNostrProfileFieldChangeInternal,
  handleNostrProfileImport as handleNostrProfileImportInternal,
  handleNostrProfileSave as handleNostrProfileSaveInternal,
  handleNostrProfileToggleAdvanced as handleNostrProfileToggleAdvancedInternal,
  handleWhatsAppLogout as handleWhatsAppLogoutInternal,
  handleWhatsAppStart as handleWhatsAppStartInternal,
  handleWhatsAppWait as handleWhatsAppWaitInternal,
} from "./app-channels.ts";
import {
  handleAbortChat as handleAbortChatInternal,
  refreshChatAvatar as refreshChatAvatarInternal,
  CHAT_SESSIONS_ACTIVE_MINUTES,
  handleSendChat as handleSendChatInternal,
  removeQueuedMessage as removeQueuedMessageInternal,
} from "./app-chat.ts";
import { DEFAULT_CRON_FORM, DEFAULT_LOG_LEVEL_FILTERS } from "./app-defaults.ts";
import { connectGateway as connectGatewayInternal } from "./app-gateway.ts";
import {
  handleConnected,
  handleDisconnected,
  handleFirstUpdated,
  handleUpdated,
} from "./app-lifecycle.ts";
import { renderApp } from "./app-render.ts";
import {
  exportLogs as exportLogsInternal,
  handleChatScroll as handleChatScrollInternal,
  handleLogsScroll as handleLogsScrollInternal,
  resetChatScroll as resetChatScrollInternal,
  scheduleChatScroll as scheduleChatScrollInternal,
} from "./app-scroll.ts";
import {
  applySettings as applySettingsInternal,
  loadCron as loadCronInternal,
  loadOverview as loadOverviewInternal,
  setTab as setTabInternal,
  setTheme as setThemeInternal,
  onPopState as onPopStateInternal,
} from "./app-settings.ts";
import {
  resetToolStream as resetToolStreamInternal,
  type ToolStreamEntry,
} from "./app-tool-stream.ts";
import { resolveInjectedAssistantIdentity } from "./assistant-identity.ts";
import { loadAssistantIdentity as loadAssistantIdentityInternal } from "./controllers/assistant-identity.ts";
import { loadSessions as loadSessionsInternal } from "./controllers/sessions.ts";
import { loadSettings, type UiSettings } from "./storage.ts";
import { type ChatAttachment, type ChatQueueItem, type CronFormState } from "./ui-types.ts";
import { generateUUID } from "./uuid.ts";

declare global {
  interface Window {
    __OPENCLAW_CONTROL_UI_BASE_PATH__?: string;
  }
}

const injectedAssistantIdentity = resolveInjectedAssistantIdentity();

function resolveOnboardingMode(): boolean {
  if (!window.location.search) {
    return false;
  }
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("onboarding");
  if (!raw) {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

@customElement("openclaw-app")
export class OpenClawApp extends LitElement {
  @state() settings: UiSettings = loadSettings();
  @state() password = "";
  @state() tab: Tab = "chat";
  @state() onboarding = resolveOnboardingMode();
  @state() connected = false;
  @state() theme: ThemeMode = this.settings.theme ?? "system";
  @state() themeResolved: ResolvedTheme = "dark";
  @state() hello: GatewayHelloOk | null = null;
  @state() lastError: string | null = null;
  @state() eventLog: EventLogEntry[] = [];
  private eventLogBuffer: EventLogEntry[] = [];
  private toolStreamSyncTimer: number | null = null;
  private sidebarCloseTimer: number | null = null;

  @state() assistantName = injectedAssistantIdentity.name;
  @state() assistantAvatar = injectedAssistantIdentity.avatar;
  @state() assistantAgentId = injectedAssistantIdentity.agentId ?? null;

  @state() sessionKey = this.settings.sessionKey;
  @state() chatLoading = false;
  @state() chatSending = false;
  @state() chatMessage = "";
  @state() chatMessages: unknown[] = [];
  @state() chatToolMessages: unknown[] = [];
  @state() chatStream: string | null = null;
  @state() chatStreamStartedAt: number | null = null;
  @state() chatRunId: string | null = null;
  @state() compactionStatus: import("./app-tool-stream.ts").CompactionStatus | null = null;
  @state() chatAvatarUrl: string | null = null;
  @state() chatThinkingLevel: string | null = null;
  @state() chatQueue: ChatQueueItem[] = [];
  @state() chatAttachments: ChatAttachment[] = [];
  // Sidebar state for tool output viewing
  @state() sidebarOpen = false;
  @state() sidebarContent: string | null = null;
  @state() sidebarError: string | null = null;
  @state() splitRatio = this.settings.splitRatio;

  @state() nodesLoading = false;
  @state() nodes: Array<Record<string, unknown>> = [];
  @state() devicesLoading = false;
  @state() devicesError: string | null = null;
  @state() devicesList: DevicePairingList | null = null;
  @state() execApprovalsLoading = false;
  @state() execApprovalsSaving = false;
  @state() execApprovalsDirty = false;
  @state() execApprovalsSnapshot: ExecApprovalsSnapshot | null = null;
  @state() execApprovalsForm: ExecApprovalsFile | null = null;
  @state() execApprovalsSelectedAgent: string | null = null;
  @state() execApprovalsTarget: "gateway" | "node" = "gateway";
  @state() execApprovalsTargetNodeId: string | null = null;
  @state() execApprovalQueue: ExecApprovalRequest[] = [];
  @state() execApprovalBusy = false;
  @state() execApprovalError: string | null = null;
  @state() pendingGatewayUrl: string | null = null;

  @state() configLoading = false;
  @state() configRaw = "{\n}\n";
  @state() configRawOriginal = "";
  @state() configValid: boolean | null = null;
  @state() configIssues: unknown[] = [];
  @state() configSaving = false;
  @state() configApplying = false;
  @state() updateRunning = false;
  @state() applySessionKey = this.settings.lastActiveSessionKey;
  @state() configSnapshot: ConfigSnapshot | null = null;
  @state() configSchema: unknown = null;
  @state() configSchemaVersion: string | null = null;
  @state() configSchemaLoading = false;
  @state() configUiHints: ConfigUiHints = {};
  @state() configForm: Record<string, unknown> | null = null;
  @state() configFormOriginal: Record<string, unknown> | null = null;
  @state() configFormDirty = false;
  @state() configFormMode: "form" | "raw" = "form";
  @state() configSearchQuery = "";
  @state() configActiveSection: string | null = null;
  @state() configActiveSubsection: string | null = null;

  @state() channelsLoading = false;
  @state() channelsSnapshot: ChannelsStatusSnapshot | null = null;
  @state() channelsError: string | null = null;
  @state() channelsLastSuccess: number | null = null;
  @state() whatsappLoginMessage: string | null = null;
  @state() whatsappLoginQrDataUrl: string | null = null;
  @state() whatsappLoginConnected: boolean | null = null;
  @state() whatsappBusy = false;
  @state() nostrProfileFormState: NostrProfileFormState | null = null;
  @state() nostrProfileAccountId: string | null = null;

  @state() presenceLoading = false;
  @state() presenceEntries: PresenceEntry[] = [];
  @state() presenceError: string | null = null;
  @state() presenceStatus: string | null = null;

  @state() agentsLoading = false;
  @state() agentsList: AgentsListResult | null = null;
  @state() agentsError: string | null = null;
  @state() agentsSelectedId: string | null = null;
  @state() agentsPanel: "overview" | "files" | "tools" | "skills" | "channels" | "cron" =
    "overview";
  @state() agentFilesLoading = false;
  @state() agentFilesError: string | null = null;
  @state() agentFilesList: AgentsFilesListResult | null = null;
  @state() agentFileContents: Record<string, string> = {};
  @state() agentFileDrafts: Record<string, string> = {};
  @state() agentFileActive: string | null = null;
  @state() agentFileSaving = false;
  @state() agentIdentityLoading = false;
  @state() agentIdentityError: string | null = null;
  @state() agentIdentityById: Record<string, AgentIdentityResult> = {};
  @state() agentSkillsLoading = false;
  @state() agentSkillsError: string | null = null;
  @state() agentSkillsReport: SkillStatusReport | null = null;
  @state() agentSkillsAgentId: string | null = null;

  // Quick settings overlay (for chat focus mode / fast access)
  @state() quickSettingsOpen = false;
  @state() quickSettingsSection:
    | "gateway"
    | "hrcore"
    | "models"
    | "skills"
    | "cron"
    | "memory"
    | "channels" = "models";
  @state() chatSettingsMenuOpen = false;

  // AgentHR directory panel (HR Core DB-backed lookup)
  @state() actionPanelTab: "context" | "directory" | "activity" = "directory";
  @state() hrCoreSettings: HrCoreSettings = loadHrCoreSettings();
  @state() hrCoreLoginUsername = "hr001";
  @state() hrCoreLoginPassword = "";
  @state() hrCoreLoginBusy = false;
  @state() hrCoreError: string | null = null;
  @state() hrCoreQuery = "";
  @state() hrCoreSearching = false;
  @state() hrCoreSearchResult: HrCoreSearchResult | null = null;
  @state() hrCoreSelected:
    | { kind: "employee"; empNo: string; data: HrCoreEmployee | null }
    | { kind: "orgUnit"; code: string; data: HrCoreOrgUnit | null }
    | { kind: "position"; code: string; data: HrCorePosition | null }
    | { kind: "legalEntity"; code: string; data: HrCoreLegalEntity | null }
    | null = null;
  @state() hrCoreOrgUnitsLoading = false;
  @state() hrCoreOrgUnits: HrCoreOrgUnit[] = [];
  @state() hrCoreOrgExpanded: Record<string, boolean> = { ROOT: true };
  @state() hrCorePositionsLoading = false;
  @state() hrCorePositions: HrCorePosition[] = [];
  @state() hrCoreLegalEntities: HrCoreLegalEntity[] = [];
  // Org tree extras: expand positions under org units, then employees under positions.
  @state() hrCorePositionExpanded: Record<string, boolean> = {};
  @state() hrCorePositionEmployeesLoading: Record<string, boolean> = {};
  @state() hrCorePositionEmployees: Record<string, HrCoreEmployee[]> = {};
  @state() hrCorePositionEmployeesError: Record<string, string> = {};
  @state() hrCoreSearchNotice: string | null = null;
  private hrCoreSearchTimer: number | null = null;

  @state() sessionsLoading = false;
  @state() sessionsResult: SessionsListResult | null = null;
  @state() sessionsError: string | null = null;
  @state() sessionsFilterActive = "";
  @state() sessionsFilterLimit = "120";
  @state() sessionsIncludeGlobal = true;
  @state() sessionsIncludeUnknown = false;

  @state() cronLoading = false;
  @state() cronJobs: CronJob[] = [];
  @state() cronStatus: CronStatus | null = null;
  @state() cronError: string | null = null;
  @state() cronForm: CronFormState = { ...DEFAULT_CRON_FORM };
  @state() cronRunsJobId: string | null = null;
  @state() cronRuns: CronRunLogEntry[] = [];
  @state() cronBusy = false;

  @state() skillsLoading = false;
  @state() skillsReport: SkillStatusReport | null = null;
  @state() skillsError: string | null = null;
  @state() skillsFilter = "";
  @state() skillEdits: Record<string, string> = {};
  @state() skillsBusyKey: string | null = null;
  @state() skillMessages: Record<string, SkillMessage> = {};

  @state() debugLoading = false;
  @state() debugStatus: StatusSummary | null = null;
  @state() debugHealth: HealthSnapshot | null = null;
  @state() debugModels: unknown[] = [];
  @state() debugHeartbeat: unknown = null;
  @state() debugCallMethod = "";
  @state() debugCallParams = "{}";
  @state() debugCallResult: string | null = null;
  @state() debugCallError: string | null = null;

  @state() logsLoading = false;
  @state() logsError: string | null = null;
  @state() logsFile: string | null = null;
  @state() logsEntries: LogEntry[] = [];
  @state() logsFilterText = "";
  @state() logsLevelFilters: Record<LogLevel, boolean> = {
    ...DEFAULT_LOG_LEVEL_FILTERS,
  };
  @state() logsAutoFollow = true;
  @state() logsTruncated = false;
  @state() logsCursor: number | null = null;
  @state() logsLastFetchAt: number | null = null;
  @state() logsLimit = 500;
  @state() logsMaxBytes = 250_000;
  @state() logsAtBottom = true;

  client: GatewayBrowserClient | null = null;
  private chatScrollFrame: number | null = null;
  private chatScrollTimeout: number | null = null;
  private chatHasAutoScrolled = false;
  private chatUserNearBottom = true;
  @state() chatNewMessagesBelow = false;
  private nodesPollInterval: number | null = null;
  private logsPollInterval: number | null = null;
  private debugPollInterval: number | null = null;
  private logsScrollFrame: number | null = null;
  private toolStreamById = new Map<string, ToolStreamEntry>();
  private toolStreamOrder: string[] = [];
  refreshSessionsAfterChat = new Set<string>();
  basePath = "";
  private popStateHandler = () =>
    onPopStateInternal(this as unknown as Parameters<typeof onPopStateInternal>[0]);
  private themeMedia: MediaQueryList | null = null;
  private themeMediaHandler: ((event: MediaQueryListEvent) => void) | null = null;
  private topbarObserver: ResizeObserver | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    handleConnected(this as unknown as Parameters<typeof handleConnected>[0]);
  }

  protected firstUpdated() {
    handleFirstUpdated(this as unknown as Parameters<typeof handleFirstUpdated>[0]);
    if (this.hrCoreSettings.token?.trim()) {
      // Token can be persisted across reloads; preload lists so the directory tree is usable.
      void this.ensureHrCoreStaticListsLoaded().catch((err) => (this.hrCoreError = String(err)));
    }
  }

  disconnectedCallback() {
    handleDisconnected(this as unknown as Parameters<typeof handleDisconnected>[0]);
    super.disconnectedCallback();
  }

  protected updated(changed: Map<PropertyKey, unknown>) {
    handleUpdated(this as unknown as Parameters<typeof handleUpdated>[0], changed);
  }

  connect() {
    connectGatewayInternal(this as unknown as Parameters<typeof connectGatewayInternal>[0]);
  }

  setHrCoreSettings(next: HrCoreSettings) {
    this.hrCoreSettings = next;
    saveHrCoreSettings(next);
  }

  async hrCoreLogin() {
    this.hrCoreError = null;
    this.hrCoreLoginBusy = true;
    try {
      const normalizeCredential = (value: string) => {
        // Avoid invisible Unicode characters causing confusing 401s.
        return value
          .normalize("NFKC")
          .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
          .trim();
      };
      const username = normalizeCredential(this.hrCoreLoginUsername);
      const password = normalizeCredential(this.hrCoreLoginPassword);
      if (!username || !password) {
        this.hrCoreError = "username/password required";
        return;
      }
      const res = await hrCoreLogin(this.hrCoreSettings, username, password);
      this.setHrCoreSettings({ ...this.hrCoreSettings, token: res.token, user: res.user });
      this.hrCoreLoginPassword = "";
      // Preload static lists so Directory can render org tree + positions immediately.
      void this.ensureHrCoreStaticListsLoaded().catch((err) => (this.hrCoreError = String(err)));
    } catch (err) {
      this.hrCoreError = String(err);
    } finally {
      this.hrCoreLoginBusy = false;
    }
  }

  hrCoreLogout() {
    this.hrCoreError = null;
    this.setHrCoreSettings({ ...this.hrCoreSettings, token: "", user: null });
    this.hrCoreSearchResult = null;
    this.hrCoreSelected = null;
    this.hrCoreOrgUnits = [];
    this.hrCorePositions = [];
    this.hrCoreLegalEntities = [];
    this.hrCoreOrgExpanded = { ROOT: true };
    this.hrCorePositionExpanded = {};
    this.hrCorePositionEmployeesLoading = {};
    this.hrCorePositionEmployees = {};
    this.hrCorePositionEmployeesError = {};
  }

  setHrCoreQuery(next: string) {
    this.hrCoreQuery = next;
    this.hrCoreError = null;
    if (this.hrCoreSearchTimer != null) {
      window.clearTimeout(this.hrCoreSearchTimer);
      this.hrCoreSearchTimer = null;
    }
    const q = next.trim();
    if (!q) {
      this.hrCoreSearching = false;
      this.hrCoreSearchResult = null;
      return;
    }
    this.hrCoreSearching = true;
    this.hrCoreSearchTimer = window.setTimeout(() => {
      this.hrCoreSearchTimer = null;
      void this.hrCoreRunSearch(q);
    }, 250);
  }

  private async hrCoreRunSearch(q: string) {
    if (!this.hrCoreSettings.token.trim()) {
      this.hrCoreSearching = false;
      this.hrCoreSearchResult = null;
      return;
    }
    this.hrCoreSearching = true;
    this.hrCoreSearchNotice = null;
    try {
      const res = await hrCoreSearch(this.hrCoreSettings, q, 12);
      // Ignore stale results if the user kept typing.
      if (this.hrCoreQuery.trim() !== q) {
        return;
      }
      this.hrCoreSearchResult = res;
    } catch (err) {
      // Some older hr-core builds might not ship /api/v1/search yet. Fall back to list endpoints.
      if (
        err instanceof HrCoreHttpError &&
        err.status === 404 &&
        err.path.startsWith("/api/v1/search")
      ) {
        try {
          const res = await this.hrCoreFallbackSearch(q);
          if (this.hrCoreQuery.trim() !== q) {
            return;
          }
          this.hrCoreSearchNotice = "Search API unavailable; using fallback list filtering.";
          this.hrCoreSearchResult = res;
          this.hrCoreError = null;
          return;
        } catch (inner) {
          this.hrCoreError = String(inner);
        }
      } else {
        this.hrCoreError = String(err);
      }
    } finally {
      if (this.hrCoreQuery.trim() === q) {
        this.hrCoreSearching = false;
      }
    }
  }

  private async ensureHrCoreStaticListsLoaded() {
    if (!this.hrCoreSettings.token.trim()) {
      throw new Error("HR Core token missing; login first.");
    }
    const needsOrgUnits = this.hrCoreOrgUnits.length === 0;
    const needsPositions = this.hrCorePositions.length === 0;
    const needsLegalEntities = this.hrCoreLegalEntities.length === 0;
    if (!needsOrgUnits && !needsPositions && !needsLegalEntities) {
      return;
    }
    const [orgUnits, positions, legalEntities] = await Promise.all([
      needsOrgUnits
        ? hrCoreListOrgUnits(this.hrCoreSettings)
        : Promise.resolve(this.hrCoreOrgUnits),
      needsPositions
        ? hrCoreListPositions(this.hrCoreSettings)
        : Promise.resolve(this.hrCorePositions),
      needsLegalEntities
        ? hrCoreListLegalEntities(this.hrCoreSettings)
        : Promise.resolve(this.hrCoreLegalEntities),
    ]);
    if (needsOrgUnits) {
      this.hrCoreOrgUnits = orgUnits;
    }
    if (needsPositions) {
      this.hrCorePositions = positions;
    }
    if (needsLegalEntities) {
      this.hrCoreLegalEntities = legalEntities;
    }
  }

  private async hrCoreFallbackSearch(q: string): Promise<HrCoreSearchResult> {
    await this.ensureHrCoreStaticListsLoaded();

    const needleRaw = q.trim();
    const needle = needleRaw.toLowerCase();
    const matches = (...values: Array<string | null | undefined>) => {
      for (const v of values) {
        if (!v) continue;
        const s = String(v);
        if (s.toLowerCase().includes(needle)) return true;
      }
      return false;
    };

    const empNoExact = /^\d{8}$/.test(needleRaw) ? needleRaw : null;
    const maybeUsername = /^[a-z][a-z0-9_\\-]{2,31}$/i.test(needleRaw) ? needleRaw : null;
    const positionCode = /^p\\d{3,}$/i.test(needleRaw) ? needleRaw.toUpperCase() : null;
    const orgUnitCode = /^[A-Z]{2,10}$/.test(needleRaw) ? needleRaw.toUpperCase() : null;
    const legalEntityCode = /^[A-Z]{2}\\d{3,}$/.test(needleRaw) ? needleRaw.toUpperCase() : null;

    const employeeQueries: Array<Promise<HrCoreEmployee[]>> = [];
    // Generic full-text-ish q
    employeeQueries.push(hrCoreListEmployees(this.hrCoreSettings, { q: needleRaw, limit: 12 }));
    // Explicit patterns
    if (empNoExact) {
      employeeQueries.push(
        hrCoreListEmployees(this.hrCoreSettings, { emp_no: empNoExact, limit: 12 }),
      );
    }
    // Username: treat as manager username (returns directs under that manager)
    if (maybeUsername) {
      employeeQueries.push(
        hrCoreListEmployees(this.hrCoreSettings, { manager_username: maybeUsername, limit: 12 }),
      );
    }
    if (orgUnitCode) {
      employeeQueries.push(
        hrCoreListEmployees(this.hrCoreSettings, { org_unit_code: orgUnitCode, limit: 12 }),
      );
    }
    if (positionCode) {
      employeeQueries.push(
        hrCoreListEmployees(this.hrCoreSettings, { position_code: positionCode, limit: 12 }),
      );
    }
    if (legalEntityCode) {
      employeeQueries.push(
        hrCoreListEmployees(this.hrCoreSettings, {
          legal_entity_code: legalEntityCode,
          limit: 12,
        }),
      );
    }

    const employeeBatches = await Promise.all(employeeQueries);
    const employeeByEmpNo = new Map<string, HrCoreEmployee>();
    for (const batch of employeeBatches) {
      for (const e of batch) {
        if (e?.emp_no) {
          employeeByEmpNo.set(e.emp_no, e);
        }
      }
    }
    const employees = Array.from(employeeByEmpNo.values()).slice(0, 12);

    const legal_entities = this.hrCoreLegalEntities
      .filter((le) => matches(le.code, le.name, le.country))
      .slice(0, 12)
      .map((le) => ({ code: le.code, name: le.name, country: le.country }));

    const org_units = this.hrCoreOrgUnits
      .filter((ou) => matches(ou.code, ou.name, ou.type))
      .slice(0, 12)
      .map((ou) => ({ code: ou.code, name: ou.name, type: ou.type }));

    const positions = this.hrCorePositions
      .filter((p) => matches(p.code, p.name, p.org_unit?.code, p.org_unit?.name))
      .slice(0, 12)
      .map((p) => ({ code: p.code, name: p.name, org_unit: p.org_unit }));

    const employeeHits = employees.map((e) => ({
      id: e.id,
      emp_no: e.emp_no,
      legal_name: e.profile?.legal_name ?? null,
      primary_phone: e.profile?.primary_phone ?? null,
      primary_email: e.profile?.primary_email ?? null,
      org_unit: e.job_info?.org_unit ? { ...e.job_info.org_unit } : null,
      position: e.job_info?.position ? { ...e.job_info.position } : null,
    }));

    return { q: needleRaw, employees: employeeHits, org_units, positions, legal_entities };
  }

  async loadHrOrgUnits() {
    if (!this.hrCoreSettings.token.trim()) {
      this.hrCoreError = "HR Core token missing; login first.";
      return;
    }
    if (this.hrCoreOrgUnitsLoading) {
      return;
    }
    this.hrCoreOrgUnitsLoading = true;
    this.hrCoreError = null;
    try {
      // Load org units + positions together so the org tree can render both.
      const [orgUnits, positions] = await Promise.all([
        hrCoreListOrgUnits(this.hrCoreSettings),
        hrCoreListPositions(this.hrCoreSettings),
      ]);
      this.hrCoreOrgUnits = orgUnits;
      this.hrCorePositions = positions;
      // Ensure we have at least one open root for usability.
      if (!("ROOT" in this.hrCoreOrgExpanded)) {
        this.hrCoreOrgExpanded = { ...this.hrCoreOrgExpanded, ROOT: true };
      }
    } catch (err) {
      this.hrCoreError = String(err);
    } finally {
      this.hrCoreOrgUnitsLoading = false;
    }
  }

  private async ensureHrCorePositionsLoaded() {
    if (!this.hrCoreSettings.token.trim()) {
      throw new Error("HR Core token missing; login first.");
    }
    if (this.hrCorePositions.length > 0) return;
    if (this.hrCorePositionsLoading) return;
    this.hrCorePositionsLoading = true;
    try {
      this.hrCorePositions = await hrCoreListPositions(this.hrCoreSettings);
    } finally {
      this.hrCorePositionsLoading = false;
    }
  }

  async loadHrPositionEmployees(positionCode: string, opts?: { force?: boolean; limit?: number }) {
    const key = (positionCode ?? "").trim().toUpperCase();
    if (!key) return;
    if (!this.hrCoreSettings.token.trim()) {
      this.hrCoreError = "HR Core token missing; login first.";
      return;
    }
    const force = Boolean(opts?.force);
    const limit = opts?.limit ?? 200;
    if (!force && this.hrCorePositionEmployees[key]) {
      return;
    }
    if (this.hrCorePositionEmployeesLoading[key]) {
      return;
    }
    this.hrCorePositionEmployeesLoading = { ...this.hrCorePositionEmployeesLoading, [key]: true };
    this.hrCorePositionEmployeesError = { ...this.hrCorePositionEmployeesError, [key]: "" };
    try {
      const rows = await hrCoreListEmployees(this.hrCoreSettings, { position_code: key, limit });
      this.hrCorePositionEmployees = { ...this.hrCorePositionEmployees, [key]: rows };
    } catch (err) {
      this.hrCorePositionEmployeesError = {
        ...this.hrCorePositionEmployeesError,
        [key]: String(err),
      };
    } finally {
      this.hrCorePositionEmployeesLoading = {
        ...this.hrCorePositionEmployeesLoading,
        [key]: false,
      };
    }
  }

  toggleHrOrgExpanded(code: string) {
    const key = code.trim();
    if (!key) return;
    const current = Boolean(this.hrCoreOrgExpanded[key]);
    const next = !current;
    this.hrCoreOrgExpanded = { ...this.hrCoreOrgExpanded, [key]: next };
    // Ensure positions are available when the org tree is being used.
    if (next) {
      void this.ensureHrCorePositionsLoaded().catch((err) => (this.hrCoreError = String(err)));
    }
  }

  toggleHrPositionExpanded(positionCode: string) {
    const key = (positionCode ?? "").trim().toUpperCase();
    if (!key) return;
    const current = Boolean(this.hrCorePositionExpanded[key]);
    const next = !current;
    this.hrCorePositionExpanded = { ...this.hrCorePositionExpanded, [key]: next };
    if (next) {
      void this.loadHrPositionEmployees(key);
    }
  }

  async selectHrCoreHit(hit: {
    kind: "employee" | "orgUnit" | "position" | "legalEntity";
    key: string;
  }) {
    if (!this.hrCoreSettings.token.trim()) {
      this.hrCoreError = "HR Core token missing; login first.";
      return;
    }
    this.hrCoreError = null;
    try {
      if (hit.kind === "employee") {
        const data = await hrCoreGetEmployee(this.hrCoreSettings, hit.key);
        this.hrCoreSelected = { kind: "employee", empNo: hit.key, data };
        return;
      }
      if (hit.kind === "orgUnit") {
        const data = await hrCoreGetOrgUnit(this.hrCoreSettings, hit.key);
        this.hrCoreSelected = { kind: "orgUnit", code: hit.key, data };
        return;
      }
      if (hit.kind === "position") {
        const data = await hrCoreGetPosition(this.hrCoreSettings, hit.key);
        this.hrCoreSelected = { kind: "position", code: hit.key, data };
        return;
      }
      const data = await hrCoreGetLegalEntity(this.hrCoreSettings, hit.key);
      this.hrCoreSelected = { kind: "legalEntity", code: hit.key, data };
    } catch (err) {
      this.hrCoreError = String(err);
    }
  }

  newThread() {
    // "New thread" means switching to a fresh session key, not sending "/new" into the chat.
    const uuid = generateUUID().split("-")[0] ?? "new";
    const rest = `thread-${Date.now().toString(36)}-${uuid}`;
    const next = (() => {
      // Prefer preserving agent-scoped session keys (agent:<agentId>:<rest>) so that
      // gateway events + chat.history/session.list all use the same key.
      const current = (this.sessionKey ?? "").trim();
      if (current.startsWith("agent:")) {
        const parts = current.split(":");
        const agentId = (parts[1] ?? "").trim();
        if (agentId) {
          return `agent:${agentId}:${rest}`;
        }
      }
      const snapshot = this.hello?.snapshot as any;
      const agentId = (snapshot?.sessionDefaults?.defaultAgentId ?? "").toString().trim();
      if (agentId) {
        return `agent:${agentId}:${rest}`;
      }
      return rest;
    })();
    this.sessionKey = next;
    this.chatMessage = "";
    this.chatAttachments = [];
    this.chatMessages = [];
    this.chatToolMessages = [];
    this.chatStream = null;
    this.chatRunId = null;
    this.chatStreamStartedAt = null;
    this.chatQueue = [];
    this.resetToolStream();
    this.resetChatScroll();
    this.applySettings({
      ...this.settings,
      sessionKey: next,
      lastActiveSessionKey: next,
    });
    void this.loadAssistantIdentity();
    if (this.connected) {
      void refreshChatAvatarInternal(this);
      void loadSessionsInternal(this, { activeMinutes: CHAT_SESSIONS_ACTIVE_MINUTES });
    }
  }

  handleChatScroll(event: Event) {
    handleChatScrollInternal(
      this as unknown as Parameters<typeof handleChatScrollInternal>[0],
      event,
    );
  }

  handleLogsScroll(event: Event) {
    handleLogsScrollInternal(
      this as unknown as Parameters<typeof handleLogsScrollInternal>[0],
      event,
    );
  }

  exportLogs(lines: string[], label: string) {
    exportLogsInternal(lines, label);
  }

  resetToolStream() {
    resetToolStreamInternal(this as unknown as Parameters<typeof resetToolStreamInternal>[0]);
  }

  resetChatScroll() {
    resetChatScrollInternal(this as unknown as Parameters<typeof resetChatScrollInternal>[0]);
  }

  scrollToBottom() {
    resetChatScrollInternal(this as unknown as Parameters<typeof resetChatScrollInternal>[0]);
    scheduleChatScrollInternal(
      this as unknown as Parameters<typeof scheduleChatScrollInternal>[0],
      true,
    );
  }

  async loadAssistantIdentity() {
    await loadAssistantIdentityInternal(this);
  }

  applySettings(next: UiSettings) {
    applySettingsInternal(this as unknown as Parameters<typeof applySettingsInternal>[0], next);
  }

  setTab(next: Tab) {
    setTabInternal(this as unknown as Parameters<typeof setTabInternal>[0], next);
  }

  setTheme(next: ThemeMode, context?: Parameters<typeof setThemeInternal>[2]) {
    setThemeInternal(this as unknown as Parameters<typeof setThemeInternal>[0], next, context);
  }

  async loadOverview() {
    await loadOverviewInternal(this as unknown as Parameters<typeof loadOverviewInternal>[0]);
  }

  async loadCron() {
    await loadCronInternal(this as unknown as Parameters<typeof loadCronInternal>[0]);
  }

  async handleAbortChat() {
    await handleAbortChatInternal(this as unknown as Parameters<typeof handleAbortChatInternal>[0]);
  }

  removeQueuedMessage(id: string) {
    removeQueuedMessageInternal(
      this as unknown as Parameters<typeof removeQueuedMessageInternal>[0],
      id,
    );
  }

  async handleSendChat(
    messageOverride?: string,
    opts?: Parameters<typeof handleSendChatInternal>[2],
  ) {
    await handleSendChatInternal(
      this as unknown as Parameters<typeof handleSendChatInternal>[0],
      messageOverride,
      opts,
    );
  }

  async handleWhatsAppStart(force: boolean) {
    await handleWhatsAppStartInternal(this, force);
  }

  async handleWhatsAppWait() {
    await handleWhatsAppWaitInternal(this);
  }

  async handleWhatsAppLogout() {
    await handleWhatsAppLogoutInternal(this);
  }

  async handleChannelConfigSave() {
    await handleChannelConfigSaveInternal(this);
  }

  async handleChannelConfigReload() {
    await handleChannelConfigReloadInternal(this);
  }

  handleNostrProfileEdit(accountId: string, profile: NostrProfile | null) {
    handleNostrProfileEditInternal(this, accountId, profile);
  }

  handleNostrProfileCancel() {
    handleNostrProfileCancelInternal(this);
  }

  handleNostrProfileFieldChange(field: keyof NostrProfile, value: string) {
    handleNostrProfileFieldChangeInternal(this, field, value);
  }

  async handleNostrProfileSave() {
    await handleNostrProfileSaveInternal(this);
  }

  async handleNostrProfileImport() {
    await handleNostrProfileImportInternal(this);
  }

  handleNostrProfileToggleAdvanced() {
    handleNostrProfileToggleAdvancedInternal(this);
  }

  async handleExecApprovalDecision(decision: "allow-once" | "allow-always" | "deny") {
    const active = this.execApprovalQueue[0];
    if (!active || !this.client || this.execApprovalBusy) {
      return;
    }
    this.execApprovalBusy = true;
    this.execApprovalError = null;
    try {
      await this.client.request("exec.approval.resolve", {
        id: active.id,
        decision,
      });
      this.execApprovalQueue = this.execApprovalQueue.filter((entry) => entry.id !== active.id);
    } catch (err) {
      this.execApprovalError = `Exec approval failed: ${String(err)}`;
    } finally {
      this.execApprovalBusy = false;
    }
  }

  handleGatewayUrlConfirm() {
    const nextGatewayUrl = this.pendingGatewayUrl;
    if (!nextGatewayUrl) {
      return;
    }
    this.pendingGatewayUrl = null;
    applySettingsInternal(this as unknown as Parameters<typeof applySettingsInternal>[0], {
      ...this.settings,
      gatewayUrl: nextGatewayUrl,
    });
    this.connect();
  }

  handleGatewayUrlCancel() {
    this.pendingGatewayUrl = null;
  }

  // Sidebar handlers for tool output viewing
  handleOpenSidebar(content: string) {
    if (this.sidebarCloseTimer != null) {
      window.clearTimeout(this.sidebarCloseTimer);
      this.sidebarCloseTimer = null;
    }
    this.sidebarContent = content;
    this.sidebarError = null;
    this.sidebarOpen = true;
  }

  handleCloseSidebar() {
    this.sidebarOpen = false;
    // Clear content after transition
    if (this.sidebarCloseTimer != null) {
      window.clearTimeout(this.sidebarCloseTimer);
    }
    this.sidebarCloseTimer = window.setTimeout(() => {
      if (this.sidebarOpen) {
        return;
      }
      this.sidebarContent = null;
      this.sidebarError = null;
      this.sidebarCloseTimer = null;
    }, 200);
  }

  handleSplitRatioChange(ratio: number) {
    const newRatio = Math.max(0.4, Math.min(0.7, ratio));
    this.splitRatio = newRatio;
    this.applySettings({ ...this.settings, splitRatio: newRatio });
  }

  render() {
    return renderApp(this as unknown as AppViewState);
  }
}
