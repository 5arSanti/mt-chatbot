/**
 * mt-chatbot-widget — un solo script (import único en HTML).
 * Estructura interna: utilidades → tokens/estilos → custom element.
 */
(function () {
  "use strict";

  /** Logo ENIGMA por defecto; se puede sobrescribir con el atributo `logo-url` en el elemento. */
  const DEFAULT_LOGO_URL =
    "https://storage.googleapis.com/etraining-lms/Enigma/enigmaV1.webp";

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
      return decodeURIComponent(last).replace(/\.pdf$/i, "");
    } catch {
      return last.replace(/\.pdf$/i, "");
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
      location: c.location || null,
      page_number:
        c.page_number != null && c.page_number !== ""
          ? Number(c.page_number)
          : null,
    }));
  }

  function normalizeLikeValue(v) {
    if (v === "1" || v === 1 || v === true) return "1";
    if (v === "0" || v === 0 || v === false) return "0";
    return null;
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
        requestId: item.request_id || null,
        like: normalizeLikeValue(item.like),
        confidence: item.confidence || null,
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

  const DARK = {
    bg: "#0a0e27",
    bg2: "#1a1a3e",
    cyan: "#00d9ff",
    purple: "#a855f7",
    cyanLight: "#67e8f9",
    purpleLight: "#c084fc",
  };

  function buildStyles() {
    const t = THEME;
    return `
/* system-ui fonts — no external import needed */

:host {
  --mt-primary: ${t.primary};
  --mt-text: ${t.text};
  --mt-user-bubble: ${t.userBubble};
  --mt-bot-bubble: ${t.botBubble};
  font-family: system-ui, sans-serif;
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
  transition: transform 0.2s, box-shadow 0.2s;
}

.mt-launcher:hover {
  transform: scale(1.08);
  box-shadow: 0 6px 20px rgba(${t.primaryRgb}, 0.5);
}

.mt-launcher:active { transform: scale(0.95); }

/* Mini Jarvis avatar inside launcher */
.mt-launcher-av {
  position: relative;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mt-launcher-av-sphere {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(0,217,255,0.35) 0%, rgba(168,85,247,0.35) 100%);
  border: 1px solid rgba(0,217,255,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 12px rgba(0,217,255,0.6), inset 0 0 8px rgba(168,85,247,0.3);
  animation: mt-av-sphere-anim 2.5s ease-in-out infinite;
}

.mt-launcher-av-core {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(0,217,255,1) 0%, rgba(99,102,241,0.8) 100%);
  box-shadow: 0 0 8px rgba(0,217,255,1);
}

.mt-launcher-av-orbit {
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  border: 1px solid rgba(0,217,255,0.35);
  animation: mt-orbit 3s linear infinite;
  pointer-events: none;
}

.mt-launcher-av-dot {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 50%;
  height: 3px;
  margin-top: -1.5px;
  transform-origin: 0 50%;
}

.mt-launcher-av-dot::after {
  content: '';
  position: absolute;
  right: -2px;
  top: -2px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #00d9ff;
  box-shadow: 0 0 4px #00d9ff;
}

.mt-launcher--hidden { display: none !important; }

.mt-shell {
  position: fixed;
  top: auto;
  left: auto;
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
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  max-width: none;
  max-height: none;
  transform: none;
  border-radius: 0;
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
  font-family: system-ui, sans-serif;
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
  font-family: system-ui, sans-serif;
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
  flex-shrink: 0;
  display: flex;
  justify-content: flex-start;
  padding: 8px 12px 4px;
  z-index: 10;
}

.mt-btn-new-chat {
  border: 1px solid rgba(${t.primaryRgb}, 0.4);
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 600;
  font-family: system-ui, sans-serif;
  color: var(--mt-primary);
  cursor: pointer;
  border-radius: 8px;
  transition: background 0.15s, border-color 0.15s, transform 0.1s;
  background: #fff;
}

.mt-btn-new-chat:hover {
  background: rgba(${t.primaryRgb}, 0.08);
  transform: scale(1.02);
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
  border-radius: 10px 10px 2px 10px;
  background: ${t.userBubble};
  box-shadow: 0 1px 4px rgba(0,0,0,0.07);
  font-size: 15px;
  font-family: system-ui, sans-serif;
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
  font-family: system-ui, sans-serif;
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
  border-radius: 10px 10px 10px 2px;
  background: ${t.botBubble};
  border: 1px solid #ebebeb;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  font-size: 15px;
  line-height: 1.5;
  color: ${t.text};
}

.mt-feedback {
  margin-top: 10px;
  display: flex;
  gap: 6px;
  opacity: 0;
  transform: translateY(3px);
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.mt-msg-bot-wrap:hover .mt-feedback,
.mt-msg-bot-wrap:focus-within .mt-feedback,
.mt-feedback.has-selection {
  opacity: 1;
  transform: translateY(0);
}

.mt-feedback-btn {
  border: 1px solid #d7defc;
  background: #fff;
  color: var(--mt-primary);
  border-radius: 999px;
  padding: 4px 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-family: system-ui, sans-serif;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.14s ease, border-color 0.14s ease, color 0.14s ease;
}

.mt-feedback-btn svg {
  width: 13px;
  height: 13px;
}

.mt-feedback-btn:hover {
  background: #eef2ff;
  border-color: #b8c6ff;
}

.mt-feedback-btn.is-active {
  color: #fff;
  border-color: var(--mt-primary);
  background: var(--mt-primary);
}

.mt-feedback-btn.is-busy {
  opacity: 0.6;
  pointer-events: none;
}

.mt-msg-bot .bot-answer {
  font-family: system-ui, sans-serif;
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

@keyframes mt-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes mt-conf-fill {
  from { transform: scaleX(0); }
  to   { transform: scaleX(1); }
}

@keyframes mt-fade-in-scale {
  from { opacity: 0; transform: scale(0.8); }
  to   { opacity: 1; transform: scale(1); }
}

@keyframes mt-fade-in-up {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
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
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 15px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.mt-input-row input:focus {
  border-color: ${t.primary};
  box-shadow: 0 0 0 2px rgba(${t.primaryRgb}, 0.1);
}

.mt-input-row input::placeholder {
  color: ${t.inputPlaceholder};
}

.mt-input-row button[type="submit"] {
  padding: 0 16px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, ${t.primary}, #4f5fe0);
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  font-family: system-ui, sans-serif;
  min-width: 44px;
  transition: opacity 0.15s, transform 0.1s;
}

.mt-input-row button[type="submit"]:hover {
  opacity: 0.9;
}

.mt-input-row button[type="submit"]:active {
  transform: scale(0.96);
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
  font-family: system-ui, sans-serif;
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
  font-family: system-ui, sans-serif;
  color: var(--mt-primary);
  line-height: 1.3;
  word-break: break-word;
}

.ref-page {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  font-family: system-ui, sans-serif;
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
  font-family: system-ui, sans-serif;
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
  font-family: system-ui, sans-serif;
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
  font-family: system-ui, sans-serif;
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
  font-family: system-ui, sans-serif;
  color: ${t.textMuted};
}

.hist-row-meta .hist-row-date {
  color: ${t.textMuted};
}

.hist-row-meta .hist-row-count {
  color: ${t.textMuted};
}

.hist-row-like {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.hist-row-like svg {
  width: 12px;
  height: 12px;
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

/* ========== DARK EXPANDED MODE ========== */

.mt-shell--dark {
  background: linear-gradient(135deg, #0a0e27 0%, #1a1a3e 50%, #0a0e27 100%) !important;
}

.mt-bg-decorations {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 0;
}

.mt-bg-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
}

.mt-bg-orb--cyan {
  width: 300px;
  height: 300px;
  background: rgba(0,217,255,0.1);
  top: 25%;
  left: -80px;
  animation: mt-orb-pulse 8s ease-in-out infinite;
}

.mt-bg-orb--purple {
  width: 300px;
  height: 300px;
  background: rgba(168,85,247,0.1);
  bottom: 25%;
  right: -80px;
  animation: mt-orb-pulse 8s ease-in-out infinite reverse;
  animation-delay: -4s;
}

@keyframes mt-orb-pulse {
  0%, 100% { transform: scale(1); opacity: 0.3; }
  50% { transform: scale(1.2); opacity: 0.5; }
}

.mt-shell--dark .mt-main,
.mt-shell--dark .mt-sidebar {
  position: relative;
  z-index: 1;
}

/* --- Dark header --- */
.mt-header--dark {
  background: transparent !important;
  border-bottom: 1px solid rgba(255,255,255,0.1) !important;
  position: relative;
  overflow: hidden;
  padding: 12px 24px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: space-between;
}

.mt-header--dark::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(to right, rgba(0,217,255,0.05), rgba(168,85,247,0.05));
  pointer-events: none;
}

.mt-header-anim-line {
  position: absolute;
  top: 0;
  height: 2px;
  width: 60%;
  background: linear-gradient(90deg, transparent 0%, rgba(0,217,255,0.5) 50%, transparent 100%);
  animation: mt-line-scan 3s linear infinite;
  pointer-events: none;
}

@keyframes mt-line-scan {
  0% { left: -60%; }
  100% { left: 100%; }
}

.mt-logo-section {
  display: flex;
  align-items: center;
  gap: 24px;
  flex: 1;
  min-width: 0;
}

.mt-logo {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: default;
}

.mt-logo-icon-wrap {
  position: relative;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}

.mt-logo-icon-glow {
  position: absolute;
  inset: -4px;
  background: linear-gradient(to right, rgba(0,217,255,0.5), rgba(168,85,247,0.5));
  border-radius: 12px;
  filter: blur(6px);
}

.mt-logo-icon {
  position: relative;
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #00d9ff, #a855f7);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.mt-logo-name {
  font-size: 20px;
  font-weight: 700;
  font-family: system-ui, sans-serif;
  background: linear-gradient(to right, #67e8f9, #c084fc);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1.2;
}

.mt-logo-subtitle {
  font-size: 11px;
  color: rgba(255,255,255,0.5);
  font-family: system-ui, sans-serif;
  margin-top: 1px;
}

.mt-header-divider {
  width: 1px;
  height: 32px;
  background: rgba(255,255,255,0.1);
  flex-shrink: 0;
}

.mt-course-badge {
  padding: 6px 12px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  font-size: 13px;
  color: rgba(255,255,255,0.7);
  font-family: system-ui, sans-serif;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mt-header-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.mt-student-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  font-size: 13px;
  color: rgba(255,255,255,0.7);
  font-family: system-ui, sans-serif;
}

.mt-student-badge svg {
  width: 16px;
  height: 16px;
  color: #00d9ff;
  flex-shrink: 0;
}

.mt-btn-history-dark {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 16px;
  background: linear-gradient(to right, rgba(0,217,255,0.1), rgba(168,85,247,0.1));
  border: 1px solid rgba(0,217,255,0.3);
  border-radius: 8px;
  font-size: 13px;
  color: rgba(255,255,255,0.9);
  font-weight: 500;
  cursor: pointer;
  font-family: system-ui, sans-serif;
  transition: background 0.2s;
}

.mt-btn-history-dark:hover {
  background: linear-gradient(to right, rgba(0,217,255,0.2), rgba(168,85,247,0.2));
}

.mt-btn-history-dark svg {
  width: 16px;
  height: 16px;
  color: #00d9ff;
}

.mt-btn-maximize-dark {
  width: 36px;
  height: 36px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: rgba(255,255,255,0.7);
  transition: background 0.15s;
}

.mt-btn-maximize-dark:hover {
  background: rgba(255,255,255,0.1);
}

/* --- Dark sidebar --- */
.mt-sidebar--dark {
  background: linear-gradient(to bottom, rgba(0,0,0,0.4), rgba(0,0,0,0.6)) !important;
  border-right: 1px solid rgba(255,255,255,0.1) !important;
}

.mt-sidebar-head--dark {
  padding: 16px 18px 12px !important;
  border-bottom: 1px solid rgba(255,255,255,0.1) !important;
  background: transparent !important;
}

.mt-sidebar-head-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mt-sidebar-head-row svg {
  width: 20px;
  height: 20px;
  color: #00d9ff;
  flex-shrink: 0;
}

.mt-sidebar-head-title {
  font-size: 15px;
  font-weight: 600;
  color: rgba(255,255,255,0.9);
  font-family: system-ui, sans-serif;
}

.mt-sidebar-head-count {
  font-size: 12px;
  color: rgba(255,255,255,0.5);
  font-family: system-ui, sans-serif;
  margin-top: 4px;
}

.mt-shell--dark .mt-sidebar-scroll {
  background: transparent;
}

.mt-shell--dark .hist-list {
  gap: 8px;
  padding: 12px;
}

.mt-shell--dark .hist-row {
  background: rgba(255,255,255,0.05) !important;
  border: 1px solid rgba(255,255,255,0.1) !important;
  border-radius: 8px !important;
  border-bottom: 1px solid rgba(255,255,255,0.1) !important;
  padding: 12px !important;
}

.mt-shell--dark .hist-row:hover:not(.mt-day-active) {
  background: rgba(255,255,255,0.1) !important;
  border-color: rgba(255,255,255,0.2) !important;
}

.mt-shell--dark .hist-row .hist-row-q {
  color: rgba(255,255,255,0.9) !important;
}

.mt-shell--dark .hist-row .hist-row-meta,
.mt-shell--dark .hist-row .hist-row-date,
.mt-shell--dark .hist-row .hist-row-count,
.mt-shell--dark .hist-row .hist-row-sep {
  color: rgba(255,255,255,0.5) !important;
}

.mt-shell--dark .hist-row.mt-day-active {
  background: linear-gradient(135deg, rgba(0,217,255,0.2), rgba(168,85,247,0.2)) !important;
  border-color: rgba(0,217,255,0.4) !important;
}

.mt-shell--dark .hist-row.mt-day-active .hist-row-q,
.mt-shell--dark .hist-row.mt-day-active .hist-row-meta,
.mt-shell--dark .hist-row.mt-day-active .hist-row-date,
.mt-shell--dark .hist-row.mt-day-active .hist-row-count {
  color: rgba(255,255,255,0.95) !important;
}

.mt-sidebar-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  padding: 16px;
  min-height: 120px;
}

.mt-sidebar-empty svg {
  width: 48px;
  height: 48px;
  color: rgba(255,255,255,0.2);
  margin-bottom: 12px;
}

.mt-sidebar-empty p {
  font-size: 13px;
  color: rgba(255,255,255,0.4);
  font-family: system-ui, sans-serif;
  margin: 0;
}

/* --- Dark body & messages --- */
.mt-shell--dark .mt-body {
  background: transparent !important;
}

.mt-shell--dark .mt-messages {
  background: transparent;
  padding: 24px;
}

.mt-shell--dark .mt-msg-user {
  background: rgba(255,255,255,0.1) !important;
  color: rgba(255,255,255,0.9) !important;
  border: 1px solid rgba(255,255,255,0.2);
}

.mt-shell--dark .mt-msg-bot {
  background: rgba(255,255,255,0.05) !important;
  color: rgba(255,255,255,0.9) !important;
  border: 1px solid rgba(255,255,255,0.1);
}

.mt-shell--dark .mt-msg-time {
  color: rgba(255,255,255,0.4) !important;
}

.mt-shell--dark .mt-typing-label {
  color: rgba(255,255,255,0.5) !important;
}

.mt-shell--dark .mt-typing span {
  background: rgba(255,255,255,0.5) !important;
}

.mt-shell--dark .mt-chat-toolbar {
  background: linear-gradient(to bottom, rgba(10,14,39,0.95) 70%, transparent 100%);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.mt-shell--dark .mt-btn-new-chat {
  color: #67e8f9 !important;
  background: rgba(0,217,255,0.1) !important;
  border: 1px solid rgba(0,217,255,0.35) !important;
}

.mt-shell--dark .mt-btn-new-chat:hover {
  background: rgba(0,217,255,0.2) !important;
  border-color: rgba(0,217,255,0.6) !important;
}

/* --- Empty state dark --- */
.mt-empty-state-dark {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 32px;
}

.mt-es-inner {
  max-width: 700px;
  width: 100%;
  text-align: center;
  margin: auto 0;
  padding: 16px 0;
}

/* CSS Avatar */
.mt-av-wrap {
  display: flex;
  justify-content: center;
  margin-bottom: 32px;
}

.mt-av {
  position: relative;
  width: 72px;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mt-av-glow {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(0,217,255,0.3) 0%, transparent 70%);
  filter: blur(20px);
  animation: mt-av-glow-anim 2s ease-in-out infinite;
}

@keyframes mt-av-glow-anim {
  0%, 100% { transform: scale(1); opacity: 0.5; }
  50% { transform: scale(1.2); opacity: 0.7; }
}

.mt-av-sphere {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(0,217,255,0.2) 0%, rgba(168,85,247,0.2) 100%);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(0,217,255,0.4);
  animation: mt-av-sphere-anim 2s ease-in-out infinite;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

@keyframes mt-av-sphere-anim {
  0%, 100% { box-shadow: 0 0 30px rgba(0,217,255,0.5), inset 0 0 20px rgba(168,85,247,0.3); }
  50% { box-shadow: 0 0 50px rgba(0,217,255,0.8), inset 0 0 30px rgba(168,85,247,0.5); }
}

.mt-av-core {
  width: 50%;
  height: 50%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(0,217,255,0.8) 0%, rgba(99,102,241,0.6) 100%);
  box-shadow: 0 0 20px rgba(0,217,255,0.8);
  position: relative;
  z-index: 2;
}

.mt-av-orbit-ring {
  position: absolute;
  inset: -14px;
  border-radius: 50%;
  border: 1px solid rgba(0,217,255,0.22);
  animation: mt-orbit 5s linear infinite;
  pointer-events: none;
}

@keyframes mt-orbit {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

.mt-av-arm {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 50%;
  height: 4px;
  margin-top: -2px;
  transform-origin: 0 50%;
  transform: rotate(var(--a, 0deg));
}

.mt-av-p {
  position: absolute;
  right: -2px;
  top: 0;
  width: 4px;
  height: 4px;
  border-radius: 50%;
}

.mt-av-p--cyan {
  background: rgba(0,217,255,0.9);
  box-shadow: 0 0 6px rgba(0,217,255,0.8);
}

.mt-av-p--purple {
  background: rgba(168,85,247,0.9);
  box-shadow: 0 0 6px rgba(168,85,247,0.8);
}

/* Welcome text */
.mt-es-title {
  font-size: 28px;
  font-weight: 700;
  font-family: system-ui, sans-serif;
  background: linear-gradient(to right, #67e8f9, #c084fc);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0 0 12px;
  line-height: 1.2;
}

.mt-es-subtitle {
  font-size: 16px;
  color: rgba(255,255,255,0.6);
  margin: 0 0 32px;
  line-height: 1.6;
  font-family: system-ui, sans-serif;
}

/* Feature grid */
.mt-features-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 32px;
}

.mt-feature-card {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  padding: 16px;
  transition: background 0.2s;
}

.mt-feature-card:hover {
  background: rgba(255,255,255,0.1);
}

.mt-feature-icon {
  display: block;
  width: 32px;
  height: 32px;
  color: #00d9ff;
  margin: 0 auto 12px;
}

.mt-feature-name {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255,255,255,0.9);
  font-family: system-ui, sans-serif;
  margin: 0 0 4px;
}

.mt-feature-desc {
  font-size: 12px;
  color: rgba(255,255,255,0.6);
  font-family: system-ui, sans-serif;
  line-height: 1.4;
  margin: 0;
}

/* Suggestions */
.mt-sug-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 16px;
  font-size: 13px;
  color: rgba(255,255,255,0.5);
  font-family: system-ui, sans-serif;
}

.mt-sug-hint svg {
  width: 16px;
  height: 16px;
  color: #a855f7;
}

.mt-sug-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.mt-sug-btn {
  padding: 8px 16px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  font-size: 13px;
  color: rgba(255,255,255,0.7);
  cursor: pointer;
  font-family: system-ui, sans-serif;
  transition: background 0.15s, border-color 0.15s, color 0.15s, transform 0.1s;
  transform: scale(1);
}

.mt-sug-btn:hover {
  background: linear-gradient(to right, rgba(0,217,255,0.2), rgba(168,85,247,0.2));
  border-color: rgba(0,217,255,0.3);
  color: rgba(255,255,255,0.9);
  transform: scale(1.02);
}

.mt-sug-btn:active {
  transform: scale(0.97);
}

@keyframes mt-sparkles-pop {
  0%   { opacity: 0; transform: scale(0) rotate(-45deg); }
  60%  { transform: scale(1.2) rotate(5deg); }
  100% { opacity: 1; transform: scale(1) rotate(0deg); }
}

/* Dark input */
.mt-input-dark-area {
  border-top: 1px solid rgba(255,255,255,0.1);
  background: rgba(0,0,0,0.2);
  backdrop-filter: blur(12px);
  padding: 16px 24px;
  flex-shrink: 0;
}

.mt-input-dark-inner {
  max-width: 760px;
  margin: 0 auto;
}

/* Wrapper relativo para el glow exterior */
.mt-input-wrap {
  position: relative;
}

/* Glow blur que aparece al enfocar — idéntico al de ChatInput.tsx */
.mt-input-glow {
  position: absolute;
  inset: -2px;
  background: linear-gradient(to right, rgba(0,217,255,0.35), rgba(168,85,247,0.35));
  border-radius: 18px;
  filter: blur(10px);
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
  z-index: 0;
}

.mt-input-wrap:focus-within .mt-input-glow {
  opacity: 1;
}

@keyframes mt-scan-bar {
  from { transform: translateX(-100%); }
  to   { transform: translateX(100%); }
}

.mt-input-glass {
  position: relative;
  z-index: 1;
  background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05));
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  transition: border-color 0.2s;
}

.mt-input-glass:hover {
  border-color: rgba(255,255,255,0.32);
}

/* Barra "scanner" en el borde superior — idéntico al de ChatInput.tsx */
.mt-input-scanner {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent 0%, rgba(0,217,255,0.9) 50%, transparent 100%);
  pointer-events: none;
  transform: translateX(-100%);
  opacity: 0;
}

.mt-input-glass:focus-within .mt-input-scanner {
  opacity: 1;
  animation: mt-scan-bar 2s linear infinite;
}

.mt-input-glass input {
  flex: 1;
  background: transparent !important;
  border: none !important;
  border-radius: 0 !important;
  padding: 0 !important;
  color: white !important;
  font-size: 15px;
  outline: none;
  font-family: system-ui, sans-serif;
}

.mt-input-glass input::placeholder {
  color: rgba(255,255,255,0.4) !important;
  font-size: 13px !important;
}

.mt-btn-send-dark {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #00d9ff, #a855f7);
  border: none;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: white;
  transition: opacity 0.15s;
}

.mt-btn-send-dark:hover {
  opacity: 0.9;
}

/* Responsive expanded */
@media (max-width: 600px) {
  .mt-shell.mt-shell--expanded {
    width: 100vw !important;
    height: 100vh !important;
    height: 100dvh !important;
  }
  /* En mobile el chat compacto ocupa toda la pantalla */
  .mt-shell {
    position: fixed !important;
    inset: 0 !important;
    bottom: 0 !important;
    right: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    height: 100dvh !important;
    border-radius: 0 !important;
  }
  .mt-features-grid {
    grid-template-columns: 1fr;
  }
  .mt-logo-subtitle,
  .mt-course-badge,
  .mt-student-badge,
  .mt-header-divider {
    display: none;
  }
  .mt-es-title { font-size: 22px; }
  .mt-es-subtitle { font-size: 14px; }
  .mt-empty-state-dark { padding: 16px; }
  .mt-input-dark-area { padding: 12px 16px; }
}

@media (max-width: 900px) {
  .mt-shell.mt-shell--expanded {
    width: 100vw !important;
    height: 100vh !important;
    height: 100dvh !important;
  }
  .mt-features-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .mt-sidebar {
    min-width: 200px !important;
    width: 200px !important;
  }
}

/* Pantallas de poca altura: compactar el empty state */
@media (max-height: 640px) {
  .mt-av-wrap { margin-bottom: 16px; }
  .mt-av-wrap .mt-av { width: 64px !important; height: 64px !important; }
  .mt-es-title { font-size: 20px; margin-bottom: 8px; }
  .mt-es-subtitle { font-size: 13px; margin-bottom: 16px; }
  .mt-features-grid { gap: 10px; margin-bottom: 16px; }
  .mt-feature-card { padding: 10px 12px; }
  .mt-feature-icon { width: 24px; height: 24px; margin-bottom: 8px; }
  .mt-empty-state-dark { padding: 16px 24px; }
  .mt-es-inner { padding: 8px 0; }
}

@media (max-height: 480px) {
  .mt-av-wrap { margin-bottom: 10px; }
  .mt-av-wrap .mt-av { width: 48px !important; height: 48px !important; }
  .mt-es-title { font-size: 17px; }
  .mt-es-subtitle { display: none; }
  .mt-features-grid { grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 10px; }
  .mt-feature-desc { display: none; }
  .mt-feature-card { padding: 8px; }
}

/* --- Loading state dark --- */
.mt-loading-state {
  display: flex !important;
  flex-direction: row !important;
  gap: 16px;
  margin-bottom: 32px;
  align-items: flex-start;
  width: 100%;
  animation: mt-fade-in 0.35s ease;
}

.mt-av--medium {
  width: 80px !important;
  height: 80px !important;
  flex-shrink: 0;
  margin-top: 8px;
}

.mt-loading-card-wrap {
  flex: 1 1 0%;
  min-width: 0;
  max-width: 896px;
  position: relative;
}

.mt-loading-card-glow {
  position: absolute;
  inset: -3px;
  background: linear-gradient(to right, rgba(168,85,247,0.35), rgba(0,217,255,0.35));
  border-radius: 20px;
  filter: blur(10px);
}

.mt-loading-card {
  position: relative;
  background: linear-gradient(to right, rgba(65, 12, 120, 0.55), rgba(4, 88, 112, 0.55));
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 16px;
  padding: 20px 24px;
  overflow: hidden;
}

.mt-loading-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.mt-loading-text {
  font-size: 14px;
  color: rgba(255,255,255,0.7);
  font-family: system-ui, sans-serif;
}

.mt-loading-dots {
  display: flex;
  gap: 4px;
  align-items: center;
}

.mt-loading-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #00d9ff;
  animation: mt-dot-pulse 1s ease-in-out infinite;
}

.mt-loading-dot:nth-child(2) { animation-delay: 0.2s; }
.mt-loading-dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes mt-dot-pulse {
  0%, 100% { transform: scale(1); opacity: 0.5; }
  50% { transform: scale(1.3); opacity: 1; }
}

.mt-loading-skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mt-loading-skel-line {
  height: 8px;
  border-radius: 999px;
  background: linear-gradient(to right, rgba(255,255,255,0.12), rgba(255,255,255,0.22), rgba(255,255,255,0.12));
  animation: mt-skel-pulse 1.5s ease-in-out infinite;
}

.mt-loading-skel-line:nth-child(2) { width: 85%; animation-delay: 0.1s; }
.mt-loading-skel-line:nth-child(3) { width: 95%; animation-delay: 0.2s; }

@keyframes mt-skel-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.9; }
}

.mt-loading-scan {
  position: absolute;
  top: 0;
  left: -60%;
  width: 60%;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgba(0,217,255,0.6), transparent);
  animation: mt-loading-scan-anim 2s linear infinite;
  pointer-events: none;
}

@keyframes mt-loading-scan-anim {
  0% { left: -60%; }
  100% { left: 100%; }
}

/* --- Citation cards (dark mode) --- */
.mt-citation-card {
  position: relative;
  background: linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.12) 100%);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 8px;
  padding: 16px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  overflow: hidden;
  min-width: 0;
}

.mt-citation-card:hover {
  border-color: rgba(0,217,255,0.4);
  box-shadow: 0 0 0 1px rgba(0,217,255,0.1), 0 0 20px rgba(0,217,255,0.1);
}

.mt-citation-card-glow {
  display: none;
}

.mt-citation-snippet-wrap {
  padding-left: 12px;
  border-left: 2px solid rgba(168,85,247,0.4);
  overflow: hidden;
}

.mt-citation-snippet {
  font-size: 13px;
  color: rgba(255,255,255,0.7);
  line-height: 1.5;
  margin: 0;
  font-family: system-ui, sans-serif;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
  overflow-wrap: break-word;
}

.mt-citation-more {
  display: block;
  text-align: right;
  font-size: 12px;
  font-family: system-ui, sans-serif;
  color: rgba(0,217,255,0);
  margin-top: 8px;
  transition: color 0.2s ease;
  pointer-events: none;
}

.mt-citation-card:hover .mt-citation-more {
  color: rgba(0,217,255,1);
}

/* --- Bot answer bubble --- */
.mt-bot-bubble-wrap {
  position: relative;
  margin-bottom: 16px;
}

.mt-bot-bubble-glow {
  position: absolute;
  inset: -2px;
  background: linear-gradient(to right, rgba(168,85,247,0.25), rgba(0,217,255,0.25));
  border-radius: 18px;
  filter: blur(10px);
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
  z-index: 0;
}

.mt-bot-bubble-wrap:hover .mt-bot-bubble-glow {
  opacity: 1;
}

.mt-bot-bubble-card {
  position: relative;
  z-index: 1;
  background: linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.12) 100%);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 16px;
  padding: 20px 24px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
}

/* --- Feedback buttons (dark mode) --- */
.mt-dk-btn {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.05);
  color: rgba(255,255,255,0.6);
  cursor: pointer;
  font-size: 14px;
  font-family: system-ui, sans-serif;
  font-weight: 500;
  overflow: hidden;
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
}

.mt-dk-btn svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.mt-dk-btn-inner {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
}

.mt-dk-btn-glow {
  position: absolute;
  inset: -2px;
  border-radius: 10px;
  filter: blur(4px);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
}

.mt-dk-btn--like:hover {
  border-color: rgba(16,185,129,0.4);
  color: rgb(52,211,153);
}

.mt-dk-btn--dislike:hover {
  border-color: rgba(244,63,94,0.4);
  color: rgb(251,113,133);
}

.mt-dk-btn--like.is-active {
  background: rgba(16,185,129,0.2);
  border-color: rgba(16,185,129,0.5);
  color: rgb(52,211,153);
}

.mt-dk-btn--dislike.is-active {
  background: rgba(244,63,94,0.2);
  border-color: rgba(244,63,94,0.5);
  color: rgb(251,113,133);
}

.mt-dk-btn--like.is-active .mt-dk-btn-glow {
  background: linear-gradient(to right, rgba(16,185,129,0.3), rgba(0,217,255,0.3));
  opacity: 1;
}

.mt-dk-btn--dislike.is-active .mt-dk-btn-glow {
  background: linear-gradient(to right, rgba(244,63,94,0.3), rgba(236,72,153,0.3));
  opacity: 1;
}

/* Dark scrollbar */
.mt-shell--dark .mt-messages::-webkit-scrollbar,
.mt-shell--dark .mt-sidebar-scroll::-webkit-scrollbar,
.mt-shell--dark .mt-history-scroll::-webkit-scrollbar,
.mt-shell--dark .mt-empty-state-dark::-webkit-scrollbar {
  width: 8px;
}

.mt-shell--dark .mt-messages::-webkit-scrollbar-track,
.mt-shell--dark .mt-sidebar-scroll::-webkit-scrollbar-track,
.mt-shell--dark .mt-history-scroll::-webkit-scrollbar-track,
.mt-shell--dark .mt-empty-state-dark::-webkit-scrollbar-track {
  background: rgba(255,255,255,0.05);
  border-radius: 4px;
}

.mt-shell--dark .mt-messages::-webkit-scrollbar-thumb,
.mt-shell--dark .mt-sidebar-scroll::-webkit-scrollbar-thumb,
.mt-shell--dark .mt-history-scroll::-webkit-scrollbar-thumb,
.mt-shell--dark .mt-empty-state-dark::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, rgba(0,217,255,0.4), rgba(168,85,247,0.4));
  border-radius: 4px;
}

/* ========== COMPACT DARK CHAT ========== */

.mt-header--compact-dk {
  padding: 8px 14px !important;
  display: flex !important;
  justify-content: space-between !important;
  align-items: center !important;
}

.mt-header--compact-dk .mt-compact-logo {
  flex: 1;
  justify-content: center;
}

.mt-compact-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.mt-compact-logo-icon {
  width: 28px;
  height: 28px;
  background: linear-gradient(135deg, rgba(0,217,255,0.25), rgba(168,85,247,0.25));
  border: 1px solid rgba(0,217,255,0.4);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #00d9ff;
  flex-shrink: 0;
}

.mt-compact-logo-icon svg { width: 16px; height: 16px; }

.mt-compact-logo-name {
  font-family: system-ui, sans-serif;
  font-weight: 700;
  font-size: 14px;
  background: linear-gradient(to right, #67e8f9, #c084fc);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: -0.01em;
  line-height: 1.2;
}

.mt-compact-logo-sub {
  font-family: system-ui, sans-serif;
  font-size: 10px;
  color: rgba(255,255,255,0.5);
  margin-top: 1px;
}

/* Compact empty state — dark themed */
.mt-compact-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px 16px 12px;
  text-align: center;
  gap: 14px;
  overflow-y: auto;
}

.mt-cpt-av {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(0,217,255,0.2) 0%, rgba(168,85,247,0.2) 100%);
  border: 1px solid rgba(0,217,255,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #00d9ff;
  box-shadow: 0 0 30px rgba(0,217,255,0.3), inset 0 0 20px rgba(168,85,247,0.2);
  flex-shrink: 0;
  animation: mt-av-sphere-anim 2.5s ease-in-out infinite;
}

.mt-cpt-av svg { width: 28px; height: 28px; }

.mt-cpt-title {
  margin: 0 0 6px;
  font-family: system-ui, sans-serif;
  font-weight: 700;
  font-size: 20px;
  background: linear-gradient(to right, #67e8f9, #c084fc);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: -0.02em;
}

.mt-cpt-subtitle {
  margin: 0 0 4px;
  font-family: system-ui, sans-serif;
  font-size: 12px;
  color: rgba(255,255,255,0.55);
  line-height: 1.5;
}

.mt-cpt-chips {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.mt-cpt-chip {
  padding: 9px 14px;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  background: rgba(255,255,255,0.05);
  font-size: 12px;
  color: rgba(255,255,255,0.7);
  cursor: pointer;
  font-family: system-ui, sans-serif;
  text-align: left;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  line-height: 1.3;
}

.mt-cpt-chip:hover {
  background: linear-gradient(to right, rgba(0,217,255,0.15), rgba(168,85,247,0.15));
  border-color: rgba(0,217,255,0.3);
  color: rgba(255,255,255,0.95);
}

/* Dark theme body override */
.mt-shell--dark .mt-body {
  background: transparent !important;
}

/* Compact: orbes de fondo más pequeños */
.mt-shell:not(.mt-shell--expanded) .mt-bg-orb--cyan {
  width: 180px !important;
  height: 180px !important;
  filter: blur(50px) !important;
}

.mt-shell:not(.mt-shell--expanded) .mt-bg-orb--purple {
  width: 180px !important;
  height: 180px !important;
  filter: blur(50px) !important;
}

/* Compact size overrides for dark messages */
.mt-shell:not(.mt-shell--expanded) .mt-messages {
  padding: 14px 12px !important;
}

.mt-shell:not(.mt-shell--expanded) .mt-input-dark-area {
  padding: 10px 14px !important;
}

.mt-shell:not(.mt-shell--expanded) .mt-input-dark-inner {
  max-width: none !important;
}

.mt-shell:not(.mt-shell--expanded) .mt-av--medium {
  width: 36px !important;
  height: 36px !important;
  margin-top: 4px !important;
}

.mt-shell:not(.mt-shell--expanded) .mt-av--medium .mt-av-orbit-ring {
  display: none;
}

.mt-shell:not(.mt-shell--expanded) .mt-av--medium .mt-av-core {
  width: 55% !important;
  height: 55% !important;
}

.mt-shell:not(.mt-shell--expanded) .mt-bot-bubble-card {
  padding: 12px 14px !important;
  border-radius: 12px !important;
}

.mt-shell:not(.mt-shell--expanded) .mt-loading-card {
  padding: 12px 14px !important;
  border-radius: 12px !important;
}

.mt-shell:not(.mt-shell--expanded) .mt-loading-state {
  gap: 10px !important;
  margin-bottom: 16px !important;
}

.mt-shell:not(.mt-shell--expanded) .mt-messages > div[style*="margin-bottom:32px"] {
  margin-bottom: 16px !important;
}

.mt-shell:not(.mt-shell--expanded) .mt-messages > div[style*="margin-bottom: 32px"] {
  margin-bottom: 16px !important;
}

/* Compact: texto del bot más compacto */
.mt-shell:not(.mt-shell--expanded) .mt-bot-answer-text {
  font-size: 13px !important;
  line-height: 1.5 !important;
}

/* Compact: user bubble más pequeño */
.mt-shell:not(.mt-shell--expanded) .mt-user-bubble {
  font-size: 13px !important;
  padding: 8px 12px !important;
}

/* Compact: footer de mensaje más pequeño */
.mt-shell:not(.mt-shell--expanded) .mt-msg-footer {
  flex-direction: column !important;
  gap: 8px !important;
  font-size: 11px !important;
}

/* Compact: citas reducidas */
.mt-shell:not(.mt-shell--expanded) .mt-citations-section {
  margin-bottom: 10px !important;
}

/* Compact: el header animated line */
.mt-shell:not(.mt-shell--expanded) .mt-header-anim-line {
  height: 2px;
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
        loadingPhase: "listening",
        messages: [],
        expanded: false,
        view: "chat",
        historyLoading: false,
        historyLoaded: false,
        historyItems: [],
        historyError: null,
        selectedDayKey: null,
        historySearch: '',
        historyFilter: 'all',
        expandedHistoryId: null,
        _lastMsgCount: 0,
        _lastView: 'chat',
        _emptyAnimated: false,
      };
    }

    get apiUrl() {
      return (
        this.getAttribute("api-url") ||
        "https://course-storage-api-qdrant-1018797915827.us-east1.run.app"
      );
    }

    get apiBaseUrl() {
      const baseAttr = this.getAttribute("api-base-url");
      if (baseAttr) return baseAttr.replace(/\/$/, "");
      return this.apiUrl.replace(/\/$/, "");
    }

    get historyUrl() {
      return `${this.apiBaseUrl}/history`;
    }

    get likeUrl() {
      return `${this.apiBaseUrl}/like`;
    }

    get questionUrl() {
      return `${this.apiBaseUrl}/question`;
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

    get studentName() {
      return this.getAttribute("student-name");
    }

    get courseName() {
      return this.getAttribute("course-name");
    }

    get logoUrl() {
      return this.getAttribute("logo-url") || DEFAULT_LOGO_URL;
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

    async setLikeForMessage(msgIndex, likeValue) {
      const msg = this.state.messages[msgIndex];
      if (!msg || msg.role !== "bot" || !msg.requestId) return;
      if (msg.likeLoading) return;

      const nextLike = msg.like === likeValue ? null : likeValue;
      const prevLike = msg.like ?? null;
      msg.like = nextLike;
      msg.likeLoading = true;
      this.renderKeepChatScroll();

      try {
        const response = await fetch(this.likeUrl, {
          method: "POST",
          mode: "cors",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request_id: msg.requestId,
            like: nextLike,
          }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
      } catch {
        msg.like = prevLike;
      } finally {
        msg.likeLoading = false;
        this.renderKeepChatScroll();
      }
    }

    /** Devuelve el elemento scrollable del historial según la vista activa. */
    _histScrollEl() {
      return this.shadowRoot?.querySelector('.mt-history-scroll')
          || this.shadowRoot?.querySelector('.mt-body');
    }

    /** Guarda el estado open/closed de todos los acordeones de citaciones. */
    _saveCitAccordions() {
      return Array.from(this.shadowRoot?.querySelectorAll('.mt-cit-body') || [])
        .map(el => el.style.display !== 'none');
    }

    /** Restaura el estado open/closed de los acordeones tras un re-render. */
    _restoreCitAccordions(states) {
      const els = this.shadowRoot?.querySelectorAll('.mt-cit-body') || [];
      els.forEach((el, i) => {
        const open = states[i] || false;
        el.style.display = open ? 'block' : 'none';
        const btn  = el.previousElementSibling;
        const chev = btn?.querySelector('.mt-cit-chev');
        if (chev) chev.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
      });
    }

    /** render() preservando la posición de scroll del historial y el estado de acordeones. */
    renderKeepHistScroll() {
      const el     = this._histScrollEl();
      const pos    = el ? el.scrollTop : 0;
      const citStates = this._saveCitAccordions();
      this.render();
      const nel = this._histScrollEl();
      if (nel) nel.scrollTop = pos;
      this._restoreCitAccordions(citStates);
    }

    /** render() preservando la posición de scroll del chat y el estado de acordeones. */
    renderKeepChatScroll() {
      const el  = this.shadowRoot?.querySelector('#mt-messages');
      const pos = el ? el.scrollTop : null;
      const citStates = this._saveCitAccordions();
      this.render();
      if (pos !== null) {
        const nel = this.shadowRoot?.querySelector('#mt-messages');
        if (nel) nel.scrollTop = pos;
      }
      this._restoreCitAccordions(citStates);
    }

    async setLikeForHistoryItem(itemId, likeValue) {
      const item = this.state.historyItems.find(i => (i.request_id || '') === itemId);
      if (!item || !itemId) return;
      if (item.likeLoading) return;

      const nextLike = normalizeLikeValue(item.like) === likeValue ? null : likeValue;
      const prevLike = normalizeLikeValue(item.like) ?? null;
      item.like = nextLike;
      item.likeLoading = true;
      this.renderKeepHistScroll();

      try {
        const response = await fetch(this.likeUrl, {
          method: "POST",
          mode: "cors",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request_id: itemId, like: nextLike }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
      } catch {
        item.like = prevLike;
      } finally {
        item.likeLoading = false;
        this.renderKeepHistScroll();
      }
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

    historyFilterParam(filter) {
      switch (filter) {
        case 'liked':    return 'like:1';
        case 'disliked': return 'like:0';
        case 'alta':     return 'confidence:alta';
        case 'media':    return 'confidence:media';
        case 'baja':     return 'confidence:baja';
        default:         return null;
      }
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
        const filterParam = this.historyFilterParam(this.state.historyFilter);
        const searchParam = this.state.historySearch || null;

        if (meth === "GET") {
          const u = new URL(reqUrl);
          u.searchParams.set("student_id", this.studentId);
          u.searchParams.set("course_id", this.courseId);
          if (filterParam) u.searchParams.set("filter", filterParam);
          if (searchParam) u.searchParams.set("search", searchParam);
          reqUrl = u.toString();
        } else {
          fetchOpts.headers["Content-Type"] = "application/json";
          const body = {
            student_id: this.studentId,
            course_id: this.courseId,
          };
          if (filterParam) body.filter = filterParam;
          if (searchParam) body.search = searchParam;
          fetchOpts.body = JSON.stringify(body);
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
      this.state.loadingPhase = "listening";
      this.state._scrollToBottom = true;
      this.render();
      if (input) input.value = "";

      const t1 = setTimeout(() => {
        if (!this.state.loading) return;
        this.state.loadingPhase = "thinking";
        this.state._scrollToBottom = true;
        this.render();
      }, 600);

      const t2 = setTimeout(() => {
        if (!this.state.loading) return;
        this.state.loadingPhase = "responding";
        this.state._scrollToBottom = true;
        this.render();
      }, 1800);

      try {
        const response = await fetch(this.questionUrl, {
          method: "POST",
          mode: "cors",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            student_id: this.studentId,
            course_id: this.courseId,
            question,
          }),
        });
        clearTimeout(t1);
        clearTimeout(t2);
        const data = await response.json();
        const citations = mapCitationsFromApi(data.citations);

        this.state.loadingPhase = "showing-evidence";
        this.state._scrollToBottom = true;
        this.render();
        await new Promise((r) => setTimeout(r, 400));

        this.state.messages.push({
          role: "bot",
          text: data.answer || "Sin respuesta",
          citations,
          t: Date.now(),
          requestId: data.request_id || null,
          like: normalizeLikeValue(data.like),
          confidence: data.confidence || null,
        });
      } catch {
        clearTimeout(t1);
        clearTimeout(t2);
        this.state.messages.push({
          role: "bot",
          text: "Error consultando el servicio",
          t: Date.now(),
        });
      }

      this.state.loading = false;
      this.state.loadingPhase = "listening";
      this.state._scrollToBottom = true;
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
      const showFeedback = Boolean(m.requestId);
      const feedbackClass = m.like != null ? " has-selection" : "";
      const likeBusyClass = m.likeLoading ? " is-busy" : "";

      return `<div class="mt-msg-bot-wrap${latest ? " mt-appear" : ""}">
        <div class="mt-msg-bot">
          ${text ? `<div class="bot-answer">${text}</div>` : ""}
          ${refsBlock}
          ${
            showFeedback
              ? `<div class="mt-feedback${feedbackClass}">
              <button type="button" class="mt-feedback-btn${
                m.like === "1" ? " is-active" : ""
              }${likeBusyClass}" data-like-value="1" data-msg-index="${msgIndex}" aria-label="Me gusta">
                ${svgThumbUp()} <span>Me gusta</span>
              </button>
              <button type="button" class="mt-feedback-btn${
                m.like === "0" ? " is-active" : ""
              }${likeBusyClass}" data-like-value="0" data-msg-index="${msgIndex}" aria-label="No me gusta">
                ${svgThumbDown()} <span>No me gusta</span>
              </button>
            </div>`
              : ""
          }
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
      const skelCard = `
        <div style="background:linear-gradient(135deg,rgba(255,255,255,0.05) 0%,rgba(255,255,255,0.08) 100%);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:20px 24px;animation:mt-pulse 1.5s ease-in-out infinite;">
          <div style="height:16px;background:rgba(255,255,255,0.1);border-radius:6px;width:70%;margin-bottom:12px;"></div>
          <div style="height:11px;background:rgba(255,255,255,0.07);border-radius:4px;width:40%;margin-bottom:10px;"></div>
          <div style="height:11px;background:rgba(255,255,255,0.07);border-radius:4px;width:85%;"></div>
        </div>`;
      return `
        <div style="display:flex;flex-direction:column;height:100%;overflow:hidden;">
          <div style="padding:20px 32px 16px;flex-shrink:0;border-bottom:1px solid rgba(255,255,255,0.08);">
            <div style="margin-bottom:16px;">
              <h1 style="font-size:24px;font-weight:700;background:linear-gradient(to right,#22d3ee,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin:0;font-family:system-ui,sans-serif;">Historial de Consultas</h1>
              <p style="font-size:13px;color:rgba(255,255,255,0.45);margin:4px 0 0;font-family:system-ui,sans-serif;">Todas tus preguntas y respuestas organizadas en un solo lugar</p>
            </div>
          </div>
          <div style="flex:1;overflow-y:auto;padding:20px 32px;" class="mt-history-scroll">
            <div style="display:flex;flex-direction:column;gap:14px;">
              ${skelCard}${skelCard}${skelCard}
            </div>
            <div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:24px 0;color:rgba(255,255,255,0.4);font-size:13px;font-family:system-ui,sans-serif;">
              <span class="mt-spin" aria-hidden="true"></span>
              <span>Cargando conversaciones…</span>
            </div>
          </div>
        </div>`;
    }

    renderHistoryCompactLoading() {
      const skeletons = Array(4).fill(0).map((_, i) => `
        <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;margin-bottom:6px;">
          <div style="height:12px;background:rgba(255,255,255,0.09);border-radius:6px;margin-bottom:8px;animation:mt-pulse 1.5s ease-in-out infinite;"></div>
          <div style="height:12px;background:rgba(255,255,255,0.06);border-radius:6px;width:70%;margin-bottom:8px;animation:mt-pulse 1.5s ease-in-out infinite;"></div>
          <div style="height:10px;background:rgba(255,255,255,0.04);border-radius:6px;width:40%;animation:mt-pulse 1.5s ease-in-out infinite;"></div>
        </div>
      `).join('');
      return `
        <div class="mt-body" style="overflow-y:auto !important;display:block !important;padding:0 !important;">
          <div style="padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.08);">
            <div style="height:34px;background:rgba(255,255,255,0.07);border-radius:10px;animation:mt-pulse 1.5s ease-in-out infinite;"></div>
          </div>
          <div style="padding:8px 10px;">${skeletons}</div>
        </div>`;
    }

    renderHistoryCompact() {
      const { historyLoading, historyLoaded, historyError, historySearch = '', historyFilter = 'all', expandedHistoryId } = this.state;
      const isRefreshing = historyLoading && historyLoaded;

      if (historyLoading && !historyLoaded) return this.renderHistoryCompactLoading();

      // Items ya filtrados por el servidor; solo ordenar por fecha desc
      const items = [...(this.state.historyItems || [])].sort(
        (a, b) => new Date(b.asked_at_colombia || 0) - new Date(a.asked_at_colombia || 0)
      );

      const emptyHtml = `
        <div style="text-align:center;padding:40px 16px;display:flex;flex-direction:column;align-items:center;gap:12px;">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="rgba(0,217,255,0.2)" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          <p style="font-size:13px;color:rgba(255,255,255,0.35);font-family:system-ui,sans-serif;margin:0;line-height:1.5;">
            ${historySearch ? 'Sin resultados para esa búsqueda' : 'Aún no tienes conversaciones guardadas'}
          </p>
        </div>`;

      const itemsHtml = historyError
        ? `<p style="text-align:center;padding:32px 16px;color:rgba(255,255,255,0.4);font-family:system-ui,sans-serif;font-size:13px;margin:0;">${escapeHtml(historyError)}</p>`
        : items.length === 0 ? emptyHtml
        : items.map((item, idx) => {
            const id = item.request_id || String(idx);
            const isOpen = expandedHistoryId === id;
            const like = normalizeLikeValue(item.like);
            const date = this.formatHistoryDate(item.asked_at_colombia);
            const confColors = { alta: '#10b981', media: '#f59e0b', baja: '#f43f5e' };
            const confColor = confColors[item.confidence] || '';

            const likeHtml = like === '1'
              ? `<span style="display:inline-flex;align-items:center;gap:3px;color:#34d399;font-size:10px;font-family:system-ui,sans-serif;font-weight:500;"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/></svg>Útil</span>`
              : like === '0'
              ? `<span style="display:inline-flex;align-items:center;gap:3px;color:#fb7185;font-size:10px;font-family:system-ui,sans-serif;font-weight:500;"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/></svg>No útil</span>`
              : '';

            return `
              <div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;overflow:hidden;margin-bottom:6px;background:rgba(255,255,255,0.04);transition:border-color 0.2s,background 0.2s;"
                onmouseenter="this.style.borderColor='rgba(0,217,255,0.3)';this.style.background='rgba(255,255,255,0.07)';"
                onmouseleave="this.style.borderColor='rgba(255,255,255,0.08)';this.style.background='rgba(255,255,255,0.04)';">
                <button type="button" data-action="history-item-toggle" data-id="${escapeHtml(id)}"
                  style="width:100%;text-align:left;background:none;border:none;padding:10px 12px;cursor:pointer;">
                  <p style="margin:0 0 6px;font-family:system-ui,sans-serif;font-size:13px;color:rgba(255,255,255,0.9);line-height:1.4;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${escapeHtml(item.question || '')}</p>
                  <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:10px;color:rgba(255,255,255,0.35);font-family:system-ui,sans-serif;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(date)}</span>
                    ${likeHtml}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2.5" style="flex-shrink:0;transition:transform 0.2s;transform:rotate(${isOpen ? '180' : '0'}deg);"><polyline points="6 9 12 15 18 9"/></svg>
                  </div>
                </button>
                ${isOpen && item.answer ? (() => {
                  const cLike = normalizeLikeValue(item.like);
                  const cBusy = item.likeLoading;
                  const cSparklesSvg = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg>`;
                  const cBase      = 'display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;font-size:11px;font-family:\'Inter\',sans-serif;font-weight:500;cursor:pointer;border:1px solid;transition:all 0.15s;';
                  const cLikeOn    = 'background:rgba(16,185,129,0.2);border-color:rgba(16,185,129,0.5);color:rgb(52,211,153);';
                  const cLikeOff   = 'background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.12);color:rgba(255,255,255,0.55);';
                  const cDislikeOn = 'background:rgba(244,63,94,0.2);border-color:rgba(244,63,94,0.5);color:rgb(251,113,133);';
                  const cDislikeOff= 'background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.12);color:rgba(255,255,255,0.55);';
                  const cConfHtml = this.renderConfidenceBadgeCompact(item.confidence);
                  const cCitations = (item.citations || []).map ? mapCitationsFromApi(item.citations || []) : [];
                  return `
                  <div style="padding:10px 12px;border-top:1px solid rgba(255,255,255,0.07);background:rgba(0,0,0,0.12);">
                    <p style="margin:0 0 10px;font-family:system-ui,sans-serif;font-size:12px;color:rgba(255,255,255,0.65);line-height:1.6;">${escapeHtml(item.answer)}</p>
                    ${cCitations.length > 0 ? `
                      <div style="margin-bottom:10px;">
                        <button type="button"
                          onclick="(function(btn){var body=btn.nextElementSibling;var chev=btn.querySelector('.mt-cit-chev');if(!body||!chev)return;var open=body.style.display!=='none';body.style.display=open?'none':'block';chev.style.transform=open?'rotate(0deg)':'rotate(180deg)';})(this)"
                          style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:7px 10px;background:linear-gradient(to right,rgba(6,182,212,0.1),rgba(168,85,247,0.1));border:1px solid rgba(6,182,212,0.2);border-radius:8px;cursor:pointer;transition:background 0.2s;"
                          onmouseenter="this.style.background='linear-gradient(to right,rgba(6,182,212,0.18),rgba(168,85,247,0.18))';"
                          onmouseleave="this.style.background='linear-gradient(to right,rgba(6,182,212,0.1),rgba(168,85,247,0.1))';">
                          <div style="display:flex;align-items:center;gap:6px;">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(34,211,238,0.8)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                            <span style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.8);font-family:system-ui,sans-serif;">Evidencia Documental</span>
                            <span style="background:rgba(6,182,212,0.2);border:1px solid rgba(6,182,212,0.4);color:#22d3ee;font-size:10px;font-weight:700;padding:0 5px;border-radius:999px;line-height:1.6;">${cCitations.length}</span>
                          </div>
                          <svg class="mt-cit-chev" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="2" style="transform:rotate(0deg);transition:transform 0.2s;flex-shrink:0;"><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                        <div class="mt-cit-body" style="display:none;padding-top:6px;">
                          <div style="display:grid;gap:6px;">
                            ${cCitations.map((c, ci) => this.renderCitationCard(c, ci)).join('')}
                          </div>
                        </div>
                      </div>
                    ` : ''}
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06);">
                      <div style="position:relative;">
                        ${cLike === '1' ? `<div style="position:absolute;inset:-2px;background:linear-gradient(to right,rgba(16,185,129,0.25),rgba(0,217,255,0.25));border-radius:8px;filter:blur(6px);pointer-events:none;"></div>` : ''}
                        <button ${cBusy ? 'disabled' : ''}
                          style="${cBase}${cLike === '1' ? cLikeOn : cLikeOff}${cBusy ? 'opacity:0.5;pointer-events:none;' : ''}position:relative;transition:all 0.15s,transform 0.1s;"
                          onmouseenter="if(this.dataset.active!=='1'){this.style.borderColor='rgba(16,185,129,0.5)';this.style.color='rgb(52,211,153)';this.style.background='rgba(16,185,129,0.1)';this.style.transform='scale(1.05)';}"
                          onmouseleave="if(this.dataset.active!=='1'){this.style.borderColor='rgba(255,255,255,0.12)';this.style.color='rgba(255,255,255,0.55)';this.style.background='rgba(255,255,255,0.05)';} this.style.transform='scale(1)';"
                          onmousedown="this.style.transform='scale(0.93)';" onmouseup="this.style.transform='scale(1)';"
                          data-active="${cLike === '1' ? '1' : ''}"
                          data-hist-like-value="1" data-hist-item-id="${escapeHtml(id)}" aria-label="Útil">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
                          Útil
                        </button>
                        ${cLike === '1' ? `<div style="position:absolute;top:-5px;right:-5px;color:rgb(52,211,153);animation:mt-sparkles-pop 0.35s cubic-bezier(0.34,1.56,0.64,1) both;">${cSparklesSvg}</div>` : ''}
                      </div>
                      <div style="position:relative;">
                        ${cLike === '0' ? `<div style="position:absolute;inset:-2px;background:linear-gradient(to right,rgba(244,63,94,0.25),rgba(236,72,153,0.25));border-radius:8px;filter:blur(6px);pointer-events:none;"></div>` : ''}
                        <button ${cBusy ? 'disabled' : ''}
                          style="${cBase}${cLike === '0' ? cDislikeOn : cDislikeOff}${cBusy ? 'opacity:0.5;pointer-events:none;' : ''}position:relative;transition:all 0.15s,transform 0.1s;"
                          onmouseenter="if(this.dataset.active!=='1'){this.style.borderColor='rgba(244,63,94,0.5)';this.style.color='rgb(251,113,133)';this.style.background='rgba(244,63,94,0.1)';this.style.transform='scale(1.05)';}"
                          onmouseleave="if(this.dataset.active!=='1'){this.style.borderColor='rgba(255,255,255,0.12)';this.style.color='rgba(255,255,255,0.55)';this.style.background='rgba(255,255,255,0.05)';} this.style.transform='scale(1)';"
                          onmousedown="this.style.transform='scale(0.93)';" onmouseup="this.style.transform='scale(1)';"
                          data-active="${cLike === '0' ? '1' : ''}"
                          data-hist-like-value="0" data-hist-item-id="${escapeHtml(id)}" aria-label="No útil">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>
                          No útil
                        </button>
                      </div>
                      ${cLike != null ? `<span style="font-size:11px;color:rgba(255,255,255,0.4);font-family:'Inter',sans-serif;animation:mt-fade-in 0.3s ease;">Gracias por tu feedback</span>` : ''}
                    </div>
                  </div>`;
                })() : ''}
              </div>`;
          }).join('');

      const filterDefs = [
        { value: 'all',      label: 'Todas',           icon: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>` },
        { value: 'liked',    label: 'Útiles',          icon: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>` },
        { value: 'disliked', label: 'No útiles',       icon: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>` },
        { value: 'alta',     label: 'Alta conf.',      icon: '' },
        { value: 'media',    label: 'Conf. media',     icon: '' },
        { value: 'baja',     label: 'Baja conf.',      icon: '' },
      ];
      const filterChipsHtml = filterDefs.map(f => {
        const active = (historyFilter || 'all') === f.value;
        const activeStyle = `border:1px solid rgba(6,182,212,0.5);background:linear-gradient(to right,rgba(6,182,212,0.25),rgba(168,85,247,0.25));color:#fff;`;
        const inactiveStyle = `border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.55);`;
        return `<button type="button" data-action="history-filter" data-filter="${f.value}" data-active="${active ? '1' : '0'}"
          style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:20px;font-size:11px;font-family:system-ui,sans-serif;cursor:pointer;white-space:nowrap;flex-shrink:0;transition:all 0.2s;${active ? activeStyle : inactiveStyle}"
          ontouchstart="" 
          onmouseenter="if(this.dataset.active!=='1'){this.style.background='rgba(255,255,255,0.1)';this.style.borderColor='rgba(255,255,255,0.25)';this.style.color='rgba(255,255,255,0.85)';}"
          onmouseleave="if(this.dataset.active!=='1'){this.style.background='rgba(255,255,255,0.05)';this.style.borderColor='rgba(255,255,255,0.1)';this.style.color='rgba(255,255,255,0.55)';}"
        >${f.icon}${f.label}</button>`;
      }).join('');

      const bgTop = 'linear-gradient(135deg,#0c1029 0%,#151836 100%)';
      return `
        <div class="mt-body" style="overflow-y:auto !important;display:block !important;padding:0 !important;">
          <div style="position:sticky;top:0;z-index:5;background:${bgTop};padding:10px 12px 8px;border-bottom:1px solid rgba(255,255,255,0.07);">
            <!-- Buscador -->
            <div style="display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.07);border:1px solid ${isRefreshing ? 'rgba(0,217,255,0.4)' : 'rgba(255,255,255,0.12)'};border-radius:10px;padding:7px 11px;margin-bottom:8px;transition:border-color 0.2s;"
              onfocusin="this.style.borderColor='rgba(0,217,255,0.4)';"
              onfocusout="this.style.borderColor='rgba(255,255,255,0.12)';">
              <button type="button" data-action="history-search-submit"
                style="flex-shrink:0;background:none;border:none;padding:0;${isRefreshing ? 'cursor:default;' : 'cursor:pointer;'}line-height:0;color:${isRefreshing ? 'rgba(0,217,255,0.7)' : 'rgba(255,255,255,0.4)'};transition:color 0.15s;"
                onmouseenter="${isRefreshing ? '' : "this.style.color='rgba(0,217,255,0.8)';"}"
                onmouseleave="${isRefreshing ? '' : "this.style.color='rgba(255,255,255,0.4)';"}"
                aria-label="Buscar">
                ${isRefreshing
                  ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:mt-spin 0.8s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`
                  : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`
                }
              </button>
              <input data-action="history-search" type="search" placeholder="Buscar conversación..."
                value="${escapeHtml(historySearch)}"
                style="flex:1;background:transparent;border:none;outline:none;color:rgba(255,255,255,0.9);font-size:13px;font-family:system-ui,sans-serif;"
                autocomplete="off" inputmode="search" enterkeyhint="search" />
              ${historySearch ? `<button type="button" data-action="history-search-clear"
                style="background:none;border:none;color:rgba(255,255,255,0.4);cursor:pointer;padding:0;line-height:0;flex-shrink:0;"
                onmouseenter="this.style.color='rgba(255,255,255,0.8)';"
                onmouseleave="this.style.color='rgba(255,255,255,0.4)';">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>` : ''}
            </div>
            <!-- Filtros (wrap en múltiples filas) -->
            <div style="display:flex;align-items:flex-start;gap:6px;">
              <span style="flex-shrink:0;display:flex;align-items:center;height:24px;color:rgba(255,255,255,0.3);">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              </span>
              <div style="display:flex;flex-wrap:wrap;gap:5px;">
                ${filterChipsHtml}
              </div>
            </div>
          </div>
          <div style="padding:8px 10px;transition:opacity 0.2s;opacity:${isRefreshing ? '0.45' : '1'};pointer-events:${isRefreshing ? 'none' : 'auto'};">${itemsHtml}</div>
        </div>`;
    }

    renderHistoryFull() {
      const { historyLoading, historyLoaded, historyError, historySearch = '', historyFilter = 'all', expandedHistoryId } = this.state;
      const isRefreshing = historyLoading && historyLoaded;

      if (historyLoading && !historyLoaded) {
        return this.renderHistoryLoadingView();
      }

      // Items ya vienen filtrados desde el servidor; solo ordenar por fecha desc
      const items = [...(this.state.historyItems || [])].sort(
        (a, b) => new Date(b.asked_at_colombia || 0) - new Date(a.asked_at_colombia || 0)
      );

      const total = items.length;

      // Filter buttons
      const filterDefs = [
        { value: 'all', label: 'Todas', icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>` },
        { value: 'liked', label: 'Útiles', icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>` },
        { value: 'disliked', label: 'No útiles', icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>` },
        { value: 'alta', label: 'Alta confianza', icon: ''},
        { value: 'media', label: 'Confianza media', icon: ''},
        { value: 'baja', label: 'Baja confianza', icon:''}
      ];
      const filterHtml = filterDefs.map(f => {
        const active = (historyFilter || 'all') === f.value;
        const baseStyle = `display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:8px;font-size:13px;cursor:pointer;font-family:system-ui,sans-serif;transition:all 0.2s;`;
        const activeStyle = `border:1px solid rgba(6,182,212,0.5);background:linear-gradient(to right,rgba(6,182,212,0.2),rgba(168,85,247,0.2));color:#fff;`;
        const inactiveStyle = `border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.6);`;
        return `<button type="button" data-action="history-filter" data-filter="${f.value}" data-active="${active ? '1' : '0'}"
          style="${baseStyle}${active ? activeStyle : inactiveStyle}"
          onmouseenter="if(this.dataset.active!=='1'){this.style.background='rgba(255,255,255,0.1)';this.style.borderColor='rgba(255,255,255,0.2)';this.style.color='rgba(255,255,255,0.9)';}this.style.transform='scale(1.02)';"
          onmouseleave="if(this.dataset.active!=='1'){this.style.background='rgba(255,255,255,0.05)';this.style.borderColor='rgba(255,255,255,0.1)';this.style.color='rgba(255,255,255,0.6)';}this.style.transform='scale(1)';"
        >${f.icon}${f.label}</button>`;
      }).join('');

      // Items HTML
      let itemsHtml;
      if (historyError) {
        itemsHtml = `<div style="text-align:center;padding:48px 0;color:rgba(255,255,255,0.5);font-family:system-ui,sans-serif;">${escapeHtml(historyError)}</div>`;
      } else if (items.length === 0) {
        itemsHtml = `
          <div style="text-align:center;padding:64px 0;display:flex;flex-direction:column;align-items:center;gap:16px;">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            <div>
              <p style="font-size:18px;font-weight:600;color:rgba(255,255,255,0.6);font-family:system-ui,sans-serif;margin:0 0 8px;">No se encontraron resultados</p>
              <p style="font-size:13px;color:rgba(255,255,255,0.35);font-family:system-ui,sans-serif;margin:0;">${historySearch || (historyFilter && historyFilter !== 'all') ? 'Intenta cambiar los filtros o la búsqueda' : 'Aún no has realizado ninguna consulta'}</p>
            </div>
          </div>`;
      } else {
        itemsHtml = items.map((item, index) => {
          const isExp = expandedHistoryId === (item.request_id || String(index));
          const like = normalizeLikeValue(item.like);
          const dateStr = this.formatHistoryDate(item.asked_at_colombia);
          const rawCitations = item.citations || [];
          const mappedCitations = mapCitationsFromApi(rawCitations);

          const likeHtml = like === '1'
            ? `<div style="display:flex;align-items:center;gap:5px;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgb(52,211,153)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
                <span style="font-size:12px;color:rgb(52,211,153);font-family:system-ui,sans-serif;">Útil</span>
              </div>`
            : like === '0'
            ? `<div style="display:flex;align-items:center;gap:5px;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgb(251,113,133)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>
                <span style="font-size:12px;color:rgb(251,113,133);font-family:system-ui,sans-serif;">No útil</span>
              </div>`
            : '';

          const confidenceHtml = this.renderConfidenceBadge(item.confidence);

          const itemId = escapeHtml(item.request_id || String(index));

          return `
            <div style="position:relative;" class="mt-hist-item-wrap">
              <div style="position:absolute;inset:-2px;background:linear-gradient(to right,rgba(6,182,212,0.12),rgba(168,85,247,0.12));border-radius:14px;filter:blur(5px);opacity:0;transition:opacity 0.3s ease;pointer-events:none;" class="mt-hist-glow"></div>
              <div style="position:relative;background:linear-gradient(135deg,rgba(255,255,255,0.05) 0%,rgba(255,255,255,0.09) 100%);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.1);border-radius:12px;overflow:hidden;transition:border-color 0.2s ease;"
                onmouseenter="var g=this.previousElementSibling;if(g)g.style.opacity='1';this.style.borderColor='rgba(6,182,212,0.2)';"
                onmouseleave="var g=this.previousElementSibling;if(g)g.style.opacity='0';this.style.borderColor='rgba(255,255,255,0.1)';"
              >
                <button type="button" data-action="history-item-toggle" data-id="${itemId}"
                  style="width:100%;padding:20px 24px;text-align:left;background:transparent;border:none;cursor:pointer;display:block;transition:background 0.15s;"
                  onmouseenter="this.style.background='rgba(255,255,255,0.03)';"
                  onmouseleave="this.style.background='transparent';"
                >
                  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;">
                    <div style="flex:1;min-width:0;">
                      <h3 style="font-size:15px;font-weight:600;color:rgba(255,255,255,0.9);margin:0 0 10px;font-family:system-ui,sans-serif;line-height:1.4;">${escapeHtml(item.question || '')}</h3>
                      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;${!isExp ? 'margin-bottom:12px;' : ''}">
                        <div style="display:flex;align-items:center;gap:6px;color:rgba(255,255,255,0.45);">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                          <span style="font-size:12px;font-family:system-ui,sans-serif;">${escapeHtml(dateStr)}</span>
                        </div>
                        ${likeHtml}
                        ${!isExp ? confidenceHtml : ''}
                      </div>
                      ${!isExp && item.answer ? `<p style="font-size:13px;color:rgba(255,255,255,0.55);margin:0;font-family:system-ui,sans-serif;line-height:1.55;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(item.answer)}</p>` : ''}
                    </div>
                    <div style="flex-shrink:0;transform:rotate(${isExp ? '180deg' : '0deg'});transition:transform 0.2s;color:rgba(255,255,255,0.35);margin-top:2px;">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                    </div>
                  </div>
                </button>
                ${isExp ? (() => {
                  const hLike = normalizeLikeValue(item.like);
                  const hBusy = item.likeLoading;
                  const hSparklesSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg>`;
                  const hBase    = 'display:flex;align-items:center;gap:8px;padding:8px 16px;border-radius:8px;font-size:14px;font-family:\'Inter\',sans-serif;font-weight:500;cursor:pointer;transition:border-color 0.15s,color 0.15s,background 0.15s;';
                  const hLikeOn  = 'background:rgba(16,185,129,0.2);border:1px solid rgba(16,185,129,0.5);color:rgb(52,211,153);box-shadow:0 0 12px rgba(16,185,129,0.2);';
                  const hLikeOff = 'background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.6);';
                  const hDislOn  = 'background:rgba(244,63,94,0.2);border:1px solid rgba(244,63,94,0.5);color:rgb(251,113,133);box-shadow:0 0 12px rgba(244,63,94,0.2);';
                  const hDislOff = 'background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.6);';
                  const hConfHtml = this.renderConfidenceBadge(item.confidence);
                  return `
                  <div style="border-top:1px solid rgba(255,255,255,0.08);padding:20px 24px;">
                    <div style="margin-bottom:16px;">
                      <h4 style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em;font-family:system-ui,sans-serif;margin:0 0 12px;">Respuesta Completa</h4>
                      <p style="font-size:14px;color:rgba(255,255,255,0.8);line-height:1.7;margin:0;font-family:system-ui,sans-serif;white-space:pre-wrap;">${escapeHtml(item.answer || '')}</p>
                    </div>
                    <div style="padding-top:14px; margin-bottom: 20px; border-top:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                      <span style="font-size:14px;color:rgba(255,255,255,0.5);font-family:system-ui,sans-serif;">¿Te fue útil?</span>
                      <div style="display:flex;align-items:center;gap:8px;">
                        <div style="position:relative;">
                          ${hLike === '1' ? `<div style="position:absolute;inset:-2px;background:linear-gradient(to right,rgba(16,185,129,0.3),rgba(0,217,255,0.3));border-radius:10px;filter:blur(8px);pointer-events:none;"></div>` : ''}
                          <button ${hBusy ? 'disabled' : ''}
                            style="${hBase}${hLike === '1' ? hLikeOn : hLikeOff}position:relative;transition:all 0.15s,transform 0.1s;${hBusy ? 'opacity:0.5;pointer-events:none;' : ''}"
                            onmouseenter="if(this.dataset.active!=='1'){this.style.borderColor='rgba(16,185,129,0.5)';this.style.color='rgb(52,211,153)';this.style.background='rgba(16,185,129,0.1)';this.style.transform='scale(1.05)';}"
                            onmouseleave="if(this.dataset.active!=='1'){this.style.borderColor='rgba(255,255,255,0.12)';this.style.color='rgba(255,255,255,0.6)';this.style.background='rgba(255,255,255,0.05)';} this.style.transform='scale(1)';"
                            onmousedown="this.style.transform='scale(0.95)';" onmouseup="this.style.transform='scale(1)';"
                            data-active="${hLike === '1' ? '1' : ''}"
                            data-hist-like-value="1" data-hist-item-id="${itemId}" aria-label="Útil">
                            <span style="display:flex;width:16px;height:16px;flex-shrink:0;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg></span>
                            <span>Útil</span>
                          </button>
                          ${hLike === '1' ? `<div style="position:absolute;top:-7px;right:-7px;color:rgb(52,211,153);animation:mt-sparkles-pop 0.35s cubic-bezier(0.34,1.56,0.64,1) both;">${hSparklesSvg}</div>` : ''}
                        </div>
                        <div style="position:relative;">
                          ${hLike === '0' ? `<div style="position:absolute;inset:-2px;background:linear-gradient(to right,rgba(244,63,94,0.3),rgba(236,72,153,0.3));border-radius:10px;filter:blur(8px);pointer-events:none;"></div>` : ''}
                          <button ${hBusy ? 'disabled' : ''}
                            style="${hBase}${hLike === '0' ? hDislOn : hDislOff}position:relative;transition:all 0.15s,transform 0.1s;${hBusy ? 'opacity:0.5;pointer-events:none;' : ''}"
                            onmouseenter="if(this.dataset.active!=='1'){this.style.borderColor='rgba(244,63,94,0.5)';this.style.color='rgb(251,113,133)';this.style.background='rgba(244,63,94,0.1)';this.style.transform='scale(1.05)';}"
                            onmouseleave="if(this.dataset.active!=='1'){this.style.borderColor='rgba(255,255,255,0.12)';this.style.color='rgba(255,255,255,0.6)';this.style.background='rgba(255,255,255,0.05)';} this.style.transform='scale(1)';"
                            onmousedown="this.style.transform='scale(0.95)';" onmouseup="this.style.transform='scale(1)';"
                            data-active="${hLike === '0' ? '1' : ''}"
                            data-hist-like-value="0" data-hist-item-id="${itemId}" aria-label="No útil">
                            <span style="display:flex;width:16px;height:16px;flex-shrink:0;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg></span>
                            <span>No útil</span>
                          </button>
                        </div>
                      </div>
                      ${hConfHtml}
                      ${hLike != null ? `<span style="font-size:12px;color:rgba(255,255,255,0.4);font-family:'Inter',sans-serif;animation:mt-fade-in 0.3s ease;">Gracias por tu feedback</span>` : ''}
                    </div>
                    ${mappedCitations.length > 0 ? `
                      <div style="margin-bottom:16px;">
                        <button type="button"
                          onclick="(function(btn){var body=btn.nextElementSibling;var chev=btn.querySelector('.mt-cit-chev');if(!body||!chev)return;var open=body.style.display!=='none';body.style.display=open?'none':'block';chev.style.transform=open?'rotate(0deg)':'rotate(180deg)';})(this)"
                          style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:linear-gradient(to right,rgba(6,182,212,0.12),rgba(168,85,247,0.12));border:1px solid rgba(6,182,212,0.22);border-radius:10px;cursor:pointer;transition:background 0.2s,border-color 0.2s;"
                          onmouseenter="this.style.background='linear-gradient(to right,rgba(6,182,212,0.2),rgba(168,85,247,0.2))';this.style.borderColor='rgba(6,182,212,0.4)';"
                          onmouseleave="this.style.background='linear-gradient(to right,rgba(6,182,212,0.12),rgba(168,85,247,0.12))';this.style.borderColor='rgba(6,182,212,0.22)';">
                          <div style="display:flex;align-items:center;gap:8px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(34,211,238,0.8)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                            <span style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.85);font-family:system-ui,sans-serif;">Evidencia Documental</span>
                            <span style="background:rgba(6,182,212,0.2);border:1px solid rgba(6,182,212,0.4);color:#22d3ee;font-size:11px;font-weight:700;font-family:system-ui,sans-serif;padding:1px 7px;border-radius:999px;line-height:1.6;">${mappedCitations.length}</span>
                          </div>
                          <svg class="mt-cit-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="2" style="transform:rotate(0deg);transition:transform 0.2s;flex-shrink:0;"><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                        <div class="mt-cit-body" style="display:none;padding-top:10px;">
                          <div style="display:grid;gap:10px;">
                            ${mappedCitations.map((c, ci) => this.renderCitationCard(c, ci)).join('')}
                          </div>
                        </div>
                      </div>
                    ` : ''}
                    
                  </div>`;
                })() : ''}
              </div>
            </div>`;
        }).join('');
      }

      return `
        <div style="display:flex;flex-direction:column;height:100%;overflow:hidden;">
          <!-- Filters / search toolbar -->
          <div style="padding:20px 32px 16px;flex-shrink:0;border-bottom:1px solid rgba(255,255,255,0.08);">
            <!-- Header title -->
            <div style="margin-bottom:16px;">
              <h1 style="font-size:24px;font-weight:700;background:linear-gradient(to right,#22d3ee,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin:0;font-family:system-ui,sans-serif;line-height:1.2;">Historial de Consultas</h1>
              <p style="font-size:13px;color:rgba(255,255,255,0.45);margin:4px 0 0;font-family:system-ui,sans-serif;">Todas tus preguntas y respuestas organizadas en un solo lugar</p>
            </div>

            <!-- Search bar -->
            <div style="position:relative;margin-bottom:14px;">
              <div style="position:absolute;inset:-1px;background:linear-gradient(to right,rgba(6,182,212,0.2),rgba(168,85,247,0.2));border-radius:13px;filter:blur(4px);opacity:0.5;pointer-events:none;"></div>
              <div style="position:relative;background:rgba(255,255,255,0.05);backdrop-filter:blur(12px);border:1px solid ${isRefreshing ? 'rgba(0,217,255,0.4)' : 'rgba(255,255,255,0.1)'};border-radius:12px;padding:11px 16px;display:flex;align-items:center;gap:10px;transition:border-color 0.2s;">
                <button type="button" data-action="history-search-submit"
                  style="flex-shrink:0;background:none;border:none;padding:0;${isRefreshing ? 'cursor:default;' : 'cursor:pointer;'}line-height:0;color:${isRefreshing ? 'rgba(0,217,255,0.7)' : 'rgba(255,255,255,0.35)'};transition:color 0.15s;"
                  onmouseenter="${isRefreshing ? '' : "this.style.color='rgba(0,217,255,0.8)';"}"
                  onmouseleave="${isRefreshing ? '' : "this.style.color='rgba(255,255,255,0.35)';"}"
                  aria-label="Buscar">
                  ${isRefreshing
                    ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:mt-spin 0.8s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`
                    : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`
                  }
                </button>
                <input type="search" data-action="history-search"
                  placeholder="Buscar en el historial..."
                  value="${escapeHtml(historySearch || '')}"
                  style="flex:1;background:transparent;border:none;outline:none;color:rgba(255,255,255,0.9);font-size:14px;font-family:system-ui,sans-serif;"
                  inputmode="search" enterkeyhint="search"
                />
                ${historySearch ? `<button type="button" data-action="history-search-clear" style="color:rgba(255,255,255,0.4);background:none;border:none;cursor:pointer;font-size:12px;font-family:system-ui,sans-serif;padding:2px 6px;"
                  onmouseenter="this.style.color='rgba(255,255,255,0.7)';"
                  onmouseleave="this.style.color='rgba(255,255,255,0.4)';"
                >Limpiar</button>` : ''}
              </div>
            </div>

            <!-- Filter buttons -->
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <div style="display:flex;align-items:center;gap:5px;color:rgba(255,255,255,0.35);font-size:12px;font-family:system-ui,sans-serif;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                <span>Filtros:</span>
              </div>
              ${filterHtml}
            </div>

            <!-- Results count -->
            <div style="margin-top:10px;font-size:12px;color:rgba(255,255,255,0.35);font-family:system-ui,sans-serif;">
              ${total} ${total === 1 ? 'resultado' : 'resultados'}
            </div>
          </div>

          <!-- Items list -->
          <div style="flex:1;overflow-y:auto;padding:20px 32px;" class="mt-history-scroll">
            <div style="display:flex;flex-direction:column;gap:12px;transition:opacity 0.2s;opacity:${isRefreshing ? '0.45' : '1'};pointer-events:${isRefreshing ? 'none' : 'auto'};">
              ${itemsHtml}
            </div>
          </div>
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
          const dayLike = normalizeLikeValue(first?.like);
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
                ${
                  dayLike
                    ? `<span class="hist-row-like" aria-label="${
                        dayLike === "1" ? "Con me gusta" : "Con no me gusta"
                      }">${dayLike === "1" ? svgThumbUp() : svgThumbDown()}</span>`
                    : ""
                }
              </span>
            </li>`;
        })
        .join("")}</ul>`;
    }

    formatHistoryDate(iso) {
      if (!iso) return '';
      try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return iso;
        return new Intl.DateTimeFormat('es-CO', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
          timeZone: 'America/Bogota',
        }).format(d);
      } catch (e) { return iso; }
    }

    renderAvatarHTML(extraStyle = '', sizeClass = 'mt-av--medium') {
      return `
        <div class="mt-av ${sizeClass}" style="${sizeClass === 'mt-av--medium' ? 'flex-shrink:0;margin-top:8px;' : ''}${extraStyle}">
          <div class="mt-av-glow"></div>
          <div class="mt-av-sphere"><div class="mt-av-core"></div></div>
          <div class="mt-av-orbit-ring">
            <div class="mt-av-arm" style="--a:0deg"><div class="mt-av-p mt-av-p--cyan"></div></div>
            <div class="mt-av-arm" style="--a:45deg"><div class="mt-av-p mt-av-p--purple"></div></div>
            <div class="mt-av-arm" style="--a:90deg"><div class="mt-av-p mt-av-p--cyan"></div></div>
            <div class="mt-av-arm" style="--a:135deg"><div class="mt-av-p mt-av-p--purple"></div></div>
            <div class="mt-av-arm" style="--a:180deg"><div class="mt-av-p mt-av-p--cyan"></div></div>
            <div class="mt-av-arm" style="--a:225deg"><div class="mt-av-p mt-av-p--purple"></div></div>
            <div class="mt-av-arm" style="--a:270deg"><div class="mt-av-p mt-av-p--cyan"></div></div>
            <div class="mt-av-arm" style="--a:315deg"><div class="mt-av-p mt-av-p--purple"></div></div>
          </div>
        </div>`;
    }

    renderCitationCard(c, index, animate = false) {
      const filename = escapeHtml(citationSourceLabel(c.source));
      const page = c.page_number != null ? c.page_number : null;
      const location = c.location ? escapeHtml(c.location).split(',')[0].trim() : null;
      const hasSubtitle = location || c.snippet;
      const cardId = `mt-cc-${Date.now()}-${index}`;

      return `
        <div id="${cardId}"
          style="background:linear-gradient(135deg,rgba(255,255,255,0.07) 0%,rgba(255,255,255,0.12) 100%);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:16px;${animate ? `animation:mt-fade-in 0.35s ease ${index * 0.1}s both;` : ''}transition:border-color 0.2s ease,box-shadow 0.2s ease;overflow:hidden;min-width:0;"
          onmouseenter="this.style.borderColor='rgba(0,217,255,0.4)';this.style.boxShadow='0 0 0 1px rgba(0,217,255,0.1),0 0 20px rgba(0,217,255,0.1)';"
          onmouseleave="this.style.borderColor='rgba(255,255,255,0.12)';this.style.boxShadow='none';"
        >
          <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:${hasSubtitle ? '12px' : '0'};">
            <div style="flex-shrink:0;width:40px;height:40px;background:linear-gradient(to bottom right,rgba(0,217,255,0.2),rgba(168,85,247,0.2));border-radius:8px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(0,217,255,0.3);color:#00d9ff;">
              ${svgFileCitationIcon()}
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.9);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:system-ui,sans-serif;">${filename}</div>
              ${location ? `
                <div style="display:flex;align-items:center;gap:5px;margin-top:4px;">
                  <span style="color:#a855f7;display:flex;align-items:center;">${svgMapPinIcon()}</span>
                  <span style="font-size:11px;color:rgba(255,255,255,0.6);font-family:system-ui,sans-serif;">${location}</span>
                </div>
              ` : ''}
            </div>
            ${page != null ? `<div style="flex-shrink:0;padding:4px 8px;background:rgba(0,217,255,0.1);border:1px solid rgba(0,217,255,0.3);border-radius:4px;font-size:11px;color:#00d9ff;font-weight:500;font-family:system-ui,sans-serif;white-space:nowrap;">P. ${page}</div>` : ''}
          </div>
          ${c.snippet ? `
            <div class="mt-cc-snippet-wrap" style="padding-left:12px;border-left:2px solid rgba(168,85,247,0.4);overflow:hidden;transition:all 0.25s ease;">
              <p class="mt-cc-snippet" style="font-size:13px;color:rgba(255,255,255,0.7);line-height:1.5;margin:0;font-family:system-ui,sans-serif;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;overflow-wrap:break-word;">"${escapeHtml(c.snippet)}"</p>
            </div>
            <button type="button" class="mt-cc-more"
              style="display:none;width:100%;text-align:right;font-size:12px;font-family:system-ui,sans-serif;color:rgba(0,217,255,0.8);margin-top:8px;background:none;border:none;cursor:pointer;padding:0;"
              onclick="
                var card = this.parentElement;
                var wrap = card.querySelector('.mt-cc-snippet-wrap');
                var p = card.querySelector('.mt-cc-snippet');
                if (!p || !wrap) return;
                var scrollEl = null;
                var el = card;
                while (el) { if (el.scrollHeight > el.clientHeight + 1) { scrollEl = el; break; } el = el.parentElement; }
                var savedScroll = scrollEl ? scrollEl.scrollTop : 0;
                var isExp = card.dataset.ccExpanded === '1';
                if (isExp) {
                  p.style.display = '-webkit-box';
                  p.style.webkitLineClamp = '3';
                  p.style.webkitBoxOrient = 'vertical';
                  p.style.overflow = 'hidden';
                  wrap.style.overflow = 'hidden';
                  this.textContent = 'Ver más →';
                  card.dataset.ccExpanded = '';
                } else {
                  p.style.display = 'block';
                  p.style.webkitLineClamp = 'unset';
                  p.style.overflow = 'visible';
                  wrap.style.overflow = 'visible';
                  this.textContent = 'Ver menos ←';
                  card.dataset.ccExpanded = '1';
                }
                if (scrollEl) requestAnimationFrame(function(){ scrollEl.scrollTop = savedScroll; });
              "
              onmouseenter="this.style.color='rgba(0,217,255,1)';"
              onmouseleave="this.style.color='rgba(0,217,255,0.8)';"
            >Ver más →</button>
          ` : ''}
        </div>
      `;
    }

    renderDarkUserMessage(m, latest) {
      const time = formatTimeColombia(m.t ? new Date(m.t).toISOString() : undefined);
      return `
        <div style="display:flex;justify-content:flex-end;align-items:flex-end;gap:12px;margin-bottom:24px;${latest ? 'animation:mt-fade-in 0.35s ease;' : ''}">
          <div style="max-width:512px;">
            <div class="mt-user-bubble" style="position:relative;background:linear-gradient(to bottom right,rgba(0,217,255,0.2),rgba(168,85,247,0.2));border:1px solid rgba(0,217,255,0.3);border-radius:16px;padding:16px 24px;">
              <p class="mt-bot-answer-text" style="color:rgba(255,255,255,0.9);line-height:1.6;margin:0;font-family:system-ui,sans-serif;font-size:15px;">${escapeHtml(m.text)}</p>
            </div>
            ${time ? `<div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:6px;text-align:right;font-family:system-ui,sans-serif;">${escapeHtml(time)}</div>` : ''}
          </div>
          <div style="flex-shrink:0;width:40px;height:40px;background:linear-gradient(to bottom right,rgba(0,217,255,0.3),rgba(168,85,247,0.3));border-radius:50%;display:flex;align-items:center;justify-content:center;border:1px solid rgba(0,217,255,0.4);color:rgba(0,217,255,0.9);">
            ${svgUserIcon()}
          </div>
        </div>
      `;
    }

    renderConfidenceBadgeCompact(confidence, animate = false) {
      if (!confidence) return '';
      const cfg = {
        alta:  { label: 'Alta conf.',  color: 'linear-gradient(to right,#10b981,#06b6d4)', glow: 'rgba(16,185,129,0.5)',  width: '100%' },
        media: { label: 'Conf. media', color: 'linear-gradient(to right,#f59e0b,#f97316)', glow: 'rgba(245,158,11,0.5)',  width: '50%'  },
        baja:  { label: 'Conf. baja',  color: 'linear-gradient(to right,#f43f5e,#ec4899)', glow: 'rgba(244,63,94,0.5)',   width: '25%'  },
      };
      const c = cfg[confidence];
      if (!c) return '';
      return `
        <div style="display:flex;align-items:center;gap:5px;">
          <div style="position:relative;width:48px;height:4px;background:rgba(255,255,255,0.1);border-radius:9999px;overflow:hidden;flex-shrink:0;">
            <div style="position:absolute;top:0;bottom:0;left:0;width:${c.width};background:${c.color};border-radius:9999px;box-shadow:0 0 6px ${c.glow};transform-origin:left center;${animate ? 'animation:mt-conf-fill 0.8s ease-out both;' : ''}"></div>
          </div>
          <span style="font-size:10px;color:rgba(255,255,255,0.6);font-family:system-ui,sans-serif;font-weight:500;white-space:nowrap;">${c.label}</span>
        </div>`;
    }

    renderConfidenceBadge(confidence, animate = false) {
      if (!confidence) return '';
      const cfg = {
        alta:  { label: 'Alta Confianza',  color: 'linear-gradient(to right,#10b981,#06b6d4)', glow: 'rgba(16,185,129,0.5)',  width: '100%' },
        media: { label: 'Confianza Media', color: 'linear-gradient(to right,#f59e0b,#f97316)', glow: 'rgba(245,158,11,0.5)',  width: '50%'  },
        baja:  { label: 'Confianza Baja',  color: 'linear-gradient(to right,#f43f5e,#ec4899)', glow: 'rgba(244,63,94,0.5)',   width: '25%'  },
      };
      const c = cfg[confidence];
      if (!c) return '';
      return `
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="position:relative;width:96px;height:6px;background:rgba(255,255,255,0.1);border-radius:9999px;overflow:hidden;">
            <div style="position:absolute;top:0;bottom:0;left:0;width:${c.width};background:${c.color};border-radius:9999px;box-shadow:0 0 10px ${c.glow};transform-origin:left center;${animate ? 'animation:mt-conf-fill 0.8s ease-out both;' : ''}"></div>
          </div>
          <span style="font-size:11px;color:rgba(255,255,255,0.7);font-family:system-ui,sans-serif;font-weight:500;">${c.label}</span>
        </div>`;
    }

    renderDarkBotMessage(m, msgIndex, latest) {
      const citations = m.citations || [];
      const time = m.responseAt ? formatTimeColombia(m.responseAt) : '';
      const showFeedback = Boolean(m.requestId);
      const like = m.like;
      const busy = m.likeLoading ? 'true' : '';

      const confidenceHtml = this.renderConfidenceBadge(m.confidence, latest);

      const likeBase   = 'display:flex;align-items:center;gap:8px;padding:8px 16px;border-radius:8px;font-size:14px;font-family:\'Inter\',sans-serif;font-weight:500;cursor:pointer;transition:border-color 0.15s,color 0.15s,background 0.15s;';
      const likeOn     = 'background:rgba(16,185,129,0.2);border:1px solid rgba(16,185,129,0.5);color:rgb(52,211,153);box-shadow:0 0 12px rgba(16,185,129,0.2);';
      const likeOff    = 'background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.6);';
      const dislikeOn  = 'background:rgba(244,63,94,0.2);border:1px solid rgba(244,63,94,0.5);color:rgb(251,113,133);box-shadow:0 0 12px rgba(244,63,94,0.2);';
      const dislikeOff = 'background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.6);';

      const sparklesSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg>`;

      const feedbackHtml = showFeedback ? `
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.07);">
          <span style="font-size:14px;color:rgba(255,255,255,0.5);font-family:system-ui,sans-serif;">¿Te fue útil?</span>
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="position:relative;">
              ${like === '1' ? `<div style="position:absolute;inset:-2px;background:linear-gradient(to right,rgba(16,185,129,0.3),rgba(0,217,255,0.3));border-radius:10px;filter:blur(8px);pointer-events:none;"></div>` : ''}
              <button style="${likeBase}${like === '1' ? likeOn : likeOff}position:relative;transition:all 0.15s,transform 0.1s;"
                ${busy ? 'disabled' : ''}
                onmouseenter="if(this.dataset.active!=='1'){this.style.borderColor='rgba(16,185,129,0.5)';this.style.color='rgb(52,211,153)';this.style.background='rgba(16,185,129,0.1)';this.style.transform='scale(1.05)';}"
                onmouseleave="if(this.dataset.active!=='1'){this.style.borderColor='rgba(255,255,255,0.12)';this.style.color='rgba(255,255,255,0.6)';this.style.background='rgba(255,255,255,0.05)';} this.style.transform='scale(1)';"
                onmousedown="this.style.transform='scale(0.95)';" onmouseup="this.style.transform='scale(1)';"
                data-active="${like === '1' ? '1' : ''}" data-like-value="1" data-msg-index="${msgIndex}" aria-label="Útil">
                <span style="display:flex;width:16px;height:16px;flex-shrink:0;">${svgThumbUp()}</span> <span>Útil</span>
              </button>
              ${like === '1' ? `<div style="position:absolute;top:-7px;right:-7px;color:rgb(52,211,153);animation:mt-sparkles-pop 0.35s cubic-bezier(0.34,1.56,0.64,1) both;">${sparklesSvg}</div>` : ''}
            </div>
            <div style="position:relative;">
              ${like === '0' ? `<div style="position:absolute;inset:-2px;background:linear-gradient(to right,rgba(244,63,94,0.3),rgba(236,72,153,0.3));border-radius:10px;filter:blur(8px);pointer-events:none;"></div>` : ''}
              <button style="${likeBase}${like === '0' ? dislikeOn : dislikeOff}position:relative;transition:all 0.15s,transform 0.1s;"
                ${busy ? 'disabled' : ''}
                onmouseenter="if(this.dataset.active!=='1'){this.style.borderColor='rgba(244,63,94,0.5)';this.style.color='rgb(251,113,133)';this.style.background='rgba(244,63,94,0.1)';this.style.transform='scale(1.05)';}"
                onmouseleave="if(this.dataset.active!=='1'){this.style.borderColor='rgba(255,255,255,0.12)';this.style.color='rgba(255,255,255,0.6)';this.style.background='rgba(255,255,255,0.05)';} this.style.transform='scale(1)';"
                onmousedown="this.style.transform='scale(0.95)';" onmouseup="this.style.transform='scale(1)';"
                data-active="${like === '0' ? '1' : ''}" data-like-value="0" data-msg-index="${msgIndex}" aria-label="No útil">
                <span style="display:flex;width:16px;height:16px;flex-shrink:0;">${svgThumbDown()}</span> <span>No útil</span>
              </button>
            </div>
          </div>
          ${confidenceHtml}
          ${like != null ? `<span style="font-size:12px;color:rgba(255,255,255,0.4);font-family:'Inter',sans-serif;animation:mt-fade-in 0.3s ease;">Gracias por tu feedback</span>` : ''}
        </div>
      ` : (confidenceHtml ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.07);">${confidenceHtml}</div>` : '');

      const citationsHtml = citations.length > 0 ? `
        <div class="mt-citations-section" style="margin-top:16px;${latest ? 'animation:mt-fade-in 0.35s ease 0.2s both;' : ''}">
          <button type="button"
            onclick="(function(btn){var body=btn.nextElementSibling;var chev=btn.querySelector('.mt-cit-chev');if(!body||!chev)return;var open=body.style.display!=='none';body.style.display=open?'none':'block';chev.style.transform=open?'rotate(0deg)':'rotate(180deg)';})(this)"
            style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:linear-gradient(to right,rgba(6,182,212,0.12),rgba(168,85,247,0.12));border:1px solid rgba(6,182,212,0.22);border-radius:10px;cursor:pointer;transition:background 0.2s,border-color 0.2s;margin-bottom:0;"
            onmouseenter="this.style.background='linear-gradient(to right,rgba(6,182,212,0.2),rgba(168,85,247,0.2))';this.style.borderColor='rgba(6,182,212,0.4)';"
            onmouseleave="this.style.background='linear-gradient(to right,rgba(6,182,212,0.12),rgba(168,85,247,0.12))';this.style.borderColor='rgba(6,182,212,0.22)';">
            <div style="display:flex;align-items:center;gap:8px;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(34,211,238,0.8)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              <span style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.85);font-family:system-ui,sans-serif;">Evidencia Documental</span>
              <span style="background:rgba(6,182,212,0.2);border:1px solid rgba(6,182,212,0.4);color:#22d3ee;font-size:11px;font-weight:700;font-family:system-ui,sans-serif;padding:1px 7px;border-radius:599px;line-height:1.6;">${citations.length}</span>
            </div>
            <svg class="mt-cit-chev" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="2" style="transform:rotate(0deg);transition:transform 0.2s;flex-shrink:0;"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div class="mt-cit-body" style="display:none;padding-top:12px;">
            <div style="display:grid;gap:12px;min-width:0;overflow:hidden;">
              ${citations.map((c, i) => this.renderCitationCard(c, i, latest)).join('')}
            </div>
          </div>
        </div>
      ` : '';

      return `
        <div class="mt-dark-msg-row" style="display:flex;gap:16px;margin-bottom:32px;${latest ? 'animation:mt-fade-in 0.35s ease;' : ''}">
          ${this.renderAvatarHTML()}
          <div style="flex:1;max-width:896px;min-width:0;">
            <!-- Burbuja de respuesta -->
            <div style="position:relative;margin-bottom:0;"
              onmouseenter="this.children[0].style.opacity='1';"
              onmouseleave="this.children[0].style.opacity='0';"
            >
              <div style="position:absolute;inset:-2px;background:linear-gradient(to right,rgba(168,85,247,0.25),rgba(0,217,255,0.25));border-radius:18px;filter:blur(10px);opacity:0;transition:opacity 0.2s ease;pointer-events:none;z-index:0;"></div>
              <div class="mt-bot-bubble-card" style="position:relative;z-index:1;background:linear-gradient(135deg,rgba(255,255,255,0.08) 0%,rgba(255,255,255,0.13) 100%);border:1px solid rgba(255,255,255,0.18);border-radius:16px;padding:20px 24px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.1),0 4px 24px rgba(0,0,0,0.2);">
                <p class="mt-bot-answer-text" style="color:rgba(255,255,255,0.9);line-height:1.6;margin:0;font-family:system-ui,sans-serif;font-size:15px;white-space:pre-wrap;">${escapeHtml(m.text)}</p>
                <!-- Votación justo debajo de la respuesta -->
                ${feedbackHtml}
              </div>
            </div>
            <!-- Evidencia documental (acordeón) -->
            ${citationsHtml}
            <!-- Footer: solo hora -->
            ${time ? `
              <div class="mt-msg-footer" style="margin-top:8px;${latest ? 'animation:mt-fade-in 0.35s ease 0.4s both;' : ''}">
                <span style="font-size:12px;color:rgba(255,255,255,0.4);font-family:system-ui,sans-serif;">${escapeHtml(time)}</span>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }

    // ── Compact chat messages ──────────────────────────────────────────────────

    renderCompactCitationPill(c, index) {
      const filename = escapeHtml(citationSourceLabel(c.source));
      const location = c.location ? escapeHtml(c.location) : null;
      const page = c.page_number != null ? c.page_number : null;
      const snippet = c.snippet ? escapeHtml(c.snippet) : null;
      const pillId = `mt-cpill-${Date.now()}-${index}`;

      return `
        <div id="${pillId}"
          style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:8px 10px;transition:border-color 0.2s,background 0.2s;"
          onmouseenter="this.style.borderColor='rgba(0,217,255,0.3)';this.style.background='rgba(255,255,255,0.08)';"
          onmouseleave="this.style.borderColor='rgba(255,255,255,0.1)';this.style.background='rgba(255,255,255,0.05)';">
          <!-- Header row -->
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:26px;height:26px;flex-shrink:0;background:linear-gradient(135deg,rgba(0,217,255,0.15),rgba(168,85,247,0.15));border:1px solid rgba(0,217,255,0.3);border-radius:6px;display:flex;align-items:center;justify-content:center;color:#00d9ff;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            <div style="flex:1;min-width:0;">
              <p style="margin:0;font-size:12px;font-weight:600;color:rgba(255,255,255,0.85);font-family:system-ui,sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${filename}</p>
              ${location ? `<p style="margin:2px 0 0;font-size:10px;color:rgba(255,255,255,0.4);font-family:system-ui,sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${location}</p>` : ''}
            </div>
            ${page != null ? `<span style="font-size:10px;color:#00d9ff;background:rgba(0,217,255,0.12);border:1px solid rgba(0,217,255,0.25);border-radius:4px;padding:2px 6px;flex-shrink:0;font-family:system-ui,sans-serif;">p.${page}</span>` : ''}
            ${snippet ? `<button type="button"
              onclick="(function(btn){var pill=btn.closest('[id^=mt-cpill-]');var snip=pill.querySelector('.mt-cpill-snip');var open=pill.dataset.open==='1';if(open){snip.style.display='none';pill.dataset.open='0';btn.querySelector('svg').style.transform='rotate(0deg)';}else{snip.style.display='block';pill.dataset.open='1';btn.querySelector('svg').style.transform='rotate(180deg)';};})(this)"
              style="background:none;border:none;padding:2px;cursor:pointer;color:rgba(255,255,255,0.35);flex-shrink:0;line-height:0;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="transition:transform 0.2s;"><polyline points="6 9 12 15 18 9"/></svg>
            </button>` : ''}
          </div>
          <!-- Snippet (hidden by default) -->
          ${snippet ? `<p class="mt-cpill-snip" style="display:none;margin:8px 0 0;font-size:11px;color:rgba(255,255,255,0.55);font-family:system-ui,sans-serif;line-height:1.5;border-top:1px solid rgba(255,255,255,0.07);padding-top:8px;word-break:break-word;overflow-wrap:break-word;">${snippet}</p>` : ''}
        </div>`;
    }

    renderCompactBotMessage(m, msgIndex, latest) {
      const citations = m.citations || [];
      const like = m.like;
      const showFeedback = Boolean(m.requestId);
      const busy = m.likeLoading ? true : false;

      // Estilos base de los botones like/dislike
      const btnBase = 'display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;font-size:11px;font-family:\'Inter\',sans-serif;font-weight:500;cursor:pointer;border:1px solid;transition:all 0.15s;';
      const likeStyle    = like === '1' ? 'background:rgba(16,185,129,0.2);border-color:rgba(16,185,129,0.5);color:rgb(52,211,153);' : 'background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.12);color:rgba(255,255,255,0.55);';
      const dislikeStyle = like === '0' ? 'background:rgba(244,63,94,0.2);border-color:rgba(244,63,94,0.5);color:rgb(251,113,133);'  : 'background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.12);color:rgba(255,255,255,0.55);';

      const cSparklesSvg = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg>`;
      const feedbackHtml = showFeedback ? `
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px;">
          <!-- Útil compact -->
          <div style="position:relative;">
            ${like === '1' ? `<div style="position:absolute;inset:-2px;background:linear-gradient(to right,rgba(16,185,129,0.25),rgba(0,217,255,0.25));border-radius:8px;filter:blur(6px);pointer-events:none;"></div>` : ''}
            <button ${busy ? 'disabled' : ''}
              style="${btnBase}${likeStyle}${busy ? 'opacity:0.5;pointer-events:none;' : ''}position:relative;transition:all 0.15s,transform 0.1s;"
              onmouseenter="if(this.dataset.active!=='1'){this.style.borderColor='rgba(16,185,129,0.5)';this.style.color='rgb(52,211,153)';this.style.background='rgba(16,185,129,0.1)';this.style.transform='scale(1.05)';}"
              onmouseleave="if(this.dataset.active!=='1'){this.style.borderColor='rgba(255,255,255,0.12)';this.style.color='rgba(255,255,255,0.55)';this.style.background='rgba(255,255,255,0.05)';} this.style.transform='scale(1)';"
              onmousedown="this.style.transform='scale(0.93)';"
              onmouseup="this.style.transform='scale(1)';"
              data-active="${like === '1' ? '1' : ''}"
              data-like-value="1" data-msg-index="${msgIndex}" aria-label="Útil">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
              Útil
            </button>
            ${like === '1' ? `<div style="position:absolute;top:-5px;right:-5px;color:rgb(52,211,153);animation:mt-sparkles-pop 0.35s cubic-bezier(0.34,1.56,0.64,1) both;">${cSparklesSvg}</div>` : ''}
          </div>
          <!-- No útil compact -->
          <div style="position:relative;">
            ${like === '0' ? `<div style="position:absolute;inset:-2px;background:linear-gradient(to right,rgba(244,63,94,0.25),rgba(236,72,153,0.25));border-radius:8px;filter:blur(6px);pointer-events:none;"></div>` : ''}
            <button ${busy ? 'disabled' : ''}
              style="${btnBase}${dislikeStyle}${busy ? 'opacity:0.5;pointer-events:none;' : ''}position:relative;transition:all 0.15s,transform 0.1s;"
              onmouseenter="if(this.dataset.active!=='1'){this.style.borderColor='rgba(244,63,94,0.5)';this.style.color='rgb(251,113,133)';this.style.background='rgba(244,63,94,0.1)';this.style.transform='scale(1.05)';}"
              onmouseleave="if(this.dataset.active!=='1'){this.style.borderColor='rgba(255,255,255,0.12)';this.style.color='rgba(255,255,255,0.55)';this.style.background='rgba(255,255,255,0.05)';} this.style.transform='scale(1)';"
              onmousedown="this.style.transform='scale(0.93)';"
              onmouseup="this.style.transform='scale(1)';"
              data-active="${like === '0' ? '1' : ''}"
              data-like-value="0" data-msg-index="${msgIndex}" aria-label="No útil">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>
              No útil
            </button>
          </div>
          ${m.confidence ? this.renderConfidenceBadgeCompact(m.confidence, latest) : ''}
        </div>` : (m.confidence ? `<div style="margin-top:8px;">${this.renderConfidenceBadgeCompact(m.confidence, latest)}</div>` : '');

      return `
        <div style="display:flex;gap:10px;margin-bottom:18px;${latest ? 'animation:mt-fade-in 0.3s ease;' : ''}">
          <!-- Mini avatar — mismo que el launcher -->
          <div style="flex-shrink:0;margin-top:2px;">
            <div class="mt-launcher-av" style="width:28px;height:28px;">
              <div class="mt-launcher-av-sphere">
                <div class="mt-launcher-av-core" style="width:10px;height:10px;"></div>
              </div>
              <div class="mt-launcher-av-orbit" style="inset:-5px;">
                <div class="mt-launcher-av-dot" style="transform:rotate(45deg)"></div>
                <div class="mt-launcher-av-dot" style="transform:rotate(225deg)"></div>
              </div>
            </div>
          </div>
          <div style="flex:1;min-width:0;">
            <!-- Bubble con hover glow -->
            <div style="position:relative;margin-bottom:${citations.length > 0 ? '8px' : '0'};"
              onmouseenter="this.children[0].style.opacity='1';"
              onmouseleave="this.children[0].style.opacity='0';"
            >
              <div style="position:absolute;inset:-2px;background:linear-gradient(to right,rgba(168,85,247,0.25),rgba(0,217,255,0.25));border-radius:14px;filter:blur(8px);opacity:0;transition:opacity 0.2s ease;pointer-events:none;"></div>
              <div style="position:relative;background:linear-gradient(135deg,rgba(255,255,255,0.07) 0%,rgba(255,255,255,0.11) 100%);border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:12px 14px;">
                <p style="color:rgba(255,255,255,0.9);font-size:13px;line-height:1.55;margin:0;font-family:system-ui,sans-serif;white-space:pre-wrap;overflow-wrap:break-word;word-break:break-word;">${escapeHtml(m.text)}</p>
              </div>
            </div>
            <!-- Citations acordeón -->
            ${citations.length > 0 ? `
              <div style="margin-bottom:8px;">
                <button type="button"
                  onclick="(function(btn){var body=btn.nextElementSibling;var chev=btn.querySelector('.mt-cit-chev');if(!body||!chev)return;var open=body.style.display!=='none';body.style.display=open?'none':'block';chev.style.transform=open?'rotate(0deg)':'rotate(180deg)';})(this)"
                  style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:linear-gradient(to right,rgba(6,182,212,0.1),rgba(168,85,247,0.1));border:1px solid rgba(6,182,212,0.2);border-radius:8px;cursor:pointer;transition:background 0.2s;"
                  onmouseenter="this.style.background='linear-gradient(to right,rgba(6,182,212,0.18),rgba(168,85,247,0.18))';"
                  onmouseleave="this.style.background='linear-gradient(to right,rgba(6,182,212,0.1),rgba(168,85,247,0.1))';">
                  <div style="display:flex;align-items:center;gap:5px;">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(34,211,238,0.8)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                    <span style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.8);font-family:system-ui,sans-serif;">Evidencia Documental</span>
                    <span style="background:rgba(6,182,212,0.2);border:1px solid rgba(6,182,212,0.4);color:#22d3ee;font-size:10px;font-weight:700;padding:0 5px;border-radius:999px;line-height:1.6;">${citations.length}</span>
                  </div>
                  <svg class="mt-cit-chev" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="2" style="transform:rotate(0deg);transition:transform 0.2s;flex-shrink:0;"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="mt-cit-body" style="display:none;padding-top:6px;">
                  <div style="display:flex;flex-direction:column;gap:4px;">
                    ${citations.map((c, i) => this.renderCompactCitationPill(c, i)).join('')}
                  </div>
                </div>
              </div>
            ` : ''}
            <!-- Feedback + confianza -->
            ${feedbackHtml}
          </div>
        </div>`;
    }

    renderCompactUserMessage(m, latest) {
      return `
        <div style="display:flex;justify-content:flex-end;margin-bottom:14px;${latest ? 'animation:mt-fade-in 0.3s ease;' : ''}">
          <div style="max-width:82%;background:linear-gradient(135deg,rgba(0,217,255,0.18),rgba(168,85,247,0.18));border:1px solid rgba(0,217,255,0.28);border-radius:12px;padding:10px 13px;">
            <p style="color:rgba(255,255,255,0.9);font-size:13px;line-height:1.5;margin:0;font-family:system-ui,sans-serif;">${escapeHtml(m.text)}</p>
          </div>
        </div>`;
    }

    renderCompactMessages(animateNew = false) {
      const msgs = this.state.messages;
      const lastIdx = msgs.length - 1;
      return msgs.map((m, i) => {
        const isNew = animateNew && i === lastIdx;
        if (m.role === 'user') return this.renderCompactUserMessage(m, isNew);
        return this.renderCompactBotMessage(m, i, isNew);
      }).join('');
    }

    // ── Dark (expanded) messages ───────────────────────────────────────────────

    renderDarkMessages(animateNew = false) {
      const msgs = this.state.messages;
      const lastIdx = msgs.length - 1;
      return msgs.map((m, i) => {
        const isNew = animateNew && i === lastIdx;
        if (m.role === 'user') return this.renderDarkUserMessage(m, isNew);
        return this.renderDarkBotMessage(m, i, isNew);
      }).join('');
    }

    renderDarkLoadingState() {
      const phase = this.state.loadingPhase || "listening";
      const phaseLabels = {
        listening: "Procesando tu pregunta...",
        thinking: "Consultando documentos...",
        responding: "Generando respuesta...",
        "showing-evidence": "Buscando evidencias...",
      };
      const text = phaseLabels[phase] || "Cargando...";
      const showScan = phase === "thinking" || phase === "responding";

      const scanHtml = showScan
        ? `<div style="position:absolute;top:0;left:-60%;width:60%;height:2px;background:linear-gradient(90deg,transparent,rgba(0,217,255,0.6),transparent);animation:mt-loading-scan-anim 2s linear infinite;pointer-events:none;"></div>`
        : "";

      return `
        <div style="display:flex;flex-direction:row;gap:16px;margin-bottom:32px;align-items:flex-start;width:100%;animation:mt-fade-in 0.35s ease;">
          ${this.renderAvatarHTML()}
          <div style="flex:1;min-width:0;max-width:896px;position:relative;">
            <div style="position:absolute;inset:-3px;background:linear-gradient(to right,rgba(168,85,247,0.35),rgba(0,217,255,0.35));border-radius:20px;filter:blur(10px);pointer-events:none;"></div>
            <div style="position:relative;background:linear-gradient(to right,rgba(65,12,120,0.6),rgba(4,88,112,0.6));border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:20px 24px;overflow:hidden;">
              ${scanHtml}
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
                <span style="font-size:14px;color:rgba(255,255,255,0.7);font-family:system-ui,sans-serif;">${text}</span>
                <div style="display:flex;gap:4px;align-items:center;">
                  <div class="mt-loading-dot"></div>
                  <div class="mt-loading-dot"></div>
                  <div class="mt-loading-dot"></div>
                </div>
              </div>
              <div style="display:flex;flex-direction:column;gap:12px;">
                <div class="mt-loading-skel-line" style="width:100%;"></div>
                <div class="mt-loading-skel-line" style="width:85%;"></div>
                <div class="mt-loading-skel-line" style="width:95%;"></div>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    renderEmptyState(animate = true) {
      const suggestions = [
        '¿Cuáles son los temas principales del curso?',
        'Resume el contenido del primer módulo',
        '¿Qué información hay sobre legislación agraria?',
        'Explica los conceptos fundamentales',
      ];
      const featureDefs = [
        { icon: svgBrain(),    name: 'IA Avanzada',        desc: 'Respuestas inteligentes generadas desde tus documentos' },
        { icon: svgFileIcon(), name: 'Citas Verificables',  desc: 'Cada respuesta incluye referencias específicas' },
        { icon: svgZapIcon(),  name: 'Respuestas Rápidas',  desc: 'Análisis instantáneo de múltiples PDFs' },
      ];
      return `
        <div class="mt-empty-state-dark">
          <div class="mt-es-inner">

            <!-- Avatar -->
            <div class="mt-av-wrap" style="${animate ? 'animation:mt-fade-in-scale 0.5s cubic-bezier(0.22,1,0.36,1) both;' : ''}">
              ${this.renderAvatarHTML('width:100px;height:100px;', '')}
            </div>

            <!-- Título + subtítulo -->
            <div style="${animate ? 'animation:mt-fade-in-up 0.45s ease 0.2s both;' : ''}">
              ${this.logoUrl
                ? `<img src="${this.logoUrl}" alt="ENIGMA" style="height:40px;max-width:200px;object-fit:contain;display:block;margin:0 auto 8px;" />`
                : `<h2 class="mt-es-title">Bienvenido a ENIGMA</h2>`
              }
              <p class="mt-es-subtitle">
                Tu asistente académico inteligente. Haz una pregunta y obtén respuestas
                respaldadas por evidencia documental.
              </p>
            </div>

            <!-- Feature cards -->
            <div class="mt-features-grid" style="${animate ? 'animation:mt-fade-in-up 0.45s ease 0.3s both;' : ''}">
              ${featureDefs.map((f, i) => `
                <div class="mt-feature-card" style="${animate ? `animation:mt-fade-in-up 0.4s ease ${0.4 + i * 0.1}s both;` : ''}">
                  ${f.icon}
                  <p class="mt-feature-name">${f.name}</p>
                  <p class="mt-feature-desc">${f.desc}</p>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    }

    renderCompactEmptyState(animate = true) {
      const suggestions = [
        '¿Cuáles son los temas principales del curso?',
        'Resume el contenido del primer módulo',
        'Explica los conceptos fundamentales',
      ];
      return `
        <div class="mt-compact-empty">
          <!-- Avatar Jarvis -->
          <div style="${animate ? 'animation:mt-fade-in-scale 0.55s cubic-bezier(0.34,1.56,0.64,1) both 0.05s;' : ''}flex-shrink:0;">
            ${this.renderAvatarHTML('width:72px;height:72px;', '')}
          </div>
          <!-- Título y subtítulo -->
          <div style="margin-top:20px;${animate ? 'animation:mt-fade-in-up 0.5s ease-out both 0.18s;' : ''}">
            ${this.logoUrl
              ? `<img src="${this.logoUrl}" alt="ENIGMA" style="height:28px;max-width:130px;object-fit:contain;display:block;margin:0 auto 4px;" />`
              : `<h3 class="mt-cpt-title">ENIGMA</h3>`
            }
            <p class="mt-cpt-subtitle">Haz una pregunta y obtén respuestas<br>respaldadas por evidencia documental.</p>
          </div>
          <!-- Separador -->
          <div style="width:100%;height:1px;background:linear-gradient(to right,transparent,rgba(0,217,255,0.2),transparent);${animate ? 'animation:mt-fade-in-up 0.4s ease-out both 0.26s;' : ''}flex-shrink:0;margin-bottom:12px;"></div>
        </div>
      `;
    }

    renderExpandedHeader(isHistory = false) {
      const courseName = this.courseName || '';
      const studentName = this.studentName || '';
      return `
        <div class="mt-header-anim-line"></div>
        <div class="mt-logo-section">
          <div class="mt-logo">
            <div class="mt-launcher-av" style="width:40px;height:40px;flex-shrink:0;">
              <div class="mt-launcher-av-sphere">
                <div class="mt-launcher-av-core" style="width:16px;height:16px;"></div>
              </div>
              <div class="mt-launcher-av-orbit" style="inset:-7px;">
                <div class="mt-launcher-av-dot" style="transform:rotate(45deg)"></div>
                <div class="mt-launcher-av-dot" style="transform:rotate(225deg)"></div>
              </div>
            </div>
            <div>
              ${this.logoUrl
                ? `<img src="${this.logoUrl}" alt="ENIGMA" class="mt-logo-img" style="height:28px;max-width:140px;object-fit:contain;display:block;" />`
                : `<div class="mt-logo-name">ENIGMA</div>`
              }
              <div class="mt-logo-subtitle">Asistente Académico AI</div>
            </div>
          </div>
          ${courseName ? `<div class="mt-header-divider"></div><div class="mt-course-badge">${escapeHtml(courseName)}</div>` : ''}
        </div>
        <div class="mt-header-right">
          ${studentName ? `<div class="mt-student-badge">${svgUserIcon()} <span>${escapeHtml(studentName)}</span></div>` : ''}
          ${isHistory
            ? `<button type="button" class="mt-btn-history-dark" data-action="history-back">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                <span>Volver al Chat</span>
              </button>`
            : `<button type="button" class="mt-btn-history-dark" data-action="open-history">
                ${svgHistory()}
                <span>Historial</span>
              </button>`
          }
          <button type="button" class="mt-btn-maximize-dark" data-action="expand-toggle" aria-label="Restaurar tamaño">
            ${svgMinimize()}
          </button>
        </div>
      `;
    }

    renderDarkInput() {
      const busy = this.state.loading;
      return `
        <div class="mt-input-dark-area">
          <div class="mt-input-dark-inner">
            <div class="mt-input-wrap">
              <div class="mt-input-glow"></div>
              <form id="mt-form" class="mt-input-glass${busy ? ' mt-input-glass--busy' : ''}">
                <div class="mt-input-scanner"></div>
                <input id="mt-input"
                  placeholder="${busy ? 'Esperando respuesta...' : 'Haz una pregunta sobre los documentos...'}"
                  autocomplete="off"
                  ${busy ? 'disabled' : ''}
                  style="${busy ? 'opacity:0.45;cursor:not-allowed;' : ''}"
                />
                <button type="submit" class="mt-btn-send-dark" aria-label="Enviar"
                  ${busy ? 'disabled' : ''}
                  style="${busy ? 'opacity:0.35;cursor:not-allowed;' : ''}">
                  ${busy
                    ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:mt-spin 0.8s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`
                    : svgSend()
                  }
                </button>
              </form>
            </div>
          </div>
        </div>
      `;
    }

    renderDarkSidebarContent() {
      const count = this.state.historyItems.length;
      const isLoading = this.state.historyLoading;
      return `
        <div class="mt-sidebar-head mt-sidebar-head--dark">
          <div class="mt-sidebar-head-row">
            ${svgClockIcon()}
            <span class="mt-sidebar-head-title">Consultas Recientes</span>
          </div>
          <div class="mt-sidebar-head-count">${count} ${count === 1 ? 'consulta' : 'consultas'}</div>
        </div>
        <div class="mt-sidebar-scroll">
          ${isLoading ? `<div class="mt-sidebar-skel">
            <div class="mt-skel-line mt-skel-line--med"></div>
            <div class="mt-skel-line mt-skel-line--short"></div>
            <div class="mt-skel-line mt-skel-line--med" style="margin-top:14px;"></div>
            <div class="mt-skel-line mt-skel-line--short"></div>
          </div>` : count === 0 ? `
            <div class="mt-sidebar-empty">
              ${svgMessageSquareIcon()}
              <p>No hay consultas recientes</p>
            </div>
          ` : this.renderSidebarHistory()}
        </div>
      `;
    }

    bindSuggestionBtns() {
    
      if (this._suggestionHandler) {
        this.shadowRoot.removeEventListener('click', this._suggestionHandler);
      }
      this._suggestionHandler = (e) => {
        const btn = e.target.closest('.mt-sug-btn');
        if (!btn) return;
        const suggestion = btn.getAttribute('data-suggestion');
        if (!suggestion) return;
        e.stopPropagation();
        const input = this.shadowRoot.querySelector('#mt-input');
        if (input) {
          input.value = suggestion;
          input.focus();
          this.sendMessage();
        }
      };
      this.shadowRoot.addEventListener('click', this._suggestionHandler);
    }

    bindRefsToggles() {
      this.shadowRoot.querySelectorAll(".refs-toggle").forEach((btn) => {
        btn.onclick = () => {
          const anim = btn.nextElementSibling;
          if (!anim?.classList.contains("refs-anim")) return;
          const open = !anim.classList.contains("is-open");
          anim.classList.toggle("is-open", open);
          btn.setAttribute("aria-expanded", String(open));
          // Al abrir el acordeón las tarjetas ya son visibles: re-evaluar botones
          if (open) requestAnimationFrame(() => setTimeout(() => this._initCitationMoreBtns(), 80));
        };
      });
    }

    /** Engancha los botones de acordeón ".mt-cit-body" para re-evaluar "Ver más" al abrirse. */
    bindCitBodyToggles() {
      this.shadowRoot.querySelectorAll('.mt-cit-body').forEach(body => {
        const btn = body.previousElementSibling;
        if (!btn) return;
        btn.addEventListener('click', () => {
          // El onclick inline ya cambió display; si ahora está visible → evaluar
          requestAnimationFrame(() => {
            if (body.style.display !== 'none') {
              setTimeout(() => this._initCitationMoreBtns(), 80);
            }
          });
        });
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

    bindLikeButtons() {
      this.shadowRoot.querySelectorAll("[data-like-value]").forEach((el) => {
        el.onclick = (e) => {
          e.stopPropagation();
          const idx = Number(el.getAttribute("data-msg-index"));
          const likeValue = el.getAttribute("data-like-value");
          if (Number.isNaN(idx) || (likeValue !== "1" && likeValue !== "0")) {
            return;
          }
          this.setLikeForMessage(idx, likeValue);
        };
      });
    }

    bindShell() {
      const root = this.shadowRoot;
      root
        .querySelectorAll("[data-action='toggle-chat']")
        .forEach((btn) => btn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.toggleChat();
        }));
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
      this.bindCitBodyToggles();
      this.bindHistoryDayCards();
      this.bindLikeButtons();
      this.bindSuggestionBtns();
      this.bindHistorySearch();
      this._initCitationMoreBtns();
    }

    /** Muestra "Ver más" solo en tarjetas donde el snippet está realmente truncado. */
    _initCitationMoreBtns() {
      const check = () => {
        this.shadowRoot?.querySelectorAll('.mt-cc-snippet-wrap').forEach(wrap => {
          const p   = wrap.querySelector('.mt-cc-snippet');
          const btn = wrap.parentElement?.querySelector('.mt-cc-more');
          if (!p || !btn) return;

          // 1. Medir primero la altura CON clamp activo
          const clampedH = p.getBoundingClientRect().height;

          // 2. Quitar el clamp y forzar reflow para medir la altura real
          p.style.display         = 'block';
          p.style.webkitLineClamp = 'unset';
          p.style.overflow        = 'visible';
          const fullH = p.scrollHeight;

          // 3. Restaurar clamp
          p.style.display         = '-webkit-box';
          p.style.webkitLineClamp = '3';
          p.style.overflow        = 'hidden';

          if (fullH > clampedH + 4) {
            btn.style.display = 'block';
          }
        });
      };
      // Doble frame + timeout para asegurar que el Shadow DOM pintó completamente
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(check, 80)));
    }

    bindHistorySearch() {
      const root = this.shadowRoot;

      const doSearch = () => {
        clearTimeout(this._searchDebounce);
        const input = this.shadowRoot.querySelector("[data-action='history-search']");
        const selStart = input ? input.selectionStart : 0;
        const selEnd   = input ? input.selectionEnd   : 0;
        this.loadHistory().then(() => {
          const newInput = this.shadowRoot.querySelector("[data-action='history-search']");
          if (newInput) {
            newInput.focus();
            try { newInput.setSelectionRange(selStart, selEnd); } catch (_) {}
          }
        });
      };

      // Search input — solo actualiza el estado; busca en Enter o lupa
      const searchInput = root.querySelector("[data-action='history-search']");
      if (searchInput) {
        searchInput.addEventListener("input", (e) => {
          this.state.historySearch = e.target.value;
        });

        // Enter / tecla "Buscar" del teclado móvil
        searchInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            doSearch();
          }
        });
      }

      // Click en el ícono de lupa
      root.querySelector("[data-action='history-search-submit']")?.addEventListener("click", (e) => {
        e.stopPropagation();
        doSearch();
      });

      // Clear search
      root.querySelector("[data-action='history-search-clear']")?.addEventListener("click", (e) => {
        e.stopPropagation();
        this.state.historySearch = '';
        this.loadHistory().then(() => {
          this.shadowRoot.querySelector("[data-action='history-search']")?.focus();
        });
      });

      // Filter buttons → recarga desde servidor
      root.querySelectorAll("[data-action='history-filter']").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.state.historyFilter = btn.dataset.filter || 'all';
          this.loadHistory();
        });
      });

      // Item toggle (expand/collapse) — preserva scroll del contenedor
      root.querySelectorAll("[data-action='history-item-toggle']").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const id = btn.dataset.id;
          this.state.expandedHistoryId = this.state.expandedHistoryId === id ? null : id;
          this.renderKeepHistScroll();
        });
      });

      // Like/dislike en ítems del historial
      root.querySelectorAll("[data-hist-like-value]").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const itemId    = btn.getAttribute("data-hist-item-id");
          const likeValue = btn.getAttribute("data-hist-like-value");
          if (!itemId || (likeValue !== "1" && likeValue !== "0")) return;
          this.setLikeForHistoryItem(itemId, likeValue);
        });
      });
    }

    render() {
      const expanded = this.state.expanded;
      const view = this.state.view;
      const showSidebar = expanded && view === "chat";
      const isEmpty = this.state.messages.length === 0 && !this.state.loading;

      // ── Flags de animación ──────────────────────────────────────────────────
      const msgCount = this.state.messages.length;
      const animateNewMsg = msgCount > this.state._lastMsgCount;
      if (animateNewMsg) this.state._lastMsgCount = msgCount;

      // Animar empty state: primera vez, o al volver del historial, o al limpiar mensajes
      const fromHistory = this.state._lastView === 'history';
      const hadMessages = this.state._lastMsgCount > 0 && !isEmpty;
      const animateEmpty = isEmpty && (fromHistory || hadMessages || !this.state._emptyAnimated);
      if (isEmpty && animateEmpty) this.state._emptyAnimated = true;
      if (!isEmpty) this.state._emptyAnimated = false;

      this.state._lastView = view;
      // ────────────────────────────────────────────────────────────────────────

      const shellClass = [
        "mt-shell",
        expanded ? "mt-shell--expanded" : "",
        "mt-shell--dark",
        showSidebar ? "mt-shell--with-sidebar" : "",
      ]
        .filter(Boolean)
        .join(" ");

      const typingHtml = this.state.loading
        ? this.renderDarkLoadingState()
        : "";

      const mainContent =
        view === "history"
          ? (expanded ? this.renderHistoryFull() : this.renderHistoryCompact())
          : `<div class="mt-body">
          ${!isEmpty ? `
            <div class="mt-chat-toolbar">
              <button type="button" class="mt-btn-new-chat" data-action="new-chat">+ Nuevo chat</button>
            </div>
          ` : ""}
          <div class="mt-messages" id="mt-messages">
            ${isEmpty
              ? (expanded ? this.renderEmptyState(animateEmpty) : this.renderCompactEmptyState(animateEmpty))
              : (expanded ? this.renderDarkMessages(animateNewMsg) : this.renderCompactMessages(animateNewMsg))
            }
            ${typingHtml}
          </div>
          ${this.renderDarkInput()}
        </div>`;

      this.shadowRoot.innerHTML = `
        <style>${buildStyles()}</style>
        <button type="button" class="mt-launcher${this.state.isOpen && this.state.expanded ? ' mt-launcher--hidden' : ''}" data-action="toggle-chat" aria-label="Abrir chat">
          <div class="mt-launcher-av">
            <div class="mt-launcher-av-sphere">
              <div class="mt-launcher-av-core"></div>
            </div>
            <div class="mt-launcher-av-orbit">
              <div class="mt-launcher-av-dot" style="transform:rotate(45deg)"></div>
              <div class="mt-launcher-av-dot" style="transform:rotate(225deg)"></div>
            </div>
          </div>
        </button>
        ${
          this.state.isOpen
            ? `
        <div class="${shellClass}">
          <div class="mt-bg-decorations"><div class="mt-bg-orb mt-bg-orb--cyan"></div><div class="mt-bg-orb mt-bg-orb--purple"></div></div>
          <div class="mt-main">
            ${expanded
              ? `<header class="mt-header mt-header--dark">${this.renderExpandedHeader(view === 'history')}</header>`
              : `<header class="mt-header mt-header--dark mt-header--compact-dk">
                  <div class="mt-header-anim-line"></div>
                  ${view === 'history'
                    ? `<button type="button" class="mt-btn-maximize-dark" data-action="history-back" aria-label="Volver al chat" style="gap:4px;font-size:12px;font-family:system-ui,sans-serif;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                      </button>`
                    : `<button type="button" class="mt-btn-maximize-dark" data-action="open-history" aria-label="Historial">
                        ${svgHistory()}
                      </button>`
                  }
                  <div class="mt-compact-logo">
                    <div>
                      ${view === 'history'
                        ? `<div class="mt-compact-logo-name">Historial</div>`
                        : (this.logoUrl
                          ? `<img src="${this.logoUrl}" alt="ENIGMA" style="height:18px;max-width:100px;object-fit:contain;display:block;" />`
                          : `<div class="mt-compact-logo-name">ENIGMA</div>`)
                      }
                      <div class="mt-compact-logo-sub">${view === 'history' ? 'Conversaciones anteriores' : 'Asistente Académico'}</div>
                    </div>
                  </div>
                  ${window.innerWidth <= 600
                    ? `<button type="button" class="mt-btn-maximize-dark" data-action="toggle-chat" aria-label="Cerrar chat">${svgClose()}</button>`
                    : `<button type="button" class="mt-btn-maximize-dark" data-action="expand-toggle" aria-label="Ampliar">${svgMaximize()}</button>`
                  }
                </header>`
            }
            ${mainContent}
          </div>
        </div>
        `
            : ""
        }
      `;

      this.bindShell();

      if (this.state.isOpen && view === "chat" && this.state._scrollToBottom) {
        this.state._scrollToBottom = false;
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

  function svgClose() {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  }

  function svgDoc() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>`;
  }

  function svgThumbUp() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M7 22H3V9h4v13z"/><path d="M14 9V4.5a2.5 2.5 0 0 0-5 0V9l-2 3v10h9.28a2 2 0 0 0 1.96-1.61L20 12a2 2 0 0 0-1.96-2H14z"/></svg>`;
  }

  function svgThumbDown() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M17 2h4v13h-4V2z"/><path d="M10 15v4.5a2.5 2.5 0 0 0 5 0V15l2-3V2h-9.28a2 2 0 0 0-1.96 1.61L4 12a2 2 0 0 0 1.96 2H10z"/></svg>`;
  }

  function svgChevronLeft() {
    return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>`;
  }

  function svgGraduationCap() {
    return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`;
  }

  function svgUserIcon() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
  }

  function svgClockIcon() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`;
  }

  function svgMessageSquareIcon() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
  }

  function svgBrain() {
    return `<svg class="mt-feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.44-3.66"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.44-3.66"/></svg>`;
  }

  function svgFileIcon() {
    return `<svg class="mt-feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>`;
  }

  function svgZapIcon() {
    return `<svg class="mt-feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
  }

  function svgSparklesIcon() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3l1.88 5.82L20 10l-6.12 1.18L12 17l-1.88-5.82L4 10l6.12-1.18z"/></svg>`;
  }

  function svgMapPinIcon() {
    return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>`;
  }

  function svgFileCitationIcon() {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>`;
  }

  customElements.define("chatbot-widget", ChatbotWidget);
})();
