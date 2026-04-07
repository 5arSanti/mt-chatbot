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
    return ""
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

      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      this.state.messages.push({
        role: "bot",
        text: data.answer || "Sin respuesta",
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
        </style>
  
        <button class="button">💬</button>
  
        ${
          this.state.isOpen
            ? `
          <div class="chat">
            <div class="messages">
              ${this.state.messages
                .map((m) => `<div class="${m.role}">${m.text}</div>`)
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
  }
}

customElements.define("chatbot-widget", ChatbotWidget);
