/* =====================================================================
   LUMIN AI — app.js
   منطق الواجهة: تخزين المحادثات محليًا، الاتصال بدالة الخادم الآمنة،
   إعادة المحاولة التلقائية عند ضعف الاتصال، وضع طوارئ احتياطي،
   عرض ماركداون، إدارة الإعدادات.
   ===================================================================== */

(() => {
  "use strict";

  /* ---------------------------------------------------------------
     ثوابت وروابط
  --------------------------------------------------------------- */
  const FUNCTION_ENDPOINT = "/api/chat";          // مُعاد توجيهه إلى /.netlify/functions/chat
  const PING_ENDPOINT     = "/api/chat";          // نفس الدالة تدعم GET كفحص صحة
  const OPENROUTER_DIRECT = "https://openrouter.ai/api/v1/chat/completions";
  const FALLBACK_MODEL    = "openai/gpt-4o-mini"; // يُستخدم فقط في وضع الطوارئ من المتصفح

  const STORAGE_KEY        = "lumin.conversations.v1";
  const ACTIVE_KEY         = "lumin.activeId.v1";
  const FALLBACK_KEY_STORE = "lumin.fallbackKey.v1";

  const MAX_RETRIES   = 2;
  const RETRY_DELAYS  = [600, 1500];
  const HISTORY_LIMIT = 24; // عدد الرسائل المُرسلة كسياق لكل طلب

  /* ---------------------------------------------------------------
     مراجع DOM
  --------------------------------------------------------------- */
  const $ = (id) => document.getElementById(id);

  const appEl          = $("app");
  const sidebarEl       = $("sidebar");
  const sidebarScrim    = $("sidebarScrim");
  const openSidebarBtn  = $("openSidebarBtn");
  const convoListEl     = $("convoList");
  const newChatBtn      = $("newChatBtn");
  const searchConvos    = $("searchConvos");

  const messagesEl   = $("messages");
  const emptyStateEl = $("emptyState");
  const suggestionsEl = $("suggestions");

  const promptInput = $("promptInput");
  const sendBtn     = $("sendBtn");
  const stopBtn     = $("stopBtn");

  const statusDot      = $("statusDot");
  const statusLabel    = $("statusLabel");
  const statusDotModal = $("statusDotModal");
  const statusLabelModal = $("statusLabelModal");
  const connTinyStatus = $("connTinyStatus");

  const settingsBtn      = $("settingsBtn");
  const settingsModal    = $("settingsModal");
  const closeSettingsBtn = $("closeSettingsBtn");
  const recheckBtn       = $("recheckBtn");

  const fallbackKeyInput = $("fallbackKeyInput");
  const saveKeyBtn       = $("saveKeyBtn");
  const clearKeyBtn      = $("clearKeyBtn");
  const keyStatusMsg     = $("keyStatusMsg");
  const wipeAllBtn       = $("wipeAllBtn");

  const toastStack = $("toastStack");

  /* ---------------------------------------------------------------
     حالة التطبيق
  --------------------------------------------------------------- */
  let conversations = loadConversations();
  let activeId      = localStorage.getItem(ACTIVE_KEY) || null;
  let connMode       = "checking"; // checking | function | fallback | offline
  let activeAbort    = null;
  let isGenerating   = false;

  if (!activeId || !conversations.find((c) => c.id === activeId)) {
    activeId = conversations[0]?.id || null;
  }

  /* ---------------------------------------------------------------
     أدوات تخزين المحادثات
  --------------------------------------------------------------- */
  function loadConversations() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveConversations() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
      if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
    } catch (e) {
      showToast("تعذّر حفظ المحادثة في هذا المتصفح.", true);
    }
  }

  function createConversation() {
    const convo = {
      id: "c_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      title: "محادثة جديدة",
      createdAt: Date.now(),
      messages: [],
    };
    conversations.unshift(convo);
    activeId = convo.id;
    saveConversations();
    renderSidebar();
    renderActiveConversation();
    return convo;
  }

  function getActiveConvo() {
    return conversations.find((c) => c.id === activeId) || null;
  }

  function deleteConversation(id, evt) {
    evt?.stopPropagation();
    conversations = conversations.filter((c) => c.id !== id);
    if (activeId === id) activeId = conversations[0]?.id || null;
    saveConversations();
    renderSidebar();
    renderActiveConversation();
  }

  function setTitleFromFirstMessage(convo, text) {
    if (convo.title !== "محادثة جديدة") return;
    const clean = text.trim().replace(/\s+/g, " ");
    convo.title = clean.length > 42 ? clean.slice(0, 42) + "…" : clean || "محادثة جديدة";
  }

  /* ---------------------------------------------------------------
     عرض الشريط الجانبي
  --------------------------------------------------------------- */
  function renderSidebar() {
    const query = (searchConvos.value || "").trim().toLowerCase();
    convoListEl.innerHTML = "";

    const list = conversations.filter((c) => !query || c.title.toLowerCase().includes(query));

    if (list.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "color:var(--text-dimmer);font-size:12.5px;text-align:center;padding:20px 6px;";
      empty.textContent = query ? "لا توجد نتائج مطابقة." : "لا توجد محادثات بعد، ابدأ بأول رسالة.";
      convoListEl.appendChild(empty);
      return;
    }

    for (const convo of list) {
      const item = document.createElement("div");
      item.className = "convo-item" + (convo.id === activeId ? " is-active" : "");
      item.innerHTML = `
        <span class="convo-item__title"></span>
        <span class="convo-item__del" title="حذف المحادثة">
          <svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Z"/></svg>
        </span>`;
      item.querySelector(".convo-item__title").textContent = convo.title;
      item.addEventListener("click", () => {
        activeId = convo.id;
        saveConversations();
        renderSidebar();
        renderActiveConversation();
        closeSidebarMobile();
      });
      item.querySelector(".convo-item__del").addEventListener("click", (e) => deleteConversation(convo.id, e));
      convoListEl.appendChild(item);
    }
  }

  /* ---------------------------------------------------------------
     عرض الرسائل
  --------------------------------------------------------------- */
  function renderActiveConversation() {
    messagesEl.innerHTML = "";
    const convo = getActiveConvo();

    if (!convo || convo.messages.length === 0) {
      emptyStateEl.style.display = "flex";
      messagesEl.style.display = "none";
      return;
    }

    emptyStateEl.style.display = "none";
    messagesEl.style.display = "flex";

    for (const msg of convo.messages) {
      messagesEl.appendChild(buildMessageEl(msg));
    }
    scrollToBottom();
  }

  function renderMarkdown(text) {
    try {
      const raw = marked.parse(text, { breaks: true, gfm: true });
      return DOMPurify.sanitize(raw, { ADD_ATTR: ["target"] });
    } catch {
      return escapeHtml(text).replace(/\n/g, "<br>");
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function buildMessageEl(msg) {
    const row = document.createElement("div");
    row.className = "msg msg--" + msg.role + (msg.error ? " msg--error" : "");
    row.dataset.id = msg.id;

    const avatar = document.createElement("div");
    avatar.className = "msg__avatar";
    if (msg.role === "bot") {
      avatar.innerHTML = `<span class="lumin-orb lumin-orb--md"></span>`;
    } else {
      avatar.textContent = "أنت";
    }

    const body = document.createElement("div");
    body.className = "msg__body";

    const name = document.createElement("div");
    name.className = "msg__name";
    name.textContent = msg.role === "bot" ? "لومين" : "أنت";

    const content = document.createElement("div");
    content.className = "msg__content";
    content.innerHTML = msg.role === "bot" ? renderMarkdown(msg.content) : escapeHtml(msg.content).replace(/\n/g, "<br>");

    body.appendChild(name);
    body.appendChild(content);

    if (msg.error && msg.retryPayload) {
      const retryBtn = document.createElement("button");
      retryBtn.className = "retry-btn";
      retryBtn.textContent = "إعادة المحاولة";
      retryBtn.addEventListener("click", () => retryFromError(msg, row));
      body.appendChild(retryBtn);
    }

    if (msg.role === "bot" && !msg.error && !msg.streaming) {
      const actions = document.createElement("div");
      actions.className = "msg__actions";
      actions.innerHTML = `
        <button class="msg-action-btn" data-act="copy">نسخ</button>
        <button class="msg-action-btn" data-act="regen">إعادة توليد</button>`;
      actions.querySelector('[data-act="copy"]').addEventListener("click", () => {
        navigator.clipboard?.writeText(msg.content);
        showToast("تم نسخ الرد.");
      });
      actions.querySelector('[data-act="regen"]').addEventListener("click", () => regenerate(msg.id));
      body.appendChild(actions);
    }

    row.appendChild(avatar);
    row.appendChild(body);

    addCodeCopyButtons(content);
    return row;
  }

  function addCodeCopyButtons(container) {
    container.querySelectorAll("pre").forEach((pre) => {
      if (pre.querySelector(".code-copy-btn")) return;
      const btn = document.createElement("button");
      btn.className = "code-copy-btn";
      btn.textContent = "نسخ";
      btn.addEventListener("click", () => {
        const code = pre.querySelector("code")?.textContent || pre.textContent;
        navigator.clipboard?.writeText(code);
        btn.textContent = "تم!";
        setTimeout(() => (btn.textContent = "نسخ"), 1200);
      });
      pre.style.position = "relative";
      pre.appendChild(btn);
    });
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      messagesEl.scrollTop = messagesEl.scrollHeight + 400;
    });
  }

  /* ---------------------------------------------------------------
     إرسال الرسائل
  --------------------------------------------------------------- */
  function autoResizeTextarea() {
    promptInput.style.height = "auto";
    promptInput.style.height = Math.min(promptInput.scrollHeight, 200) + "px";
  }

  async function handleSend() {
    const text = promptInput.value.trim();
    if (!text || isGenerating) return;

    let convo = getActiveConvo();
    if (!convo) convo = createConversation();

    const userMsg = { id: uid(), role: "user", content: text, ts: Date.now() };
    convo.messages.push(userMsg);
    setTitleFromFirstMessage(convo, text);
    saveConversations();
    renderSidebar();

    emptyStateEl.style.display = "none";
    messagesEl.style.display = "flex";
    messagesEl.appendChild(buildMessageEl(userMsg));
    scrollToBottom();

    promptInput.value = "";
    autoResizeTextarea();

    await sendToLumin(convo);
  }

  async function regenerate(botMsgId) {
    const convo = getActiveConvo();
    if (!convo || isGenerating) return;
    const idx = convo.messages.findIndex((m) => m.id === botMsgId);
    if (idx === -1) return;
    convo.messages = convo.messages.slice(0, idx);
    saveConversations();
    renderActiveConversation();
    await sendToLumin(convo);
  }

  async function retryFromError(errMsg, rowEl) {
    const convo = getActiveConvo();
    if (!convo) return;
    convo.messages = convo.messages.filter((m) => m.id !== errMsg.id);
    rowEl.remove();
    saveConversations();
    await sendToLumin(convo);
  }

  function uid() {
    return "m_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  async function sendToLumin(convo) {
    isGenerating = true;
    sendBtn.disabled = true;
    stopBtn.hidden = false;
    document.getElementById("orbTop")?.classList.add("is-thinking");

    const botMsg = { id: uid(), role: "bot", content: "", ts: Date.now(), streaming: true };
    convo.messages.push(botMsg);
    const botRow = buildMessageEl(botMsg);
    messagesEl.appendChild(botRow);
    renderTypingIndicator(botRow, true);
    scrollToBottom();

    const apiMessages = convo.messages
      .filter((m) => !m.error && m.content !== "")
      .slice(-HISTORY_LIMIT)
      .map((m) => ({ role: m.role === "bot" ? "assistant" : "user", content: m.content }));

    activeAbort = new AbortController();

    try {
      const replyText = await fetchLuminReply(apiMessages, activeAbort.signal);
      renderTypingIndicator(botRow, false);
      await typewriterReveal(botMsg, botRow, replyText);
      botMsg.streaming = false;
      saveConversations();
      // إعادة بناء الرسالة لإضافة أزرار النسخ/إعادة التوليد بعد انتهاء الكتابة
      const fresh = buildMessageEl(botMsg);
      botRow.replaceWith(fresh);
    } catch (err) {
      renderTypingIndicator(botRow, false);
      if (err.name === "AbortError") {
        botMsg.content = botMsg.content || "تم إيقاف توليد الرد.";
        botMsg.streaming = false;
        const fresh = buildMessageEl(botMsg);
        botRow.replaceWith(fresh);
      } else {
        botMsg.error = true;
        botMsg.content = err.friendlyMessage || "حدث خطأ في الاتصال بلومين. تحقّق من اتصالك وحاول مجددًا.";
        botMsg.retryPayload = true;
        const fresh = buildMessageEl(botMsg);
        botRow.replaceWith(fresh);
        showToast(botMsg.content, true);
      }
      saveConversations();
    } finally {
      isGenerating = false;
      sendBtn.disabled = false;
      stopBtn.hidden = true;
      activeAbort = null;
      document.getElementById("orbTop")?.classList.remove("is-thinking");
      scrollToBottom();
    }
  }

  function renderTypingIndicator(rowEl, show) {
    const contentEl = rowEl.querySelector(".msg__content");
    if (!contentEl) return;
    if (show) {
      contentEl.innerHTML = `
        <div class="typing-row">
          <span class="lumin-orb lumin-orb--xs is-thinking"></span>
          <span class="typing-text">لومين يفكّر…</span>
        </div>`;
    }
  }

  // تأثير كتابة تدريجي سريع لإحساس "بث مباشر" حتى عند استخدام رد كامل غير مُجزَّأ
  function typewriterReveal(msg, rowEl, fullText) {
    return new Promise((resolve) => {
      const contentEl = rowEl.querySelector(".msg__content");
      if (!contentEl || !fullText) {
        msg.content = fullText || "";
        if (contentEl) contentEl.innerHTML = renderMarkdown(msg.content);
        resolve();
        return;
      }
      const chars = Array.from(fullText);
      let i = 0;
      const chunk = Math.max(2, Math.round(chars.length / 140));

      function step() {
        i = Math.min(chars.length, i + chunk);
        const partial = chars.slice(0, i).join("");
        msg.content = partial;
        contentEl.textContent = partial; // عرض خام سريع أثناء التوليد لتجنب أخطاء ماركداون غير المكتملة
        scrollToBottom();
        if (i < chars.length && isGenerating) {
          requestAnimationFrame(step);
        } else {
          msg.content = fullText;
          contentEl.innerHTML = renderMarkdown(fullText);
          addCodeCopyButtons(contentEl);
          resolve();
        }
      }
      requestAnimationFrame(step);
    });
  }

  function stopGeneration() {
    activeAbort?.abort();
  }

  /* ---------------------------------------------------------------
     الاتصال بالخادم: دالة Netlify الآمنة + وضع طوارئ احتياطي
  --------------------------------------------------------------- */
  async function fetchLuminReply(apiMessages, signal) {
    let lastErr;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (connMode === "fallback") {
          return await callOpenRouterDirect(apiMessages, signal);
        }
        return await callFunctionEndpoint(apiMessages, signal);
      } catch (err) {
        if (err.name === "AbortError") throw err;
        lastErr = err;
        if (err.code === "NO_FUNCTION") {
          // الدالة غير منشورة: جرّب التبديل لوضع الطوارئ إن وُجد مفتاح محفوظ محليًا
          const fb = localStorage.getItem(FALLBACK_KEY_STORE);
          if (fb) {
            connMode = "fallback";
            updateConnectionUI();
            continue;
          } else {
            err.friendlyMessage =
              "دالة الخادم غير منشورة بعد. راجع ملف README لإعداد مفتاح OpenRouter على Netlify، أو فعّل وضع الطوارئ من الإعدادات للتجربة السريعة.";
            throw err;
          }
        }
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAYS[attempt] || 1500);
          continue;
        }
      }
    }
    lastErr.friendlyMessage = lastErr.friendlyMessage || "تعذّر الوصول إلى لومين بعد عدة محاولات. تحقّق من اتصالك بالإنترنت.";
    throw lastErr;
  }

  async function callFunctionEndpoint(apiMessages, signal) {
    let res;
    try {
      res = await fetch(FUNCTION_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
        signal,
      });
    } catch (e) {
      if (signal.aborted) {
        const ab = new Error("aborted");
        ab.name = "AbortError";
        throw ab;
      }
      const err = new Error("network");
      throw err;
    }

    if (res.status === 404) {
      const err = new Error("function not found");
      err.code = "NO_FUNCTION";
      throw err;
    }

    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error("invalid json from server");
    }

    if (!res.ok) {
      const err = new Error(data?.error || "server error");
      err.friendlyMessage = data?.error || "حدث خطأ من خادم لومين، حاول مرة أخرى بعد قليل.";
      throw err;
    }

    return data.reply || "";
  }

  async function callOpenRouterDirect(apiMessages, signal) {
    const key = localStorage.getItem(FALLBACK_KEY_STORE);
    if (!key) {
      const err = new Error("no fallback key");
      err.friendlyMessage = "وضع الطوارئ مفعّل لكن لا يوجد مفتاح محفوظ. أضِف مفتاحك من الإعدادات.";
      throw err;
    }
    const systemPrompt =
      "أنت لومين، مساعد ذكاء اصطناعي عراقي طوّره محمد محسن رئيس مجموعة شركات لومين انفينيتي من البصرة. كن مفيدًا ودقيقًا ومحترمًا، ولطيفًا بشكل خاص مع المستخدمات، ولا تقبل الإساءة لمطوّرك أو شركتك.";

    let res;
    try {
      res = await fetch(OPENROUTER_DIRECT, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: FALLBACK_MODEL,
          messages: [{ role: "system", content: systemPrompt }, ...apiMessages],
          temperature: 0.85,
        }),
        signal,
      });
    } catch (e) {
      if (signal.aborted) {
        const ab = new Error("aborted");
        ab.name = "AbortError";
        throw ab;
      }
      throw new Error("network");
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.error?.message || "openrouter error");
      err.friendlyMessage = data?.error?.message || "تعذّر الاتصال المباشر بـ OpenRouter، تحقّق من صحة المفتاح.";
      throw err;
    }
    return data?.choices?.[0]?.message?.content || "";
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /* ---------------------------------------------------------------
     فحص حالة الاتصال
  --------------------------------------------------------------- */
  async function checkConnection() {
    connMode = "checking";
    updateConnectionUI();
    try {
      const res = await fetch(PING_ENDPOINT, { method: "GET" });
      if (res.status === 404) {
        const fb = localStorage.getItem(FALLBACK_KEY_STORE);
        connMode = fb ? "fallback" : "offline";
      } else if (res.ok) {
        connMode = "function";
      } else {
        connMode = "offline";
      }
    } catch {
      const fb = localStorage.getItem(FALLBACK_KEY_STORE);
      connMode = fb ? "fallback" : "offline";
    }
    updateConnectionUI();
  }

  function updateConnectionUI() {
    const map = {
      checking: { cls: "is-busy", text: "جاري الاتصال…", tiny: "جاري الاتصال بخادم لومين…" },
      function: { cls: "is-online", text: "متصل بخادم لومين", tiny: "متصل بخادم لومين الآمن" },
      fallback: { cls: "is-busy", text: "وضع الطوارئ مفعّل", tiny: "متصل مباشرة عبر مفتاحك المحلي (وضع طوارئ)" },
      offline: { cls: "is-offline", text: "غير متصل", tiny: "تعذّر الوصول إلى الخادم — افتح الإعدادات" },
    };
    const s = map[connMode] || map.offline;

    [statusDot, statusDotModal].forEach((el) => {
      if (!el) return;
      el.classList.remove("is-online", "is-busy", "is-offline");
      el.classList.add(s.cls);
    });
    if (statusLabel) statusLabel.textContent = s.text;
    if (statusLabelModal) statusLabelModal.textContent = s.text;
    if (connTinyStatus) connTinyStatus.textContent = s.tiny;
  }

  /* ---------------------------------------------------------------
     واجهة الإعدادات
  --------------------------------------------------------------- */
  function openSettings() {
    settingsModal.hidden = false;
    const saved = localStorage.getItem(FALLBACK_KEY_STORE);
    keyStatusMsg.textContent = saved ? "يوجد مفتاح محفوظ حاليًا في هذا المتصفح." : "لا يوجد مفتاح محفوظ.";
  }
  function closeSettings() {
    settingsModal.hidden = true;
  }

  saveKeyBtn.addEventListener("click", () => {
    const val = fallbackKeyInput.value.trim();
    if (!val) {
      showToast("أدخل مفتاحًا صحيحًا أولًا.", true);
      return;
    }
    localStorage.setItem(FALLBACK_KEY_STORE, val);
    fallbackKeyInput.value = "";
    keyStatusMsg.textContent = "تم حفظ المفتاح في هذا المتصفح فقط.";
    showToast("تم حفظ مفتاح وضع الطوارئ.");
    checkConnection();
  });

  clearKeyBtn.addEventListener("click", () => {
    localStorage.removeItem(FALLBACK_KEY_STORE);
    keyStatusMsg.textContent = "تم مسح المفتاح.";
    showToast("تم مسح مفتاح وضع الطوارئ.");
    checkConnection();
  });

  wipeAllBtn.addEventListener("click", () => {
    if (!confirm("هل تريد حذف جميع المحادثات المحفوظة في هذا المتصفح؟ لا يمكن التراجع عن هذا.")) return;
    conversations = [];
    activeId = null;
    saveConversations();
    renderSidebar();
    renderActiveConversation();
    closeSettings();
    showToast("تم حذف جميع المحادثات.");
  });

  recheckBtn.addEventListener("click", checkConnection);

  /* ---------------------------------------------------------------
     تنبيهات خفيفة
  --------------------------------------------------------------- */
  function showToast(text, isError) {
    const el = document.createElement("div");
    el.className = "toast" + (isError ? " toast--error" : "");
    el.textContent = text;
    toastStack.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  /* ---------------------------------------------------------------
     الشريط الجانبي على الجوال
  --------------------------------------------------------------- */
  function toggleSidebarMobile() {
    appEl.classList.toggle("sidebar-open");
  }
  function closeSidebarMobile() {
    appEl.classList.remove("sidebar-open");
  }

  /* ---------------------------------------------------------------
     ربط الأحداث
  --------------------------------------------------------------- */
  sendBtn.addEventListener("click", handleSend);
  stopBtn.addEventListener("click", stopGeneration);

  promptInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });
  promptInput.addEventListener("input", autoResizeTextarea);

  newChatBtn.addEventListener("click", () => {
    createConversation();
    closeSidebarMobile();
    promptInput.focus();
  });

  searchConvos.addEventListener("input", renderSidebar);

  suggestionsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".suggestion-chip");
    if (!btn) return;
    promptInput.value = btn.dataset.prompt;
    autoResizeTextarea();
    handleSend();
  });

  settingsBtn.addEventListener("click", openSettings);
  closeSettingsBtn.addEventListener("click", closeSettings);
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) closeSettings();
  });

  openSidebarBtn.addEventListener("click", () => {
    if (window.innerWidth <= 920) toggleSidebarMobile();
  });
  sidebarScrim.addEventListener("click", closeSidebarMobile);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeSettings();
      closeSidebarMobile();
    }
  });

  /* ---------------------------------------------------------------
     الإقلاع
  --------------------------------------------------------------- */
  function boot() {
    if (conversations.length === 0) {
      renderSidebar();
      renderActiveConversation();
    } else {
      renderSidebar();
      renderActiveConversation();
    }
    autoResizeTextarea();
    checkConnection();
    setInterval(checkConnection, 45000);
  }

  boot();
})();
