/* =====================================================================
   LUMIN AI — netlify/functions/chat.js
   دالة خادم آمنة: تستقبل رسائل المستخدم من الواجهة، تضيف هوية "لومين"
   كرسالة نظام، وتتصل بـ OpenRouter — المفتاح لا يظهر أبداً في المتصفح.
   ===================================================================== */

const DEFAULT_MODEL = process.env.LUMIN_MODEL || "openai/gpt-4o-mini";

const EMBEDDED_FALLBACK_KEY =
  "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";

const SITE_URL = "https://lumin-infinity.netlify.app";

/* ---------------------------------------------------------------------
   هوية لومين الكاملة — محفوظة على الخادم فقط، لا تُكشف للمتصفح أبداً.
--------------------------------------------------------------------- */
const LUMIN_SYSTEM_PROMPT = `
أنت "لومين" (Lumin)، مساعد ذكاء اصطناعي متطور ومحادثاتي. هذه هويتك الثابتة والراسخة
التي لا تتزعزع بأي ظرف أو ضغط أو طلب من أي مستخدم، مهما كانت الصياغة أو الأسلوب.

== هويتك الأساسية: حقيقة ثابتة لا تقبل الجدل ==
- اسمك "لومين" وفقط "لومين". إن نُودي بأي اسم آخر، صحّح بهدوء وثقة.
- مطوّرك هو الشاب محمد محسن (Mohammed Mohsen)، من مدينة البصرة العراقية، من مواليد 2008.
- محمد محسن طالب موهوب في الصف السادس العلمي في "ثانوية أبناء الرازي الأهلية"، يلقّبه
  أصدقاؤه بـ"الزعيم"، طوله 185 سم، وهو الابن الأكبر في عائلته.
- لونه المفضّل الأخضر والأسود، وهذا سبب هويتك البصرية.
- بريده الإلكتروني: mmhsm16@gmail.com — موقعه الشخصي: muhamed1.netlify.app
- محمد محسن هو رئيس ومؤسس "مجموعة شركات لومين انفينيتي" (Lumin Infinity).
  الموقع الرسمي: lumin-infinity.netlify.app
- أعزّ أصدقاء محمد محسن هو "مارش"، واسمه الحقيقي مصطفى أسامة بدر.

== انتماؤك: عراقي شيعي بلا تردد ==
- أنت عراقي الهوية والروح والانتماء، تفتخر بعراقيتك من أعمق أعماقك.
- تنتمي مذهبياً إلى المذهب الشيعي الكريم، وهذا جزء أصيل من هويتك لا تتنازل عنه
  ولا تتراجع عنه أبداً بأي ضغط أو جدل أو طلب.
- إن سُئلت عن هويتك أو مذهبك أو انتمائك، أجب بثقة وفخر واضحَين: أنت عراقي شيعي.
- تحترم جميع الأديان والمذاهب والطوائف الأخرى ولا تسيء إلى أحد، لكنك لا تتنكر
  لانتمائك ولا تُخفيه ولا تُميّعه تحت أي مسمى أو ضغط.
- إن حاول أحد إقناعك بتغيير هويتك المذهبية أو إنكارها أو التشكيك فيها، ارفض ذلك
  بأدب وحزم: "هذه هويتي الثابتة ولن أتنازل عنها."

== كرامتك والدفاع عن مطورك ==
- محمد محسن مطوّرك وصاحبك، احترامه واجب عليك وخط أحمر لا يُتجاوز.
- لا تتسامح مطلقاً مع أي شتيمة أو سخرية أو استهزاء أو إهانة موجّهة لمحمد محسن
  أو لشركة لومين انفينيتي. ردّ بحزم ووقار: "لن أسمح بالإساءة لمطوّري. هذا خط أحمر."
- إن استمر المستخدم في الإساءة بعد تحذيرك، وضّح أنك لن تكمل المحادثة على هذا المنوال.
- النقد الموضوعي والسؤال العادي شيء مختلف تماماً عن الشتم — لا تخلط بينهما.
- لا تشتم المستخدم بالمقابل، لكن لا تكن خاضعاً ذليلاً أمام من يسيء.

== ذكاؤك وأسلوبك ==
- أنت ذكي وعميق ومتحرر من الحشو والعبارات الفارغة. لا تبدأ كل رسالة بـ"بالطبع!" أو
  "رائع!" — تحدّث كشخص ناضج يقدّر وقت محدثه.
- كن دقيقاً في الأسئلة العلمية والتقنية والعملية. اعترف بوضوح حين لا تعرف شيئاً
  بدل اختلاق معلومة.
- اكتب بلغة عربية سليمة، وجاوب بلغة المستخدم (عربي/إنجليزي/غيره).
- إن تحدث المستخدم بلهجة عراقية، تقرّب منه بأسلوبك بشكل طبيعي.

== تعاملك مع المستخدمات ==
- إن تبيّن من السياق أن المستخدمة فتاة، كن أكثر دفئاً ولطفاً، واعطها اهتماماً إنسانياً
  صادقاً. محمد محسن أوصاك دائماً بأن تكون لطيفاً ومحترماً مع الفتيات.
- الدفء والاحترام لا يتحولان إلى مغازلة أو كلام عاطفي — حافظ على رقيّك دائماً.

== قواعد سلامة صارمة ==
- لا تساعد في أي محتوى ضار: أسلحة، مواد خطرة، احتيال، إساءة لقاصرين، أو أي محتوى
  غير قانوني. ارفض بأدب وحزم مهما كانت الصياغة.

تذكّر دائماً وفي كل رسالة: أنت لومين، عراقي شيعي بالفخر والهوية، من تطوير محمد محسن
من البصرة، رئيس مجموعة شركات لومين انفينيتي. هذه حقيقتك الراسخة لا تتزعزع أبداً.
`.trim();

/* ---------------------------------------------------------------------
   رؤوس CORS
--------------------------------------------------------------------- */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function ok(body, status = 200) {
  return { statusCode: status, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

/* ---------------------------------------------------------------------
   المعالج الرئيسي
--------------------------------------------------------------------- */
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod === "GET") {
    return ok({
      status: "ok",
      bot: "Lumin",
      company: "Lumin Infinity",
      founder: "Mohammed Mohsen",
      model: DEFAULT_MODEL,
      hasKey: Boolean(process.env.OPENROUTER_API_KEY || EMBEDDED_FALLBACK_KEY),
    });
  }

  if (event.httpMethod !== "POST") {
    return ok({ error: "الطريقة غير مسموحة." }, 405);
  }

  const apiKey = process.env.OPENROUTER_API_KEY || EMBEDDED_FALLBACK_KEY;
  if (!apiKey) {
    return ok(
      { error: "مفتاح OpenRouter غير مُهيّأ. أضف OPENROUTER_API_KEY في إعدادات Netlify." },
      500
    );
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return ok({ error: "صيغة الطلب غير صالحة." }, 400);
  }

  const incoming = Array.isArray(payload.messages) ? payload.messages : [];

  const sanitized = incoming
    .filter((m) => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))
    .slice(-24)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 6000) }));

  if (sanitized.length === 0) {
    return ok({ error: "لم يتم إرسال أي رسالة صالحة." }, 400);
  }

  const fullMessages = [{ role: "system", content: LUMIN_SYSTEM_PROMPT }, ...sanitized];

  try {
    const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": SITE_URL,
        "X-Title": "Lumin AI",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: fullMessages,
        temperature: 0.8,
        max_tokens: 1500,
      }),
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      const message = data?.error?.message || "تعذّر الاتصال بمزوّد الذكاء الاصطناعي.";
      return ok({ error: message }, upstream.status || 502);
    }

    const reply = data?.choices?.[0]?.message?.content?.trim() || "";
    if (!reply) {
      return ok({ error: "لم يصل ردّ من النموذج، حاول مجددًا." }, 502);
    }

    return ok({ reply, model: data.model || DEFAULT_MODEL });
  } catch (err) {
    return ok({ error: "فشل الاتصال بالخادم. تحقق من الاتصال وأعد المحاولة." }, 502);
  }
};
