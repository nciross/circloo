namespace Circloo.Api.Pirikoo;

/// <summary>
/// The built-in guide behind Pirikoo in dev (and its vocabulary). Topics are recognised on text normalized by
/// <see cref="Ai.SafetyPolicy.Normalize"/> (lower case, no accents or Arabic marks), first match wins.
/// UI labels in quotes match the app's own strings in each language.
/// </summary>
public static class PirikooText
{
    // Product names come first: "share results to Teams" is about integrations, not invitations.
    // Latin words start with a space (they match a word start); Arabic ones match anywhere, so words with clitics match too.
    public static readonly (string Id, string[] Words)[] Topics =
    [
        ("integrations", [" teams", " jira", " notion", " confluence", " salesforce", " integrat", " integracion", "تكامل"]),
        ("invite", [" invit", " link", " join", " share", " code ", " lien", " rejoin", " partag", " enlace", " unir", " compart", "دعوه", " ادع", "رابط", "انضم"]),
        ("icebreaker", [" icebreak", " ice ", " brise", " glace", " rompehielo", " كسر", "الجليد"]),
        ("board", [" board", " note", " vote", " dot", " sticky", " tableau", " voter", " tablero", " votar", " punto", "لوحه", "لوحات", "ملاحظ", "تصويت", "نقاط"]),
        ("activity", [" activit", " start", " retro", " brainstorm", " lancer", " commencer", " actividad", " empezar", " iniciar", "نشاط", " ابدا"]),
        ("characters", [" character", " avatar", " personnage", " personaje", "شخصيه"]),
        ("ai", [" ai ", " ia ", " panda", " gpt", " foundry", "ذكاء"]),
        ("privacy", [" privacy", " private", " data", " secur", " confidential", " prive", " donnee", " privacidad", " privado", " datos", "خصوص", " خاص", "الخاص", "بيانات", "امان"]),
        ("settings", [" language", " theme", " dark", " setting", " langue", " sombre", " parametre", " reglage", " idioma", " oscuro", " ajuste", "لغه", "داكن", "اعداد"]),
        ("thanks", [" thank", " merci", " gracias", "شكرا"]),
        ("greet", [" hi ", " hello", " hey ", " bonjour", " salut", " hola", " buenos", "مرحبا", "السلام", "اهلا"]),
    ];

    public static readonly Dictionary<string, Dictionary<string, string>> Answers = new()
    {
        ["en"] = new()
        {
            ["invite"] = "To invite people, open your circle and use “Invite people”: copy the link or share the 10-character code. Everyone joins with a name and a character, no account needed.",
            ["integrations"] = "Connect Teams, Jira, Confluence or Notion on the Integrations page. Then, in a circle, the animator uses “Send results”: a card in Teams, tasks in Jira, or a page in Confluence or Notion.",
            ["icebreaker"] = "Here’s one to try: «{0}» On the Icebreakers page you can deal more by audience, mood and kind.",
            ["board"] = "On a board, add notes in each column, then everyone gets 3 dots to vote. Sort by “Most voted first” and ask circloo to sum it up.",
            ["activity"] = "Only the animator starts activities: in the circle, pick one under “Start an activity”. Icebreakers warm people up; retro and decide activities open a live board.",
            ["characters"] = "Everyone picks one of 12 characters when joining a circle. Each one is used once per circle, so everybody is easy to spot.",
            ["ai"] = "circloo’s panda runs the activity chat for the group. I’m Pirikoo, your personal guide: I answer questions and suggest next steps, and I never do anything without your OK. AI can make mistakes.",
            ["privacy"] = "Circles are private: only people with the link can join, and guests never see your account. Our chat stays in this browser tab; I don’t keep it.",
            ["settings"] = "In Settings you can change your name, your language, light or dark theme, and turn suggestions on or off. You can also ask me: “switch to dark mode”.",
            ["thanks"] = "Happy to help! Ask me anything else.",
            ["greet"] = "Hi! I’m Pirikoo. Ask me how to invite people, run an activity, use boards, or send results to Teams or Jira.",
            ["here.animatorIdle"] = "You’re running “{0}”. Pick an activity under “Start an activity”: an icebreaker is a great warm-up. If someone is missing, share the link from “Invite people”.",
            ["here.animatorLive"] = "“{0}” is live. Ask circloo for the next question or a summary at the bottom, switch to the board if there is one, and end the activity when you’re done.",
            ["here.participantIdle"] = "You’re in “{0}”. The animator will start an activity soon; it will appear right here.",
            ["here.participantLive"] = "An activity is running in “{0}”. Answer in the chat; on a board, add notes and use your 3 dots.",
            ["here.icebreakers"] = "Here you deal cards by audience, mood and kind, run a round with a timer, and ask for fresh AI cards.",
            ["here.integrations"] = "Connect a service here, test it, then use “Send results” in a circle to share what you decided.",
            ["here.home"] = "From Home you can create a circle, reopen one, or play today’s icebreaker. A circle is a live session: pick activities, share a link, play together.",
        },
        ["fr"] = new()
        {
            ["invite"] = "Pour inviter, ouvre ton cercle et utilise « Inviter » : copie le lien ou partage le code de 10 caractères. Chacun rejoint avec un prénom et un personnage, sans compte.",
            ["integrations"] = "Connecte Teams, Jira, Confluence ou Notion dans Intégrations. Ensuite, dans un cercle, l’animateur utilise « Envoyer les résultats » : une carte dans Teams, des tâches dans Jira, ou une page dans Confluence ou Notion.",
            ["icebreaker"] = "En voici un à essayer : « {0} » Dans Brise-glace, tu peux en tirer d’autres par public, ambiance et type.",
            ["board"] = "Sur un tableau, ajoute des notes dans chaque colonne, puis chacun a 3 points pour voter. Trie par « Les plus votées en premier » et demande un résumé à circloo.",
            ["activity"] = "Seul l’animateur lance les activités : dans le cercle, choisis-en une sous « Lancer une activité ». Les brise-glace réchauffent l’ambiance ; les rétros et décisions ouvrent un tableau en direct.",
            ["characters"] = "Chacun choisit un des 12 personnages en rejoignant un cercle. Chaque personnage n’est pris qu’une fois par cercle, pour repérer tout le monde facilement.",
            ["ai"] = "Le panda de circloo anime la discussion de l’activité pour le groupe. Moi, c’est Pirikoo, ton guide personnel : je réponds à tes questions et je suggère la suite, sans jamais agir sans ton accord. L’IA peut se tromper.",
            ["privacy"] = "Les cercles sont privés : seules les personnes qui ont le lien peuvent rejoindre, et les invités ne voient jamais ton compte. Notre discussion reste dans cet onglet ; je ne la garde pas.",
            ["settings"] = "Dans Paramètres, tu changes ton prénom, ta langue, le thème clair ou sombre, et tu actives ou non les suggestions. Tu peux aussi me dire : « passe en mode sombre ».",
            ["thanks"] = "Avec plaisir ! Demande-moi autre chose quand tu veux.",
            ["greet"] = "Salut ! Moi, c’est Pirikoo. Demande-moi comment inviter, lancer une activité, utiliser les tableaux ou envoyer les résultats vers Teams ou Jira.",
            ["here.animatorIdle"] = "Tu animes « {0} ». Choisis une activité sous « Lancer une activité » : un brise-glace, c’est parfait pour commencer. S’il manque quelqu’un, partage le lien depuis « Inviter ».",
            ["here.animatorLive"] = "« {0} » est en direct. Demande à circloo la question suivante ou un résumé en bas, passe au tableau s’il y en a un, et termine l’activité quand c’est fini.",
            ["here.participantIdle"] = "Tu es dans « {0} ». L’animateur va lancer une activité ; elle apparaîtra ici.",
            ["here.participantLive"] = "Une activité est en cours dans « {0} ». Réponds dans la discussion ; sur un tableau, ajoute des notes et utilise tes 3 points.",
            ["here.icebreakers"] = "Ici, tu tires des cartes par public, ambiance et type, tu lances un tour avec minuteur et tu demandes des cartes IA fraîches.",
            ["here.integrations"] = "Connecte un service ici, teste-le, puis utilise « Envoyer les résultats » dans un cercle pour partager vos décisions.",
            ["here.home"] = "Depuis l’accueil, tu crées un cercle, tu en rouvres un ou tu joues au brise-glace du jour. Un cercle est une session en direct : choisis des activités, partage un lien, jouez ensemble.",
        },
        ["es"] = new()
        {
            ["invite"] = "Para invitar, abre tu círculo y usa «Invitar»: copia el enlace o comparte el código de 10 caracteres. Cada uno entra con un nombre y un personaje, sin cuenta.",
            ["integrations"] = "Conecta Teams, Jira, Confluence o Notion en Integraciones. Luego, en un círculo, el animador usa «Enviar resultados»: una tarjeta en Teams, tareas en Jira o una página en Confluence o Notion.",
            ["icebreaker"] = "Prueba con este: «{0}» En Rompehielos puedes sacar más por público, tono y tipo.",
            ["board"] = "En un tablero, añade notas en cada columna y luego cada uno tiene 3 puntos para votar. Ordena por «Más votadas primero» y pide a circloo un resumen.",
            ["activity"] = "Solo el animador empieza actividades: en el círculo, elige una en «Empezar una actividad». Los rompehielos animan; las retros y decisiones abren un tablero en vivo.",
            ["characters"] = "Cada uno elige uno de los 12 personajes al unirse a un círculo. Cada personaje se usa una sola vez por círculo, así todos se reconocen fácilmente.",
            ["ai"] = "El panda de circloo dirige el chat de la actividad para el grupo. Yo soy Pirikoo, tu guía personal: respondo tus preguntas y sugiero los siguientes pasos, y nunca hago nada sin tu permiso. La IA puede equivocarse.",
            ["privacy"] = "Los círculos son privados: solo entra quien tiene el enlace, y los invitados nunca ven tu cuenta. Nuestra conversación se queda en esta pestaña; no la guardo.",
            ["settings"] = "En Ajustes cambias tu nombre, tu idioma, el tema claro u oscuro, y activas o no las sugerencias. También puedes decirme: «cambiar a modo oscuro».",
            ["thanks"] = "¡Con gusto! Pregúntame lo que quieras.",
            ["greet"] = "¡Hola! Soy Pirikoo. Pregúntame cómo invitar, empezar una actividad, usar los tableros o enviar resultados a Teams o Jira.",
            ["here.animatorIdle"] = "Diriges «{0}». Elige una actividad en «Empezar una actividad»: un rompehielos es perfecto para calentar. Si falta alguien, comparte el enlace desde «Invitar».",
            ["here.animatorLive"] = "«{0}» está en vivo. Pide a circloo la siguiente pregunta o un resumen abajo, cambia al tablero si lo hay y termina la actividad cuando acabéis.",
            ["here.participantIdle"] = "Estás en «{0}». El animador empezará una actividad enseguida; aparecerá aquí.",
            ["here.participantLive"] = "Hay una actividad en «{0}». Responde en el chat; en un tablero, añade notas y usa tus 3 puntos.",
            ["here.icebreakers"] = "Aquí sacas tarjetas por público, tono y tipo, haces una ronda con temporizador y pides tarjetas nuevas de IA.",
            ["here.integrations"] = "Conecta un servicio aquí, pruébalo y luego usa «Enviar resultados» en un círculo para compartir lo que decidisteis.",
            ["here.home"] = "Desde el inicio creas un círculo, vuelves a uno o juegas al rompehielos del día. Un círculo es una sesión en vivo: elige actividades, comparte un enlace y jugad juntos.",
        },
        ["ar"] = new()
        {
            ["invite"] = "للدعوة، افتح دائرتك واستخدم «ادعُ الناس»: انسخ الرابط أو شارك الرمز المكوّن من 10 أحرف. ينضم كل واحد باسم وشخصية، بلا حساب.",
            ["integrations"] = "اربط Teams أو Jira أو Confluence أو Notion من صفحة التكاملات. ثم في الدائرة يستخدم المنشّط «أرسل النتائج»: بطاقة في Teams أو مهام في Jira أو صفحة في Confluence أو Notion.",
            ["icebreaker"] = "جرّب هذا: «{0}» وفي صفحة كسر الجليد يمكنك سحب المزيد حسب الجمهور والأسلوب والنوع.",
            ["board"] = "على اللوحة أضف ملاحظات في كل عمود، ثم يحصل كل واحد على 3 نقاط للتصويت. رتّب حسب «الأكثر تصويتًا أولًا» واطلب من circloo ملخصًا.",
            ["activity"] = "المنشّط وحده يبدأ الأنشطة: في الدائرة اختر نشاطًا من «ابدأ نشاطًا». أسئلة كسر الجليد تكسر الرهبة، وأنشطة المراجعة والقرار تفتح لوحة مباشرة.",
            ["characters"] = "يختار كل واحد إحدى 12 شخصية عند الانضمام إلى دائرة. كل شخصية تُستخدم مرة واحدة في الدائرة، فيسهل التعرف على الجميع.",
            ["ai"] = "باندا circloo يدير محادثة النشاط للمجموعة. وأنا بيريكو، دليلك الشخصي: أجيب عن أسئلتك وأقترح الخطوات التالية، ولا أفعل شيئًا دون موافقتك. قد يخطئ الذكاء الاصطناعي.",
            ["privacy"] = "الدوائر خاصة: لا ينضم إلا من لديه الرابط، ولا يرى الضيوف حسابك أبدًا. محادثتنا تبقى في هذا التبويب، ولا أحتفظ بها.",
            ["settings"] = "في الإعدادات تغيّر اسمك ولغتك والسمة الفاتحة أو الداكنة، وتفعّل الاقتراحات أو توقفها. ويمكنك أن تقول لي: «انتقل إلى الوضع الداكن».",
            ["thanks"] = "بكل سرور! اسألني عن أي شيء آخر.",
            ["greet"] = "أهلًا! أنا بيريكو. اسألني كيف تدعو الناس، أو تبدأ نشاطًا، أو تستخدم اللوحات، أو ترسل النتائج إلى Teams أو Jira.",
            ["here.animatorIdle"] = "أنت تدير «{0}». اختر نشاطًا من «ابدأ نشاطًا»: سؤال لكسر الجليد بداية ممتازة. وإن غاب أحد، شارك الرابط من «ادعُ الناس».",
            ["here.animatorLive"] = "«{0}» مباشرة الآن. اطلب من circloo السؤال التالي أو ملخصًا في الأسفل، وانتقل إلى اللوحة إن وُجدت، وأنهِ النشاط عند الانتهاء.",
            ["here.participantIdle"] = "أنت في «{0}». سيبدأ المنشّط نشاطًا قريبًا، وسيظهر هنا.",
            ["here.participantLive"] = "يجري نشاط في «{0}». أجب في المحادثة، وعلى اللوحة أضف ملاحظات واستخدم نقاطك الثلاث.",
            ["here.icebreakers"] = "هنا تسحب البطاقات حسب الجمهور والأسلوب والنوع، وتبدأ جولة بمؤقّت، وتطلب بطاقات جديدة بالذكاء الاصطناعي.",
            ["here.integrations"] = "اربط خدمة هنا واختبرها، ثم استخدم «أرسل النتائج» في الدائرة لمشاركة ما قررتموه.",
            ["here.home"] = "من الرئيسية تنشئ دائرة أو تعود إلى واحدة أو تلعب سؤال اليوم. الدائرة جلسة مباشرة: اختر الأنشطة، وشارك رابطًا، والعبوا معًا.",
        },
    };

    public static string Get(string lang, string key) =>
        (Answers.TryGetValue(lang, out var a) && a.TryGetValue(key, out var v)) ? v : Answers["en"][key];
}
