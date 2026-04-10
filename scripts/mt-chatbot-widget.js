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
  padding: 10px 12px 16px;
}

.mt-sidebar .hist-day-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--mt-primary);
  margin: 12px 0 8px;
  font-family: 'Inter', sans-serif;
}

.mt-sidebar .hist-day-label:first-child { margin-top: 0; }

.mt-sidebar-card {
  padding: 10px 12px;
  border-radius: 8px;
  background: ${t.botBubble};
  margin-bottom: 8px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: border-color 0.15s, background 0.15s;
}

.mt-sidebar-card:hover {
  border-color: rgba(${t.primaryRgb}, 0.25);
}

.mt-sidebar-card.mt-active {
  background: var(--mt-primary);
  color: #fff;
}

.mt-sidebar-card.mt-active .hist-time {
  color: rgba(255,255,255,0.85);
}

.mt-sidebar-q {
  font-size: 11px;
  font-weight: 500;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.mt-sidebar .hist-time {
  font-size: 10px;
  margin-top: 6px;
  color: ${t.textMuted};
  font-weight: 500;
}

.mt-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.mt-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 15px 20px;
  background: ${t.primary};
  color: #fff;
  flex-shrink: 0;
}

.mt-header-title {
  font-family: 'Inter', sans-serif;
  font-weight: 700;
  font-size: 19px;
  letter-spacing: -0.02em;
}

.mt-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.mt-icon-btn {
  width: 36px;
  height: 36px;
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

.mt-menu-wrap {
  position: relative;
}

.mt-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 180px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  border: 1px solid #eee;
  padding: 6px;
  z-index: 10;
  display: none;
}

.mt-menu.mt-open {
  display: block;
}

.mt-menu button {
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border: none;
  background: none;
  font-size: 14px;
  font-family: inherit;
  color: ${t.text};
  border-radius: 8px;
  cursor: pointer;
}

.mt-menu button:hover {
  background: ${t.botBubble};
}

.mt-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #fff;
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

.mt-loading {
  padding: 14px;
  color: ${t.textMuted};
  font-style: italic;
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
  transition: background 0.15s, border-color 0.15s;
}

.refs-toggle:hover {
  background: #f5f7ff;
  border-color: var(--mt-primary);
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

.refs-panel {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
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
  margin: 0;
  padding: 0 0 0 12px;
  border-left: 2px solid #cbd5e1;
  font-size: 14px;
  line-height: 1.45;
  color: ${t.text};
  white-space: pre-wrap;
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
  padding: 16px 18px 20px;
}

.hist-day-label {
  font-size: 18px;
  font-weight: 600;
  font-family: 'Inter', sans-serif;
  color: var(--mt-primary);
  margin: 20px 0 12px;
}

.hist-day-label:first-child {
  margin-top: 0;
}

.hist-card {
  border-radius: 8px;
  padding: 16px 18px;
  background: ${t.botBubble};
  margin-bottom: 10px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.hist-card:hover {
  border-color: rgba(${t.primaryRgb}, 0.2);
}

.hist-card.mt-expanded {
  border-color: rgba(${t.primaryRgb}, 0.35);
}

.hist-card-q {
  font-size: 13px;
  font-weight: 500;
  color: ${t.text};
  line-height: 1.4;
  margin-bottom: 6px;
}

.hist-meta {
  font-size: 10px;
  font-weight: 500;
  color: ${t.textMuted};
}

.hist-detail {
  display: none;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e5e5e5;
  font-size: 13px;
  line-height: 1.5;
  color: ${t.text};
}

.hist-card.mt-expanded .hist-detail {
  display: block;
}

.hist-detail-answer {
  margin-bottom: 12px;
  font-family: 'Roboto', sans-serif;
}

.mt-empty, .mt-error {
  padding: 20px;
  text-align: center;
  color: ${t.textMuted};
  font-size: 14px;
}

.mt-error { color: #b91c1c; }
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
        menuOpen: false,
        historyLoading: false,
        historyLoaded: false,
        historyItems: [],
        historyError: null,
        expandedHistoryKey: null,
      };
      this._boundDocClick = this._onDocumentClick.bind(this);
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

    disconnectedCallback() {
      document.removeEventListener("click", this._boundDocClick);
    }

    _onDocumentClick(e) {
      if (!this.state.isOpen || !this.state.menuOpen) return;
      const path = e.composedPath();
      if (!path.includes(this)) {
        this.state.menuOpen = false;
        this.render();
      }
    }

    toggleChat() {
      this.state.isOpen = !this.state.isOpen;
      if (!this.state.isOpen) {
        this.state.menuOpen = false;
        document.removeEventListener("click", this._boundDocClick);
      } else {
        document.addEventListener("click", this._boundDocClick);
      }
      this.render();
    }

    toggleExpand() {
      this.state.expanded = !this.state.expanded;
      if (this.state.expanded && !this.state.historyLoaded) {
        this.loadHistory();
      }
      this.render();
    }

    toggleMenu(e) {
      e.stopPropagation();
      this.state.menuOpen = !this.state.menuOpen;
      this.render();
    }

    openHistoryView() {
      this.state.menuOpen = false;
      this.state.view = "history";
      this.loadHistory();
    }

    backToChat() {
      this.state.view = "chat";
      this.render();
    }

    async loadHistory() {
      if (!this.studentId || !this.courseId) {
        this.state.historyError = "Faltan student-id o course-id";
        this.state.historyLoaded = true;
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

    renderBotMessage(m, msgIndex) {
      const text = escapeHtml(m.text);
      const citations = m.citations || [];
      const hasRefs = citations.length > 0;
      const panelId = `refs-panel-${msgIndex}`;

      const refsBlock = hasRefs
        ? `
        <button type="button" class="refs-toggle" aria-expanded="false" aria-controls="${panelId}">
          Referencias
          <span class="refs-count">${citations.length}</span>
        </button>
        <div class="refs-panel" id="${panelId}" hidden>
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
      `
        : "";

      return `<div class="mt-msg-bot-wrap">
        <div class="mt-msg-bot">
          ${text ? `<div class="bot-answer">${text}</div>` : ""}
          ${refsBlock}
        </div>
      </div>`;
    }

    renderMessages() {
      const rows = this.state.messages.map((m, i) => {
        if (m.role === "user") {
          const time = formatTimeColombia(
            m.t ? new Date(m.t).toISOString() : undefined
          );
          return `<div class="mt-msg-user-wrap">
            <div class="mt-msg-user">${escapeHtml(m.text)}</div>
            ${
              time ? `<span class="mt-msg-time">${escapeHtml(time)}</span>` : ""
            }
          </div>`;
        }
        return this.renderBotMessage(m, i);
      });
      return rows.join("");
    }

    renderHistoryFull() {
      if (this.state.historyLoading) {
        return `<div class="mt-history-view"><div class="mt-empty">Cargando historial…</div></div>`;
      }
      if (this.state.historyError) {
        return `<div class="mt-history-view"><div class="mt-error">${escapeHtml(
          this.state.historyError
        )}</div></div>`;
      }
      const groups = groupHistoryByDay(this.state.historyItems);
      if (groups.length === 0) {
        return `<div class="mt-history-view"><div class="mt-empty">No hay consultas recientes.</div></div>`;
      }

      return `<div class="mt-history-view">
        <div class="mt-history-head">
          <button type="button" class="mt-icon-btn" data-action="history-back" aria-label="Volver" style="color:#0421d1;background:#f5f5f5;">
            ${svgChevronLeft()}
          </button>
          <h2>Tu historial</h2>
        </div>
        <div class="mt-history-scroll">
          ${groups
            .map(({ dayKey, items }) => {
              const label = formatDayHeader(dayKey);
              const cards = items
                .map((item) => {
                  const key = `${item.asked_at_colombia}|${item.question}`;
                  const expanded = this.state.expandedHistoryKey === key;
                  const time = formatTimeColombia(item.asked_at_colombia);
                  const cites = mapCitationsFromApi(item.citations);
                  const citeHtml =
                    cites.length > 0
                      ? cites
                          .map(
                            (c) => `
                    <div class="ref-card" style="margin-top:8px;">
                      <div class="ref-card-top">
                        <span class="ref-doc-icon">${svgDoc()}</span>
                        <span class="ref-name">${escapeHtml(
                          citationSourceLabel(c.source)
                        )}</span>
                        ${
                          c.page_number != null && !Number.isNaN(c.page_number)
                            ? `<span class="ref-page">Pág. ${c.page_number}</span>`
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
                    </div>`
                          )
                          .join("")
                      : "";
                  return `
                  <div class="hist-card ${
                    expanded ? "mt-expanded" : ""
                  }" data-history-key="${escapeHtml(key)}">
                    <div class="hist-card-q">${escapeHtml(item.question)}</div>
                    <div class="hist-meta">${escapeHtml(time)}</div>
                    <div class="hist-detail">
                      <div class="hist-detail-answer">${escapeHtml(
                        item.answer || ""
                      )}</div>
                      ${citeHtml}
                    </div>
                  </div>`;
                })
                .join("");
              return `<div class="hist-day-block">
                <div class="hist-day-label">${escapeHtml(label)}</div>
                ${cards}
              </div>`;
            })
            .join("")}
        </div>
      </div>`;
    }

    renderSidebarHistory() {
      if (!this.state.historyLoaded || this.state.historyItems.length === 0) {
        return `<div class="mt-empty" style="padding:16px;font-size:12px;">${
          this.state.historyLoading ? "Cargando…" : "Sin historial"
        }</div>`;
      }
      const groups = groupHistoryByDay(this.state.historyItems);
      return groups
        .map(({ dayKey, items }) => {
          const label = formatDayHeader(dayKey);
          const cards = items
            .map((item) => {
              const key = `${item.asked_at_colombia}|${item.question}`;
              const time = formatTimeColombia(item.asked_at_colombia);
              const active = this.state.expandedHistoryKey === key;
              return `
              <div class="mt-sidebar-card ${
                active ? "mt-active" : ""
              }" data-history-key="${escapeHtml(key)}">
                <div class="mt-sidebar-q">${escapeHtml(item.question)}</div>
                <div class="hist-time">${escapeHtml(time)}</div>
              </div>`;
            })
            .join("");
          return `<div class="mt-sidebar-day">
            <div class="hist-day-label">${escapeHtml(label)}</div>
            ${cards}
          </div>`;
        })
        .join("");
    }

    bindRefsToggles() {
      this.shadowRoot.querySelectorAll(".refs-toggle").forEach((btn) => {
        btn.onclick = () => {
          const panel = btn.nextElementSibling;
          if (!panel?.classList.contains("refs-panel")) return;
          const open = panel.hidden;
          panel.hidden = !open;
          btn.setAttribute("aria-expanded", String(open));
        };
      });
    }

    bindHistoryCards() {
      this.shadowRoot.querySelectorAll("[data-history-key]").forEach((el) => {
        el.onclick = () => {
          const key = el.getAttribute("data-history-key");
          if (!key) return;
          this.state.expandedHistoryKey =
            this.state.expandedHistoryKey === key ? null : key;
          this.render();
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
        .querySelector("[data-action='menu-toggle']")
        ?.addEventListener("click", (e) => this.toggleMenu(e));
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

      root.querySelector("#mt-form")?.addEventListener("submit", (e) => {
        e.preventDefault();
        this.sendMessage();
      });

      this.bindRefsToggles();
      this.bindHistoryCards();

      this.shadowRoot
        .querySelector(".mt-menu")
        ?.addEventListener("click", (e) => e.stopPropagation());
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
          <div class="mt-messages" id="mt-messages">
            ${this.renderMessages()}
            ${
              this.state.loading
                ? `<div class="mt-loading">Escribiendo…</div>`
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
              <span class="mt-header-title">${escapeHtml(this.title)}</span>
              <div class="mt-header-actions">
                <div class="mt-menu-wrap">
                  <button type="button" class="mt-icon-btn" data-action="menu-toggle" aria-label="Menú" aria-haspopup="true">
                    ${svgDots()}
                  </button>
                  <div class="mt-menu ${
                    this.state.menuOpen ? "mt-open" : ""
                  }" role="menu">
                    <button type="button" data-action="open-history" role="menuitem">Historial</button>
                  </div>
                </div>
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

  function svgDots() {
    return `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="6" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="18" r="2"/></svg>`;
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
