namespace Circloo.Api.Circles;

/// <summary>One activity an animator can run in a circle (spec 003, FR-306).</summary>
/// <param name="SparkKind">For deck-based activities, the seed spark kind the free dev responder draws from.</param>
/// <param name="Brief">What circloo should do, for the model (English; the reply language is set separately).</param>
/// <param name="Lines">Openers for the free dev responder, per language: one is picked per turn.</param>
public sealed record ActivityDef(string Id, string Category, string? SparkKind, string Brief, IReadOnlyDictionary<string, string[]> Lines);

public static class ActivityCatalog
{
    public static readonly string[] Categories = ["icebreakers", "energizers", "retro", "decide", "present"];

    private static Dictionary<string, string[]> L(string[] en, string[] fr, string[] ar, string[] es) =>
        new() { ["en"] = en, ["fr"] = fr, ["ar"] = ar, ["es"] = es };

    private static readonly Dictionary<string, string[]> None = L([], [], [], []);

    public static readonly IReadOnlyList<ActivityDef> All =
    [
        new("quick-question", "icebreakers", "icebreaker",
            "Ask the group one warm, easy icebreaker question everyone can answer in a sentence. Then react briefly to answers and offer the next question when asked.", None),
        new("would-you-rather", "icebreakers", "would-you-rather",
            "Run a 'would you rather' round: give two funny, harmless options and invite everyone to pick and say why.", None),
        new("joke-round", "icebreakers", "joke",
            "Tell one short, kind, family-friendly joke, then invite people to share their own best clean joke.", None),
        new("riddle-time", "icebreakers", "riddle",
            "Give one riddle without the answer; reveal the answer only when the animator asks or after people have guessed.", None),
        new("two-truths", "icebreakers", null,
            "Explain 'two truths and a lie' in two sentences and invite the first volunteer to share three statements; others guess the lie.",
            L(["Two truths and a lie! Share three things about you, two true and one invented. Everyone else guesses the lie. Who goes first?"],
              ["Deux vérités, un mensonge ! Partage trois choses sur toi : deux vraies, une inventée. Les autres devinent le mensonge. Qui commence ?"],
              ["حقيقتان وكذبة! شارك ثلاثة أشياء عنك: اثنان صحيحان وواحد مختلق. والبقية يخمّنون الكذبة. من يبدأ؟"],
              ["¡Dos verdades y una mentira! Comparte tres cosas sobre ti: dos verdaderas y una inventada. Los demás adivinan la mentira. ¿Quién empieza?"])),
        new("one-word", "energizers", null,
            "Ask everyone to describe how they arrive today in exactly one word, then reflect the overall mood of the group kindly.",
            L(["One word each: how are you arriving today?", "Same game, new word: what do you need most this week?"],
              ["Un seul mot chacun : comment arrives-tu aujourd'hui ?", "Même jeu, nouveau mot : de quoi as-tu le plus besoin cette semaine ?"],
              ["كلمة واحدة لكلٍّ منكم: كيف تصلون اليوم؟", "اللعبة نفسها بكلمة جديدة: ما الذي تحتاجه أكثر هذا الأسبوع؟"],
              ["Una palabra cada uno: ¿cómo llegas hoy?", "Mismo juego, nueva palabra: ¿qué necesitas más esta semana?"])),
        new("mood-weather", "energizers", null,
            "Ask everyone to share their mood as a weather report (sunny, cloudy, stormy...) with one sentence why, then summarise the circle's weather.",
            L(["Weather report time! If your mood were the weather right now, what would it be, and why?"],
              ["Bulletin météo ! Si ton humeur était la météo maintenant, ce serait quoi, et pourquoi ?"],
              ["وقت النشرة الجوية! لو كان مزاجك طقسًا الآن، فماذا سيكون، ولماذا؟"],
              ["¡Hora del parte meteorológico! Si tu ánimo fuera el tiempo ahora mismo, ¿cuál sería y por qué?"])),
        new("story-chain", "energizers", null,
            "Start a funny collaborative story with one sentence; each person adds the next sentence. Keep it kind and absurd.",
            L(["Let's write a story together, one sentence each. I start: On Monday morning, the office plant woke up and asked for a coffee…"],
              ["Écrivons une histoire ensemble, une phrase chacun. Je commence : lundi matin, la plante du bureau s'est réveillée et a demandé un café…"],
              ["لنكتب قصة معًا، جملة لكل واحد. أبدأ أنا: صباح الاثنين، استيقظت نبتة المكتب وطلبت فنجان قهوة…"],
              ["Escribamos una historia juntos, una frase cada uno. Empiezo yo: el lunes por la mañana, la planta de la oficina se despertó y pidió un café…"])),
        new("start-stop-continue", "retro", null,
            "Facilitate a Start / Stop / Continue retrospective: ask for items in each column, then group similar ideas and propose two concrete next steps.",
            L(["Retro time: Start, Stop, Continue. Share one thing we should start doing, one to stop, and one to keep.", "When you're ready, the animator can ask me to sum up the ideas."],
              ["C'est l'heure de la rétro : Commencer, Arrêter, Continuer. Partage une chose à commencer, une à arrêter et une à garder.", "Quand vous êtes prêts, l'animateur peut me demander de résumer les idées."],
              ["وقت المراجعة: نبدأ، نتوقف، نستمر. شارك شيئًا نبدأ به، وشيئًا نتوقف عنه، وشيئًا نحافظ عليه.", "عندما تكونون جاهزين، يمكن للمنشّط أن يطلب مني تلخيص الأفكار."],
              ["Hora de la retro: Empezar, Dejar, Continuar. Comparte algo que deberíamos empezar, algo que dejar y algo que mantener.", "Cuando estéis listos, el animador puede pedirme que resuma las ideas."])),
        new("went-well", "retro", null,
            "Facilitate a 'went well / to improve' retro; collect both, then highlight patterns and one improvement to try.",
            L(["What went well recently, and what could we improve? One of each, please."],
              ["Qu'est-ce qui s'est bien passé récemment, et que pourrait-on améliorer ? Un de chaque, s'il te plaît."],
              ["ما الذي سار جيدًا مؤخرًا، وما الذي يمكننا تحسينه؟ واحد من كل نوع من فضلكم."],
              ["¿Qué ha salido bien últimamente y qué podríamos mejorar? Uno de cada, por favor."])),
        new("kudos", "retro", null,
            "Run a kudos round: invite everyone to thank someone in the circle for something specific; celebrate warmly.",
            L(["Kudos round! Thank someone here for something specific they did. Small things count."],
              ["Tour des bravos ! Remercie quelqu'un ici pour une chose précise. Les petites choses comptent."],
              ["جولة الشكر! اشكر شخصًا هنا على شيء محدد فعله. الأشياء الصغيرة مهمة."],
              ["¡Ronda de agradecimientos! Agradece a alguien de aquí algo concreto que hizo. Las cosas pequeñas cuentan."])),
        new("quick-poll", "decide", null,
            "Help the animator run a quick poll: restate the question neutrally, list clear options, ask people to vote by writing the option, then count the votes from the chat.",
            L(["Quick poll! Animator, what should we decide? Tell me the question and the options, and everyone votes in the chat."],
              ["Sondage express ! Animateur, que décide-t-on ? Donne-moi la question et les options, et chacun vote dans la discussion."],
              ["تصويت سريع! أيها المنشّط، ماذا نقرر؟ أخبرني بالسؤال والخيارات، وليصوّت الجميع في المحادثة."],
              ["¡Encuesta rápida! Animador, ¿qué decidimos? Dime la pregunta y las opciones, y todos votan en el chat."])),
        new("agree-or-not", "decide", null,
            "Share one light statement and ask everyone whether they agree or not and why; then tell the group who agrees and who doesn't, by name.",
            L(["Agree or not? \"Meetings would be better if they all started with a joke.\" Say agree or disagree, and why!"],
              ["D'accord ou pas ? « Les réunions seraient meilleures si elles commençaient toutes par une blague. » Dis d'accord ou pas d'accord, et pourquoi !"],
              ["موافق أم لا؟ «ستكون الاجتماعات أفضل لو بدأت كلها بنكتة.» قل موافق أو غير موافق، ولماذا!"],
              ["¿De acuerdo o no? «Las reuniones serían mejores si todas empezaran con un chiste.» Di de acuerdo o en desacuerdo, ¡y por qué!"])),
        new("brainstorm", "decide", null,
            "Facilitate a brainstorm on the board: invite ideas as sticky notes, then group similar ones, highlight the most-voted and propose next steps.",
            L(["Brainstorm time! Put every idea on the board, even the wild ones. Vote with your dots when the ideas slow down."],
              ["Place au remue-méninges ! Mettez toutes vos idées sur le tableau, même les plus folles. Votez avec vos points quand les idées ralentissent."],
              ["وقت العصف الذهني! ضعوا كل فكرة على اللوحة، حتى الجامحة منها. صوّتوا بنقاطكم عندما تهدأ الأفكار."],
              ["¡Lluvia de ideas! Poned todas las ideas en el tablero, incluso las más locas. Votad con vuestros puntos cuando las ideas se calmen."])),
        new(Canvas, "decide", null,
            "Facilitate a live canvas where everyone drops sticky notes anywhere: encourage ideas, then group what belongs together and sum up the canvas when asked.",
            L(["Live canvas! Double-click anywhere to drop a note, drag notes around and give them colours. Ask me to sum it up when you're ready."],
              ["Toile en direct ! Double-clique n'importe où pour poser une note, déplace-les et donne-leur des couleurs. Demande-moi un résumé quand vous êtes prêts."],
              ["لوحة حرّة مباشرة! انقر مرتين في أي مكان لتضع ملاحظة، واسحب الملاحظات ولوّنها. اطلبوا مني التلخيص عندما تكونون جاهزين."],
              ["¡Lienzo en vivo! Haz doble clic en cualquier sitio para poner una nota, arrastra las notas y dales color. Pedidme un resumen cuando estéis listos."])),
        new(Presentation, "present", null,
            "The animator presents slides with polls and quizzes; stay quiet unless asked, then help explain results briefly.", None),
    ];

    private static readonly Dictionary<string, ActivityDef> ById = All.ToDictionary(a => a.Id);

    public static ActivityDef? Find(string? id) => id is not null && ById.TryGetValue(id, out var a) ? a : null;

    /// <summary>Activities with a live board (spec 004) and their columns.</summary>
    private static readonly Dictionary<string, string[]> BoardColumns = new()
    {
        ["start-stop-continue"] = ["start", "stop", "continue"],
        ["went-well"] = ["well", "improve"],
        ["kudos"] = ["kudos"],
        ["brainstorm"] = ["ideas", "maybe", "next"],
    };

    public static string[] ColumnsOf(string? activityId) => activityId is not null && BoardColumns.TryGetValue(activityId, out var c) ? c : [];

    public const int MaxNotes = 200;
    public const int VotesPerMember = 3;
    public const int NoteMax = 140;
    public static readonly string[] NoteColors = ["yellow", "pink", "blue", "green", "violet"];

    public const int MaxPerCircle = 8;

    /// <summary>Live presentations (spec 006): the animator's deck with polls and quizzes, everyone in sync.</summary>
    public const string Presentation = "presentation";

    /// <summary>The live canvas (issue #93): notes anywhere, styled by their author, cursors for everyone.</summary>
    public const string Canvas = "canvas";
    public const int MaxCanvasNotes = 300;
    /// <summary>Notes and cursors stay within this many pixels of the canvas centre.</summary>
    public const double CanvasExtent = 4000;
    public static readonly string[] CanvasColors = ["yellow", "pink", "blue", "green", "violet", "white"];
    public static readonly string[] CanvasSizes = ["s", "m", "l"];
    public static readonly string[] CanvasShapes = ["square", "round"];
    public static readonly string[] CanvasStickers = ["heart", "star", "thumbs", "laugh", "idea"];

    public static bool IsCanvasPoint(double x, double y) =>
        double.IsFinite(x) && double.IsFinite(y) && Math.Abs(x) <= CanvasExtent && Math.Abs(y) <= CanvasExtent;
}
