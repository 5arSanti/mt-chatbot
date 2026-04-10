/**
 * mt-chatbot-widget — un solo script (import único en HTML).
 * Estructura interna: utilidades → tokens/estilos → custom element.
 */
(function () {
  "use strict";

  // --- Utilidades ----------------------------------------------------------

  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function citationSourceLabel(source) {
    if (!source) return "Fuente";
    const last = source.split("/").pop() || source;
    try {
      return decodeURIComponent(last);
    } catch {
      return last;
    }
  }

  /** Clave YYYY-MM-DD en zona Bogotá (para comparar con asked_at_colombia). */
  function bogotaDateKey(date) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    return y && m && d ? `${y}-${m}-${d}` : "";
  }

  function dayKeyMinusOne(dayKey) {
    const [y, m, d] = dayKey.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - 1);
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(
      2,
      "0"
    )}-${String(dt.getUTCDate()).padStart(2, "0")}`;
  }

  function formatDayHeader(dayKey) {
    const today = bogotaDateKey(new Date());
    if (dayKey === today) return "Hoy";
    if (dayKey === dayKeyMinusOne(today)) return "Ayer";
    const [y, m, d] = dayKey.split("-").map(Number);
    if (!y || !m || !d) return dayKey;
    return new Intl.DateTimeFormat("es-CO", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(y, m - 1, d));
  }

  /** Fecha corta para filas compactas del historial. */
  function formatCompactDate(dayKey) {
    const today = bogotaDateKey(new Date());
    const [y, m, d] = dayKey.split("-").map(Number);
    if (!y || !m || !d) return dayKey;
    if (dayKey === today) return "Hoy";
    if (dayKey === dayKeyMinusOne(today)) return "Ayer";
    return new Intl.DateTimeFormat("es-CO", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(y, m - 1, d));
  }

  function formatTimeColombia(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("es-CO", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/Bogota",
    }).format(d);
  }

  function normalizeHistoryPayload(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.items)) return data.items;
    if (data && Array.isArray(data.history)) return data.history;
    return [];
  }

  function groupHistoryByDay(items) {
    const map = new Map();
    for (const item of items) {
      const raw = item.asked_at_colombia || "";
      const dayKey = raw.split("T")[0] || "unknown";
      if (!map.has(dayKey)) map.set(dayKey, []);
      map.get(dayKey).push(item);
    }
    const keys = [...map.keys()].sort((a, b) => b.localeCompare(a));
    for (const k of keys) {
      map
        .get(k)
        .sort(
          (a, b) =>
            new Date(b.asked_at_colombia || 0) -
            new Date(a.asked_at_colombia || 0)
        );
    }
    return keys.map((dayKey) => ({ dayKey, items: map.get(dayKey) }));
  }

  /** Primera pregunta del día (cronológicamente). */
  function getFirstQuestionOfDay(items) {
    const sorted = [...items].sort(
      (a, b) =>
        new Date(a.asked_at_colombia || 0) -
        new Date(b.asked_at_colombia || 0)
    );
    return sorted[0];
  }

  function mapCitationsFromApi(list) {
    if (!Array.isArray(list)) return [];
    return list.map((c) => ({
      source: c.source,
      snippet: c.snippet,
      page_number:
        c.page_number != null && c.page_number !== ""
          ? Number(c.page_number)
          : null,
    }));
  }

  /** Construye mensajes chat ordenados por hora (toda la conversación del día). */
  function dayItemsToMessages(items) {
    const sorted = [...items].sort(
      (a, b) =>
        new Date(a.asked_at_colombia || 0) -
        new Date(b.asked_at_colombia || 0)
    );
    const messages = [];
    for (const item of sorted) {
      const asked = item.asked_at_colombia || "";
      const t = new Date(asked || Date.now()).getTime();
      messages.push({ role: "user", text: item.question || "", t });
      messages.push({
        role: "bot",
        text: item.answer || "",
        citations: mapCitationsFromApi(item.citations),
        t: t + 1,
        responseAt: asked,
      });
    }
    return messages;
  }

  // --- Tokens Figma (doc. referencia / historial / MacBook wide) ---------
  const THEME = {
    primary: "#0421d1",
    primaryRgb: "4, 66, 209",
    text: "#4e4e4e",
    textMuted: "#696969",
    userBubble: "#eaeaea",
    botBubble: "#f9f9f9",
    border: "#d4d4d4",
    inputPlaceholder: "#bdbdbd",
  };

  function buildStyles() {
    const t = THEME;
    return `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700&family=Roboto:wght@400;500;700&display=swap');

:host {
  --mt-primary: ${t.primary};
  --mt-text: ${t.text};
  --mt-user-bubble: ${t.userBubble};
  --mt-bot-bubble: ${t.botBubble};
  font-family: 'Roboto', 'Inter', system-ui, sans-serif;
  font-size: 15px;
  color: var(--mt-text);
}

* { box-sizing: border-box; }

.mt-launcher {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 60px;
  height: 60px;
  border: none;
  border-radius: 50%;
  background: ${t.primary};
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px rgba(${t.primaryRgb}, 0.35);
  z-index: 99998;
}

.mt-launcher svg { width: 28px; height: 28px; }

.mt-shell {
  position: fixed;
  bottom: 90px;
  right: 20px;
  width: min(360px, calc(100vw - 40px));
  height: min(440px, calc(100vh - 120px));
  background: #fff;
  border-radius: 13px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.12);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 99999;
}

.mt-shell.mt-shell--expanded {
  width: min(1280px, calc(100vw - 32px));
  height: min(832px, calc(100vh - 40px));
  bottom: 20px;
  right: 50%;
  transform: translateX(50%);
  flex-direction: row;
}

.mt-sidebar {
  display: none;
  width: 300px;
  min-width: 260px;
  border-right: 1px solid ${t.border};
  background: #fff;
  flex-direction: column;
  overflow: hidden;
}

.mt-shell.mt-shell--expanded.mt-shell--with-sidebar .mt-sidebar {
  display: flex;
}

.mt-sidebar-head {
  padding: 15px 18px 10px;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 600;
  color: var(--mt-primary);
  border-bottom: 1px solid #eee;
}

.mt-sidebar-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 10px 0px;
}

.hist-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 8px;
  margin: 0;
}

.hist-row {
  padding: 8px 10px;
  border-radius: 8px;
}

.hist-row-q {
  font-size: 11px;
  -webkit-line-clamp: 2;
}

.hist-row-meta {
  font-size: 10px;
  gap: 6px;
}

.mt-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.mt-header {
  display: grid;
  grid-template-columns: 40px 1fr 40px;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: ${t.primary};
  color: #fff;
  flex-shrink: 0;
}

.mt-header-title {
  font-family: 'Inter', sans-serif;
  font-weight: 700;
  font-size: 19px;
  letter-spacing: -0.02em;
  text-align: center;
  justify-self: center;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 4px;
}

.mt-header-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
}

.mt-icon-btn {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}

.mt-icon-btn:hover {
  background: rgba(255,255,255,0.15);
}

.mt-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  min-height: 0;
  background: #fff;
}

.mt-body .mt-new-chat-bg {
  background: #fff;
  border-radius: 8px;
}

.mt-chat-toolbar {
  position: absolute;
  top: 5px;
  left: 8px;
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
}

.mt-btn-new-chat {
  border: none;
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 600;
  font-family: 'Inter', sans-serif;
  color: var(--mt-primary);
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.15s;
  background: #fff;
}

.mt-btn-new-chat:hover {
  background: rgba(${t.primaryRgb}, 0.08);
}

.mt-messages {
  flex: 1;
  overflow-y: auto;
  padding: 14px 14px 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mt-msg-user {
  align-self: flex-end;
  max-width: 92%;
  padding: 14px;
  border-radius: 8px;
  background: ${t.userBubble};
  font-size: 15px;
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  line-height: 1.45;
  color: ${t.text};
}

.mt-msg-user-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.mt-msg-time {
  font-size: 11px;
  font-weight: 700;
  color: ${t.textMuted};
  font-family: 'Roboto', sans-serif;
}

.mt-msg-bot-wrap {
  align-self: flex-start;
  max-width: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.mt-msg-time--bot {
  margin-top: 4px;
  margin-left: 2px;
}

.mt-msg-bot {
  padding: 14px;
  border-radius: 8px;
  background: ${t.botBubble};
  font-size: 15px;
  line-height: 1.5;
  color: ${t.text};
}

.mt-msg-bot .bot-answer {
  font-family: 'Roboto', sans-serif;
  font-weight: 500;
}

.mt-typing-wrap {
  align-self: flex-start;
  max-width: 85%;
  animation: mt-fade-in 0.35s ease;
}

@keyframes mt-fade-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.mt-appear {
  animation: mt-fade-in 0.42s cubic-bezier(0.22, 1, 0.36, 1);
}

.mt-typing-bubble {
  display: inline-flex;
  align-items: center;
  min-height: 48px;
  padding: 16px 20px;
}

.mt-typing {
  display: flex;
  align-items: center;
  gap: 5px;
}

.mt-typing span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${t.textMuted};
  animation: mt-bounce 1.25s ease-in-out infinite;
}

.mt-typing span:nth-child(1) { animation-delay: 0s; }
.mt-typing span:nth-child(2) { animation-delay: 0.2s; }
.mt-typing span:nth-child(3) { animation-delay: 0.4s; }

@keyframes mt-bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.45; }
  30% { transform: translateY(-7px); opacity: 1; }
}

.mt-typing-label {
  margin-left: 10px;
  font-size: 13px;
  color: ${t.textMuted};
  font-weight: 500;
}

.mt-input-row {
  display: flex;
  align-items: stretch;
  border-top: 1px solid ${t.border};
  padding: 10px 12px;
  gap: 8px;
  background: #fff;
}

.mt-input-row input {
  flex: 1;
  border: 1px solid ${t.border};
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 15px;
  font-family: inherit;
  outline: none;
}

.mt-input-row input::placeholder {
  color: ${t.inputPlaceholder};
}

.mt-input-row button[type="submit"] {
  padding: 0 16px;
  border: none;
  border-radius: 8px;
  background: ${t.primary};
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  font-family: 'Inter', sans-serif;
}

/* Citas — tarjeta tipo Figma Frame 6 */
.refs-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 8px 14px;
  font-size: 12px;
  font-weight: 600;
  font-family: 'Inter', sans-serif;
  color: var(--mt-primary);
  background: #fff;
  border: 1px solid rgba(${t.primaryRgb}, 0.35);
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, transform 0.15s;
}

.refs-toggle:hover {
  background: #f5f7ff;
  border-color: var(--mt-primary);
}

.refs-toggle .refs-chevron {
  display: inline-block;
  transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  font-size: 10px;
  line-height: 1;
  opacity: 0.85;
}

.refs-toggle[aria-expanded="true"] .refs-chevron {
  transform: rotate(180deg);
}

.refs-anim {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.refs-anim.is-open {
  grid-template-rows: 1fr;
}

.refs-anim-inner {
  min-height: 0;
  overflow: hidden;
}

.refs-panel-content {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 4px;
  opacity: 0;
  transform: translateY(-6px);
  transition: opacity 0.32s ease 0.06s, transform 0.32s cubic-bezier(0.4, 0, 0.2, 1) 0.06s;
}

.refs-anim.is-open .refs-panel-content {
  opacity: 1;
  transform: translateY(0);
}

.refs-count {
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 5px;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: var(--mt-primary);
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.ref-card {
  padding: 10px;
  border-radius: 10px;
  background: #fff;
  border: 1px solid var(--mt-primary);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ref-card-top {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.ref-doc-icon {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  color: var(--mt-primary);
}

.ref-name {
  flex: 1;
  font-size: 16px;
  font-weight: 500;
  font-family: 'Roboto', sans-serif;
  color: var(--mt-primary);
  line-height: 1.3;
  word-break: break-word;
}

.ref-page {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  font-family: 'Inter', sans-serif;
  color: #fff;
  background: var(--mt-primary);
  padding: 3px 8px;
  border-radius: 6px;
  align-self: flex-start;
}

.ref-snippet {
  width: 100%;
  margin: 0;
  padding: 0 0 0 12px;
  border-left: 2px solid #cbd5e1;
  font-size: 14px;
  line-height: 1.45;
  color: ${t.text};
  white-space: break-spaces;
  font-family: 'Roboto', sans-serif;
  font-weight: 400;
}

/* Vista historial completa */
.mt-history-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #fff;
}

.mt-history-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid #eee;
}

.mt-history-head h2 {
  margin: 0;
  font-size: 20px;
  font-family: 'Inter', sans-serif;
  font-weight: 600;
  color: var(--mt-primary);
}

.mt-history-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 0;
}

.hist-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 14px;
  border-bottom: 1px solid #eee;
  cursor: pointer;
  text-align: left;
  background: #fff;
  transition: background 0.15s ease, color 0.15s ease;
}

.hist-row:hover:not(.mt-day-active) {
  background: #f7f8fc;
}

.hist-row-q {
  font-size: 13px;
  font-weight: 500;
  font-family: 'Roboto', sans-serif;
  color: ${t.text};
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.hist-row-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 11px;
  font-weight: 500;
  font-family: 'Inter', sans-serif;
  color: ${t.textMuted};
}

.hist-row-meta .hist-row-date {
  color: ${t.textMuted};
}

.hist-row-meta .hist-row-count {
  color: ${t.textMuted};
}

.hist-row-sep {
  opacity: 0.55;
  user-select: none;
}

.hist-row.mt-day-active {
  background: var(--mt-primary);
}

.hist-row.mt-day-active .hist-row-q,
.hist-row.mt-day-active .hist-row-meta,
.hist-row.mt-day-active .hist-row-date,
.hist-row.mt-day-active .hist-row-count {
  color: #fff;
}

.hist-row.mt-day-active .hist-row-count {
  opacity: 0.95;
}

.hist-row.mt-day-active .hist-row-sep {
  color: #fff;
  opacity: 0.85;
}

.mt-empty, .mt-error {
  padding: 20px;
  text-align: center;
  color: ${t.textMuted};
  font-size: 14px;
}

.mt-error { color: #b91c1c; }

.mt-history-loading .mt-skel-block {
  margin-bottom: 14px;
}

.mt-skel-line {
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(
    90deg,
    #f0f0f0 0%,
    #f8f8f8 40%,
    #e8e8e8 60%,
    #f0f0f0 100%
  );
  background-size: 200% 100%;
  animation: mt-shimmer 1.2s ease-in-out infinite;
  margin-bottom: 10px;
}

.mt-skel-line--short { width: 55%; }
.mt-skel-line--med { width: 78%; }
.mt-skel-line--title {
  height: 16px;
  width: 40%;
  margin-bottom: 16px;
  border-radius: 8px;
}

.mt-skel-card {
  padding: 16px 18px;
  border-radius: 10px;
  background: #fafafa;
  border: 1px solid #eee;
  margin-bottom: 12px;
}

@keyframes mt-shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}

.mt-history-loader-foot {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px;
  color: ${t.textMuted};
  font-size: 13px;
  font-weight: 500;
}

.mt-history-loader-foot .mt-spin {
  width: 20px;
  height: 20px;
  border: 2px solid #e5e5e5;
  border-top-color: ${t.primary};
  border-radius: 50%;
  animation: mt-spin 0.7s linear infinite;
}

@keyframes mt-spin {
  to { transform: rotate(360deg); }
}

.mt-sidebar-skel {
  padding: 8px;
}

.mt-sidebar-skel .mt-skel-line {
  margin-bottom: 8px;
}
`;
  }

  // --- Web component -------------------------------------------------------

  class ChatbotWidget extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this.state = {
        isOpen: false,
        loading: false,
        messages: [],
        expanded: false,
        view: "chat",
        historyLoading: false,
        historyLoaded: false,
        historyItems: [],
        historyError: null,
        selectedDayKey: null,
      };
    }

    get apiUrl() {
      return (
        this.getAttribute("api-url") ||
        "https://course-storage-api-qdrant-1018797915827.us-east1.run.app/qa"
      );
    }

    get apiBaseUrl() {
      const baseAttr = this.getAttribute("api-base-url");
      if (baseAttr) return baseAttr.replace(/\/$/, "");
      return this.apiUrl.replace(/\/qa\/?$/i, "").replace(/\/$/, "");
    }

    get historyUrl() {
      return `${this.apiBaseUrl}/history`;
    }

    /** "GET" | "POST" — si tu API usa GET con query params, pon history-method="GET". */
    get historyMethod() {
      return (this.getAttribute("history-method") || "POST").toUpperCase();
    }

    get studentId() {
      return this.getAttribute("student-id");
    }

    get courseId() {
      return this.getAttribute("course-id");
    }

    get title() {
      return this.getAttribute("title") || "Asistente chatbot";
    }

    connectedCallback() {
      this.render();
    }

    disconnectedCallback() {}

    toggleChat() {
      this.state.isOpen = !this.state.isOpen;
      this.render();
    }

    toggleExpand() {
      this.state.expanded = !this.state.expanded;
      if (this.state.expanded && !this.state.historyLoaded) {
        this.loadHistory();
      }
      this.render();
    }

    openHistoryView() {
      this.state.view = "history";
      this.loadHistory();
    }

    loadDayIntoChat(dayKey) {
      const groups = groupHistoryByDay(this.state.historyItems);
      const g = groups.find((x) => x.dayKey === dayKey);
      if (!g) return;
      this.state.messages = dayItemsToMessages(g.items);
      this.state.selectedDayKey = dayKey;
      this.state.view = "chat";
      this.render();
    }

    backToChat() {
      this.state.view = "chat";
      this.render();
    }

    newChat() {
      this.state.messages = [];
      this.state.selectedDayKey = null;
      this.state.loading = false;
      this.render();
    }

    async loadHistory() {
      if (!this.studentId || !this.courseId) {
        this.state.historyError = "Faltan student-id o course-id";
        this.state.historyLoaded = true;
        this.state.historyLoading = false;
        this.render();
        return;
      }
      this.state.historyLoading = true;
      this.state.historyError = null;
      this.render();

      try {
        const meth = this.historyMethod;
        let reqUrl = this.historyUrl;
        const fetchOpts = { method: meth, mode: "cors", headers: {} };
        if (meth === "GET") {
          const u = new URL(reqUrl);
          u.searchParams.set("student_id", this.studentId);
          u.searchParams.set("course_id", this.courseId);
          reqUrl = u.toString();
        } else {
          fetchOpts.headers["Content-Type"] = "application/json";
          fetchOpts.body = JSON.stringify({
            student_id: this.studentId,
            course_id: this.courseId,
          });
        }
        const res = await fetch(reqUrl, fetchOpts);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        this.state.historyItems = normalizeHistoryPayload(data);
        this.state.historyLoaded = true;
      } catch (err) {
        this.state.historyError =
          "No se pudo cargar el historial. Verifica la API y CORS.";
        this.state.historyLoaded = true;
      } finally {
        this.state.historyLoading = false;
        this.render();
      }
    }

    async sendMessage() {
      const input = this.shadowRoot.querySelector("#mt-input");
      const question = input?.value?.trim();
      if (!question) return;

      this.state.selectedDayKey = null;
      this.state.messages.push({ role: "user", text: question, t: Date.now() });
      this.state.loading = true;
      this.render();
      if (input) input.value = "";

      try {
        const response = await fetch(this.apiUrl, {
          method: "POST",
          mode: "cors",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            student_id: this.studentId,
            course_id: this.courseId,
            question,
          }),
        });
        const data = await response.json();
        const citations = mapCitationsFromApi(data.citations);
        this.state.messages.push({
          role: "bot",
          text: data.answer || "Sin respuesta",
          citations,
          t: Date.now(),
        });
      } catch {
        this.state.messages.push({
          role: "bot",
          text: "Error consultando el servicio",
          t: Date.now(),
        });
      }

      this.state.loading = false;
      this.render();
    }

    renderBotMessage(m, msgIndex, latest = false) {
      const text = escapeHtml(m.text);
      const citations = m.citations || [];
      const hasRefs = citations.length > 0;
      const panelId = `refs-panel-${msgIndex}`;

      const refsBlock = hasRefs
        ? `
        <button type="button" class="refs-toggle" aria-expanded="false" aria-controls="${panelId}">
          <span class="refs-chevron" aria-hidden="true">▼</span>
          Referencias
          <span class="refs-count">${citations.length}</span>
        </button>
        <div class="refs-anim" id="${panelId}">
          <div class="refs-anim-inner">
            <div class="refs-panel-content">
          ${citations
            .map(
              (c) => `
            <div class="ref-card">
              <div class="ref-card-top">
                <span class="ref-doc-icon" aria-hidden="true">${svgDoc()}</span>
                <span class="ref-name">${escapeHtml(
                  citationSourceLabel(c.source)
                )}</span>
                ${
                  c.page_number != null && !Number.isNaN(c.page_number)
                    ? `<span class="ref-page">Pág. ${escapeHtml(
                        String(c.page_number)
                      )}</span>`
                    : ""
                }
              </div>
              ${
                c.snippet
                  ? `<blockquote class="ref-snippet">${escapeHtml(
                      c.snippet
                    )}</blockquote>`
                  : ""
              }
            </div>
          `
            )
            .join("")}
            </div>
          </div>
        </div>
      `
        : "";

      const botTime = m.responseAt
        ? formatTimeColombia(m.responseAt)
        : "";

      return `<div class="mt-msg-bot-wrap${latest ? " mt-appear" : ""}">
        <div class="mt-msg-bot">
          ${text ? `<div class="bot-answer">${text}</div>` : ""}
          ${refsBlock}
        </div>
        ${
          botTime
            ? `<span class="mt-msg-time mt-msg-time--bot">${escapeHtml(
                botTime
              )}</span>`
            : ""
        }
      </div>`;
    }

    renderMessages() {
      const msgs = this.state.messages;
      const lastIdx = msgs.length - 1;
      const rows = msgs.map((m, i) => {
        const latest = i === lastIdx;
        if (m.role === "user") {
          const time = formatTimeColombia(
            m.t ? new Date(m.t).toISOString() : undefined
          );
          return `<div class="mt-msg-user-wrap${latest ? " mt-appear" : ""}">
            <div class="mt-msg-user">${escapeHtml(m.text)}</div>
            ${
              time ? `<span class="mt-msg-time">${escapeHtml(time)}</span>` : ""
            }
          </div>`;
        }
        return this.renderBotMessage(m, i, latest);
      });
      return rows.join("");
    }

    renderHistoryLoadingView() {
      const cardSkel = `
        <div class="mt-skel-card">
          <div class="mt-skel-line mt-skel-line--med"></div>
          <div class="mt-skel-line mt-skel-line--short"></div>
        </div>`;
      return `<div class="mt-history-view">
        <div class="mt-history-head">
          <button type="button" class="mt-icon-btn" data-action="history-back" aria-label="Volver" style="color:#0421d1;background:#f5f5f5;">
            ${svgChevronLeft()}
          </button>
          <h2>Tu historial</h2>
        </div>
        <div class="mt-history-scroll mt-history-loading" style="padding:12px 14px;">
          <div class="mt-skel-line mt-skel-line--title"></div>
          ${cardSkel}${cardSkel}${cardSkel}${cardSkel}
        </div>
        <div class="mt-history-loader-foot">
          <span class="mt-spin" aria-hidden="true"></span>
          <span>Cargando conversaciones…</span>
        </div>
      </div>`;
    }

    renderHistoryFull() {
      if (this.state.historyLoading) {
        return this.renderHistoryLoadingView();
      }
      if (this.state.historyError) {
        return `<div class="mt-history-view"><div class="mt-history-head">
          <button type="button" class="mt-icon-btn" data-action="history-back" aria-label="Volver" style="color:#0421d1;background:#f5f5f5;">
            ${svgChevronLeft()}
          </button>
          <h2>Tu historial</h2>
        </div><div class="mt-error" style="padding:24px;">${escapeHtml(
          this.state.historyError
        )}</div></div>`;
      }
      const groups = groupHistoryByDay(this.state.historyItems);
      if (groups.length === 0) {
        return `<div class="mt-history-view">
        <div class="mt-history-head">
          <button type="button" class="mt-icon-btn" data-action="history-back" aria-label="Volver" style="color:#0421d1;background:#f5f5f5;">
            ${svgChevronLeft()}
          </button>
          <h2>Tu historial</h2>
        </div>
        <div class="mt-empty">No hay consultas recientes.</div>
        </div>`;
      }

      return `<div class="mt-history-view">
        <div class="mt-history-head">
          <button type="button" class="mt-icon-btn" data-action="history-back" aria-label="Volver" style="color:#0421d1;background:#f5f5f5;">
            ${svgChevronLeft()}
          </button>
          <h2>Tu historial</h2>
        </div>
        <ul class="hist-list">
          ${groups
            .map(({ dayKey, items }) => {
              const first = getFirstQuestionOfDay(items);
              const n = items.length;
              const countLabel =
                n === 1 ? "1 pregunta" : `${n} preguntas`;
              const dateLabel = formatCompactDate(dayKey);
              const active = this.state.selectedDayKey === dayKey;
              if (!first) return "";
              return `
              <li class="hist-row ${
                active ? "mt-day-active" : ""
              }" data-day-key="${escapeHtml(dayKey)}" role="button" tabindex="0">
                <span class="hist-row-q">${escapeHtml(first.question || "")}</span>
                <span class="hist-row-meta">
                  <span class="hist-row-date">${escapeHtml(dateLabel)}</span>
                  <span class="hist-row-sep" aria-hidden="true">·</span>
                  <span class="hist-row-count">${escapeHtml(countLabel)}</span>
                </span>
              </li>`;
            })
            .join("")}
        </ul>
      </div>`;
    }

    renderSidebarHistory() {
      if (this.state.historyLoading) {
        return `<div class="mt-sidebar-skel">
          <div class="mt-skel-line mt-skel-line--title" style="height:10px;width:70%;"></div>
          <div class="mt-skel-line mt-skel-line--med"></div>
          <div class="mt-skel-line mt-skel-line--short"></div>
          <div class="mt-skel-line mt-skel-line--med" style="margin-top:14px;"></div>
          <div class="mt-skel-line mt-skel-line--short"></div>
        </div>`;
      }
      if (!this.state.historyLoaded || this.state.historyItems.length === 0) {
        return `<div class="mt-empty" style="padding:16px;font-size:12px;">Sin historial</div>`;
      }
      const groups = groupHistoryByDay(this.state.historyItems);
      return `<ul class="hist-list">${groups
        .map(({ dayKey, items }) => {
          const first = getFirstQuestionOfDay(items);
          const n = items.length;
          const countLabel =
            n === 1 ? "1 pregunta" : `${n} preguntas`;
          const dateLabel = formatCompactDate(dayKey);
          const active = this.state.selectedDayKey === dayKey;
          if (!first) return "";
          return `
            <li class="hist-row ${
              active ? "mt-day-active" : ""
            }" data-day-key="${escapeHtml(dayKey)}" role="button" tabindex="0">
              <span class="hist-row-q">${escapeHtml(first.question || "")}</span>
              <span class="hist-row-meta">
                <span class="hist-row-date">${escapeHtml(dateLabel)}</span>
                <span class="hist-row-sep" aria-hidden="true">·</span>
                <span class="hist-row-count">${escapeHtml(countLabel)}</span>
              </span>
            </li>`;
        })
        .join("")}</ul>`;
    }

    bindRefsToggles() {
      this.shadowRoot.querySelectorAll(".refs-toggle").forEach((btn) => {
        btn.onclick = () => {
          const anim = btn.nextElementSibling;
          if (!anim?.classList.contains("refs-anim")) return;
          const open = !anim.classList.contains("is-open");
          anim.classList.toggle("is-open", open);
          btn.setAttribute("aria-expanded", String(open));
        };
      });
    }

    bindHistoryDayCards() {
      const onActivate = (el) => {
        const k = el.getAttribute("data-day-key");
        if (k) this.loadDayIntoChat(k);
      };
      this.shadowRoot.querySelectorAll("[data-day-key]").forEach((el) => {
        el.onclick = () => onActivate(el);
        el.onkeydown = (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onActivate(el);
          }
        };
      });
    }

    bindShell() {
      const root = this.shadowRoot;
      root
        .querySelector("[data-action='toggle-chat']")
        ?.addEventListener("click", (e) => {
          e.stopPropagation();
          this.toggleChat();
        });
      root
        .querySelector("[data-action='open-history']")
        ?.addEventListener("click", (e) => {
          e.stopPropagation();
          this.openHistoryView();
        });
      root
        .querySelector("[data-action='expand-toggle']")
        ?.addEventListener("click", (e) => {
          e.stopPropagation();
          this.toggleExpand();
        });
      root
        .querySelector("[data-action='history-back']")
        ?.addEventListener("click", (e) => {
          e.stopPropagation();
          this.backToChat();
        });
      root
        .querySelector("[data-action='new-chat']")
        ?.addEventListener("click", (e) => {
          e.stopPropagation();
          this.newChat();
        });

      root.querySelector("#mt-form")?.addEventListener("submit", (e) => {
        e.preventDefault();
        this.sendMessage();
      });

      this.bindRefsToggles();
      this.bindHistoryDayCards();
    }

    render() {
      const expanded = this.state.expanded;
      const view = this.state.view;
      const showSidebar = expanded && view === "chat";

      const shellClass = [
        "mt-shell",
        expanded ? "mt-shell--expanded" : "",
        showSidebar ? "mt-shell--with-sidebar" : "",
      ]
        .filter(Boolean)
        .join(" ");

      const mainContent =
        view === "history"
          ? this.renderHistoryFull()
          : `<div class="mt-body">
          <div class="mt-chat-toolbar mt-new-chat-bg">
            <button type="button" class="mt-btn-new-chat" data-action="new-chat">Nuevo chat</button>
          </div>
          <div class="mt-messages" id="mt-messages">
            ${this.renderMessages()}
            ${
              this.state.loading
                ? `<div class="mt-typing-wrap" aria-live="polite" aria-label="El asistente está escribiendo">
                <div class="mt-msg-bot mt-typing-bubble">
                  <div class="mt-typing"><span></span><span></span><span></span></div>
                  <span class="mt-typing-label">Escribiendo…</span>
                </div>
              </div>`
                : ""
            }
          </div>
          <form class="mt-input-row" id="mt-form">
            <input id="mt-input" type="text" placeholder="Tu mensaje" autocomplete="off" />
            <button type="submit" aria-label="Enviar">${svgSend()}</button>
          </form>
        </div>`;

      this.shadowRoot.innerHTML = `
        <style>${buildStyles()}</style>
        <button type="button" class="mt-launcher" data-action="toggle-chat" aria-label="Abrir chat">
          ${svgChat()}
        </button>
        ${
          this.state.isOpen
            ? `
        <div class="${shellClass}">
          ${
            showSidebar
              ? `<aside class="mt-sidebar">
            <div class="mt-sidebar-head">Tu historial</div>
            <div class="mt-sidebar-scroll">${this.renderSidebarHistory()}</div>
          </aside>`
              : ""
          }
          <div class="mt-main">
            ${
              view === "history"
                ? mainContent
                : `
            <header class="mt-header">
              <button type="button" class="mt-icon-btn" data-action="open-history" aria-label="Historial">
                ${svgHistory()}
              </button>
              <span class="mt-header-title">${escapeHtml(this.title)}</span>
              <div class="mt-header-actions">
                <button type="button" class="mt-icon-btn" data-action="expand-toggle" aria-label="${
                  expanded ? "Restaurar tamaño" : "Ampliar"
                }">
                  ${expanded ? svgMinimize() : svgMaximize()}
                </button>
              </div>
            </header>
            ${mainContent}
            `
            }
          </div>
        </div>
        `
            : ""
        }
      `;

      this.bindShell();

      if (this.state.isOpen && view === "chat") {
        const sc = this.shadowRoot.querySelector("#mt-messages");
        if (sc) sc.scrollTop = sc.scrollHeight;
      }
    }
  }

  function svgChat() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;
  }

  function svgSend() {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>`;
  }

  function svgHistory() {
    return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>`;
  }

  function svgMaximize() {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>`;
  }

  function svgMinimize() {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/></svg>`;
  }

  function svgDoc() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>`;
  }

  function svgChevronLeft() {
    return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>`;
  }

  customElements.define("chatbot-widget", ChatbotWidget);
})();
