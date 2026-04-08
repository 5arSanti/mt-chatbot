function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Etiqueta legible desde gs://... o ruta larga (solo nombre de archivo). */
function citationSourceLabel(source) {
  if (!source) return "Fuente";
  const last = source.split("/").pop() || source;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

class ChatbotWidget extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    this.state = {
      isOpen: false,
      loading: false,
      messages: [],
    };
  }

  get apiUrl() {
    return (
      this.getAttribute("api-url") ??
      "https://course-storage-api-qdrant-1018797915827.us-east1.run.app/qa"
    );
  }

  static get observedAttributes() {
    return ["student-id", "course-id"];
  }

  get studentId() {
    return this.getAttribute("student-id");
  }

  get courseId() {
    return this.getAttribute("course-id");
  }

  connectedCallback() {
    this.render();
  }

  toggleChat() {
    this.state.isOpen = !this.state.isOpen;
    this.render();
  }

  get security() {
    return "pAc987RLg35!xBR";
  }

  async sendMessage() {
    const input = this.shadowRoot.querySelector("#input");
    const question = input.value.trim();

    if (!question) return;

    this.state.messages.push({ role: "user", text: question });
    this.state.loading = true;
    this.render();

    input.value = "";

    try {
      const body = {
        student_id: this.studentId,
        course_id: this.courseId,
        question,
      };

      const response = await fetch(`${this.apiUrl}?security=${this.security}`, {
        method: "POST",
        mode: "cors",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      const citations = Array.isArray(data.citations)
        ? data.citations.map((c) => ({
            source: c.source,
            snippet: c.snippet,
          }))
        : [];

      this.state.messages.push({
        role: "bot",
        text: data.answer || "Sin respuesta",
        citations,
      });
    } catch (error) {
      this.state.messages.push({
        role: "bot",
        text: "Error consultando el servicio",
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

    const refsHtml = hasRefs
      ? `
      <button type="button" class="refs-toggle" aria-expanded="false" aria-controls="${panelId}">
        <span class="refs-toggle-icon" aria-hidden="true">◇</span>
        Referencias
        <span class="refs-count">${citations.length}</span>
      </button>
      <div class="refs-panel" id="${panelId}" hidden>
        <ul class="refs-list">
          ${citations
            .map(
              (c) => `
            <li class="ref-item">
              <div class="ref-source">${escapeHtml(
                citationSourceLabel(c.source)
              )}</div>
              ${
                c.snippet
                  ? `<blockquote class="ref-snippet">${escapeHtml(
                      c.snippet
                    )}</blockquote>`
                  : ""
              }
            </li>
          `
            )
            .join("")}
        </ul>
      </div>
    `
      : "";

    return `<div class="bot-msg">${
      text ? `<div class="bot-answer">${text}</div>` : ""
    }${refsHtml}</div>`;
  }

  bindRefsToggles() {
    this.shadowRoot.querySelectorAll(".refs-toggle").forEach((btn) => {
      btn.onclick = () => {
        const panel = btn.nextElementSibling;
        if (!panel || !panel.classList.contains("refs-panel")) return;
        const open = panel.hidden;
        panel.hidden = !open;
        btn.setAttribute("aria-expanded", String(open));
      };
    });
  }

  render() {
    this.shadowRoot.innerHTML = `
        <style>
          .button {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #4f46e5;
            color: white;
            border: none;
            border-radius: 50%;
            width: 60px;
            height: 60px;
            cursor: pointer;
          }
  
          .chat {
            position: fixed;
            bottom: 90px;
            right: 20px;
            width: 300px;
            height: 400px;
            background: white;
            border: 1px solid #ddd;
            border-radius: 10px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
          }
  
          .messages {
            flex: 1;
            padding: 10px;
            overflow-y: auto;
            font-size: 14px;
          }
  
          .input {
            display: flex;
            border-top: 1px solid #ddd;
          }
  
          .input input {
            flex: 1;
            padding: 10px;
            border: none;
            outline: none;
          }
  
          .input button {
            padding: 10px;
            border: none;
            background: #4f46e5;
            color: white;
            cursor: pointer;
          }
  
          .user {
            text-align: right;
            margin: 5px 0;
          }
  
          .bot {
            text-align: left;
            margin: 5px 0;
          }

          .bot-msg {
            text-align: left;
            margin: 10px 0;
            max-width: 100%;
          }

          .bot-answer {
            line-height: 1.5;
            color: #1e293b;
          }

          .refs-toggle {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            margin-top: 10px;
            padding: 6px 12px;
            font-size: 12px;
            font-weight: 500;
            letter-spacing: 0.02em;
            color: #4338ca;
            background: #f5f3ff;
            border: 1px solid #e0e7ff;
            border-radius: 999px;
            cursor: pointer;
            transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
          }

          .refs-toggle:hover {
            background: #ede9fe;
            border-color: #c7d2fe;
            color: #3730a3;
          }

          .refs-toggle-icon {
            font-size: 10px;
            opacity: 0.85;
          }

          .refs-count {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 1.25rem;
            height: 1.25rem;
            padding: 0 5px;
            font-size: 11px;
            font-weight: 600;
            color: #fff;
            background: #6366f1;
            border-radius: 999px;
          }

          .refs-panel {
            margin-top: 10px;
            padding: 12px 14px;
            background: #fafafa;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            border-left: 3px solid #6366f1;
          }

          .refs-list {
            margin: 0;
            padding: 0;
            list-style: none;
          }

          .ref-item + .ref-item {
            margin-top: 14px;
            padding-top: 14px;
            border-top: 1px solid #e2e8f0;
          }

          .ref-source {
            font-size: 12px;
            font-weight: 600;
            color: #475569;
            line-height: 1.35;
            word-break: break-word;
          }

          .ref-snippet {
            margin: 8px 0 0;
            padding: 0 0 0 12px;
            border-left: 2px solid #cbd5e1;
            font-size: 13px;
            line-height: 1.5;
            color: #64748b;
            font-style: normal;
          }
        </style>
  
        <button class="button">💬</button>
  
        ${
          this.state.isOpen
            ? `
          <div class="chat">
            <div class="messages">
              ${this.state.messages
                .map((m, i) =>
                  m.role === "user"
                    ? `<div class="user">${escapeHtml(m.text)}</div>`
                    : this.renderBotMessage(m, i)
                )
                .join("")}
              ${this.state.loading ? `<div class="bot">...</div>` : ""}
            </div>
  
            <div class="input">
              <input id="input" placeholder="Escribe tu pregunta..." />
              <button id="send">Enviar</button>
            </div>
          </div>
        `
            : ""
        }
      `;

    this.shadowRoot.querySelector(".button").onclick = () => this.toggleChat();

    const sendBtn = this.shadowRoot.querySelector("#send");
    if (sendBtn) {
      sendBtn.onclick = () => this.sendMessage();
    }

    this.bindRefsToggles();
  }
}

customElements.define("chatbot-widget", ChatbotWidget);
