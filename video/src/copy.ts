export type Lang = 'en' | 'fr' | 'ar' | 'es'

/** Every word in the tour, per language. Short lines: they must read in two seconds. */
export const COPY: Record<Lang, {
  tagline: string
  circle: string
  chat: string
  question: string
  replies: [string, string]
  board: string
  columns: [string, string, string]
  notes: [string, string, string, string, string]
  send: string
  cta: string
  free: string
  canvas: { notes: [string, string, string, string]; names: [string, string, string] }
  pirikoo: { question: string; writing: string; answer: string }
}> = {
  en: {
    tagline: 'Your circle, in one private space.',
    circle: 'One link. Everyone joins with a name and a character.',
    chat: 'circloo runs the activity with you.',
    question: 'What small thing made you smile this week?',
    replies: ['My cat learned to open doors!', 'A stranger paid for my coffee.'],
    board: 'Decide together, live.',
    columns: ['Start', 'Stop', 'Continue'],
    notes: ['Demo on Fridays', 'Meetings without agenda', 'Shared lunch', 'Pair on hard tickets', 'Code reviews in a day'],
    send: 'Results go where your team works.',
    cta: 'Start your circle',
    free: 'Free during early access',
    canvas: { notes: ['Beach day', 'Kayak tour!', 'Night market', 'Budget: 50 each'], names: ['Mia', 'Kenji', 'Lucía'] },
    pirikoo: { question: 'How do I invite people?', writing: 'Pirikoo is writing', answer: 'Open your circle and use “Invite people”: copy the link or share the code. Everyone joins with a name and a character.' },
  },
  fr: {
    tagline: 'Ton cercle, dans un espace privé.',
    circle: 'Un lien. Chacun rejoint avec un prénom et un personnage.',
    chat: 'circloo anime l’activité avec toi.',
    question: 'Quelle petite chose t’a fait sourire cette semaine ?',
    replies: ['Mon chat sait ouvrir les portes !', 'Un inconnu m’a offert un café.'],
    board: 'Décidez ensemble, en direct.',
    columns: ['Commencer', 'Arrêter', 'Continuer'],
    notes: ['Démo le vendredi', 'Réunions sans ordre du jour', 'Déjeuner partagé', 'Binômes sur les tickets durs', 'Revues de code en un jour'],
    send: 'Les résultats vont là où ton équipe travaille.',
    cta: 'Créer mon cercle',
    free: 'Gratuit pendant l’accès anticipé',
    canvas: { notes: ['Journée plage', 'Balade en kayak !', 'Marché de nuit', 'Budget : 50 chacun'], names: ['Mia', 'Kenji', 'Lucía'] },
    pirikoo: { question: 'Comment inviter des gens ?', writing: 'Pirikoo écrit', answer: 'Ouvre ton cercle et utilise « Inviter » : copie le lien ou partage le code. Chacun rejoint avec un prénom et un personnage.' },
  },
  ar: {
    tagline: 'دائرتك في مساحة خاصة واحدة.',
    circle: 'رابط واحد. ينضم كل واحد باسم وشخصية.',
    chat: 'يدير circloo النشاط معك.',
    question: 'ما الشيء الصغير الذي جعلك تبتسم هذا الأسبوع؟',
    replies: ['تعلّمت قطتي فتح الأبواب!', 'دفع غريب ثمن قهوتي.'],
    board: 'قرّروا معًا، مباشرة.',
    columns: ['نبدأ', 'نتوقف', 'نستمر'],
    notes: ['عرض كل جمعة', 'اجتماعات بلا جدول', 'غداء مشترك', 'العمل بالثنائيات', 'مراجعة الكود في يوم'],
    send: 'تصل النتائج إلى حيث يعمل فريقك.',
    cta: 'ابدأ دائرتك',
    free: 'مجانًا خلال الوصول المبكر',
    canvas: { notes: ['يوم على الشاطئ', 'جولة بالكاياك!', 'سوق ليلي', 'الميزانية: 50 لكل واحد'], names: ['مايا', 'كينجي', 'لوسيا'] },
    pirikoo: { question: 'كيف أدعو الناس؟', writing: 'بيريكو يكتب', answer: 'افتح دائرتك واستخدم «ادعُ الناس»: انسخ الرابط أو شارك الرمز. ينضم كل واحد باسم وشخصية.' },
  },
  es: {
    tagline: 'Tu círculo, en un espacio privado.',
    circle: 'Un enlace. Cada uno entra con un nombre y un personaje.',
    chat: 'circloo dirige la actividad contigo.',
    question: '¿Qué pequeña cosa te hizo sonreír esta semana?',
    replies: ['¡Mi gato aprendió a abrir puertas!', 'Un desconocido pagó mi café.'],
    board: 'Decidid juntos, en vivo.',
    columns: ['Empezar', 'Dejar', 'Continuar'],
    notes: ['Demo los viernes', 'Reuniones sin agenda', 'Comida compartida', 'Parejas en tickets difíciles', 'Revisiones en un día'],
    send: 'Los resultados van adonde trabaja tu equipo.',
    cta: 'Crea tu círculo',
    free: 'Gratis durante el acceso anticipado',
    canvas: { notes: ['Día de playa', '¡Ruta en kayak!', 'Mercado nocturno', 'Presupuesto: 50 cada uno'], names: ['Mia', 'Kenji', 'Lucía'] },
    pirikoo: { question: '¿Cómo invito a la gente?', writing: 'Pirikoo está escribiendo', answer: 'Abre tu círculo y usa «Invitar»: copia el enlace o comparte el código. Cada uno entra con un nombre y un personaje.' },
  },
}
