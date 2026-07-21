import type { SupportedLang } from '../store/languageStore';

/**
 * Landing-page copy, separate from `translations.ts`.
 *
 * The app's translation file is product UI — labels a signed-in user reads all day. This is
 * marketing prose for people who have never seen the product, written per language rather
 * than translated word-for-word, because the two have different jobs and different tone.
 *
 * The demo exchanges are translated too, deliberately. A page that claims to answer in
 * Sinhala and Tamil while showing only English examples argues against itself.
 */

export interface DemoExchange {
  /** Shown as a chip above the exchange. */
  subject: string;
  question: string;
  answer: string;
  /** Document title and page the answer is grounded in. */
  source: string;
  /** True for the example where the documents do NOT cover the question. */
  ungrounded?: boolean;
}

export interface LandingCopy {
  nav: { login: string; startTrial: string };
  hero: {
    badge: string;
    title: string;
    titleAccent: string;
    subtitle: string;
    ctaPrimary: string;
    ctaSecondary: string;
    noCard: string;
  };
  demo: { heading: string; sub: string; items: DemoExchange[] };
  features: { heading: string; sub: string; items: { title: string; body: string }[] };
  how: { heading: string; steps: { title: string; body: string }[] };
  closing: { title: string; body: string; cta: string };
  footer: string;
}

const en: LandingCopy = {
  nav: { login: 'Log in', startTrial: 'Start free trial' },
  hero: {
    badge: '7 days free · no card required',
    title: 'Your institution’s own',
    titleAccent: 'AI study assistant',
    subtitle:
      'Upload your syllabi, lecture notes and handbooks. Your students get answers drawn from your material — with the document and page they came from, and an honest “that isn’t in your documents” when it isn’t.',
    ctaPrimary: 'Start free trial',
    ctaSecondary: 'Log in',
    noCard: 'No card details. Nothing renews automatically.',
  },
  demo: {
    heading: 'Grounded in your documents, not the internet',
    sub: 'Every answer cites the document and page it came from.',
    items: [
      {
        subject: 'Chemistry',
        question: 'Why does increasing temperature speed up a reaction?',
        answer:
          'Raising the temperature increases the average kinetic energy of the particles, so a greater proportion of collisions exceed the activation energy. The collision frequency also rises, but the energy effect is the larger of the two.',
        source: 'Chemistry Grade 12 — Reaction Kinetics · p. 112',
      },
      {
        subject: 'History',
        question: 'What were the main causes of the Kandyan Convention of 1815?',
        answer:
          'The Convention followed the deposition of Sri Wickrama Rajasinghe. The chiefs sought to remove a ruler they had come into conflict with, and the British sought control of the interior they had failed to take by force in 1803.',
        source: 'Sri Lankan History — The Kandyan Kingdom · p. 64',
      },
      {
        subject: 'Information Technology',
        question: 'What is the difference between a stack and a queue?',
        answer:
          'A stack is last-in-first-out: the most recently added item is removed first. A queue is first-in-first-out: items leave in the order they arrived. Both allow insertion and removal in constant time.',
        source: 'IT Fundamentals — Data Structures · p. 38',
      },
      {
        subject: 'Physics',
        question: 'State the principle of conservation of momentum.',
        answer:
          'In the absence of an external resultant force, the total momentum of a system remains constant. In a collision the momentum lost by one body is gained by the other, so the vector sum before and after is unchanged.',
        source: 'Physics Grade 13 — Mechanics · p. 89',
      },
      {
        subject: 'Commerce',
        question: 'How does a trial balance differ from a balance sheet?',
        answer:
          'A trial balance is an internal check that total debits equal total credits at a point in time. A balance sheet is a published statement of assets, liabilities and equity. The first tests the arithmetic; the second reports the position.',
        source: 'Commerce & Accounting — Final Accounts · p. 51',
      },
      {
        subject: 'Biology',
        question: 'Which teacher marks the practical papers?',
        answer:
          'Your documents cover the practical assessment and its weighting, but they do not say who marks the papers. That is not something the uploaded material records.',
        source: 'Not found in your documents',
        ungrounded: true,
      },
    ],
  },
  features: {
    heading: 'Built for how institutions actually teach',
    sub: 'Not a general chatbot pointed at your files.',
    items: [
      { title: 'Answers with citations', body: 'Every claim carries the document and page number behind it, so a student can go and read the original.' },
      { title: 'Says when it doesn’t know', body: 'If your material doesn’t cover a question, it says so instead of inventing a plausible answer.' },
      { title: 'Word-for-word when asked', body: 'Ask for a passage “as it is” and get the exact text from the page, not a paraphrase.' },
      { title: 'Ask out loud', body: 'Voice mode, for revising away from a keyboard.' },
      { title: 'English, Sinhala, Tamil, Arabic', body: 'Students ask in the language they think in.' },
      { title: 'You see what’s missing', body: 'Analytics show which documents answer the most questions — and which questions your material could not answer at all.' },
    ],
  },
  how: {
    heading: 'Running in an afternoon',
    steps: [
      { title: 'Create your institution', body: 'One form. No card, no sales call.' },
      { title: 'Upload your documents', body: 'Syllabi, lecture decks, handbooks. They are indexed automatically.' },
      { title: 'Invite your students', body: 'They ask questions; you see what they are struggling with.' },
    ],
  },
  closing: {
    title: 'Try it with your own syllabus',
    body: 'Seven days, the full product, no card details. If it isn’t useful, it simply stops.',
    cta: 'Start free trial',
  },
  footer: 'AI knowledge platform for schools, institutes and universities.',
};

const si: LandingCopy = {
  nav: { login: 'ඇතුල් වන්න', startTrial: 'නොමිලේ අත්හදා බලන්න' },
  hero: {
    badge: 'දින 7ක් නොමිලේ · කාඩ්පත අවශ්‍ය නැත',
    title: 'ඔබේ ආයතනයටම අයිති',
    titleAccent: 'AI අධ්‍යයන සහායක',
    subtitle:
      'ඔබේ විෂය නිර්දේශ, දේශන සටහන් සහ අත්පොත් උඩුගත කරන්න. ඔබේ ලේඛනවලින්ම ලබාගත් පිළිතුරු ශිෂ්‍යයන්ට ලැබේ — එය ලබාගත් ලේඛනය සහ පිටුව සමඟ, සහ ලේඛනවල නොමැති විට එය අවංකව පවසමින්.',
    ctaPrimary: 'නොමිලේ අත්හදා බලන්න',
    ctaSecondary: 'ඇතුල් වන්න',
    noCard: 'කාඩ්පත් තොරතුරු අවශ්‍ය නැත. ස්වයංක්‍රීයව අලුත් නොවේ.',
  },
  demo: {
    heading: 'අන්තර්ජාලයෙන් නොව, ඔබේ ලේඛනවලින්',
    sub: 'සෑම පිළිතුරක්ම එය ලබාගත් ලේඛනය සහ පිටුව දක්වයි.',
    items: [
      {
        subject: 'රසායන විද්‍යාව',
        question: 'උෂ්ණත්වය වැඩි කිරීමෙන් ප්‍රතික්‍රියා වේගය වැඩි වන්නේ ඇයි?',
        answer:
          'උෂ්ණත්වය වැඩි වීමෙන් අංශුවල සාමාන්‍ය චාලක ශක්තිය වැඩි වන අතර, සක්‍රීයන ශක්තිය ඉක්මවන ගැටීම් අනුපාතය වැඩි වේ. ගැටීම් සංඛ්‍යාතයද වැඩි වුවත්, ශක්තිය සම්බන්ධ බලපෑම විශාලතම වේ.',
        source: 'රසායන විද්‍යාව 12 ශ්‍රේණිය — ප්‍රතික්‍රියා චාලක · පි. 112',
      },
      {
        subject: 'ඉතිහාසය',
        question: '1815 උඩරට ගිවිසුමට හේතු වූ ප්‍රධාන කරුණු මොනවාද?',
        answer:
          'ශ්‍රී වික්‍රම රාජසිංහ පදවියෙන් ඉවත් කිරීමෙන් පසු ගිවිසුම ඇති විය. අධිකාරීන් තමන් ගැටුමට පත් වූ පාලකයෙකු ඉවත් කිරීමට උත්සාහ කළ අතර, බ්‍රිතාන්‍යයන් 1803 දී බලයෙන් ලබාගැනීමට අසමත් වූ අභ්‍යන්තරය පාලනය කිරීමට උත්සාහ කළහ.',
        source: 'ශ්‍රී ලංකා ඉතිහාසය — උඩරට රාජධානිය · පි. 64',
      },
      {
        subject: 'තොරතුරු තාක්ෂණය',
        question: 'stack එකක් සහ queue එකක් අතර වෙනස කුමක්ද?',
        answer:
          'Stack එකක් last-in-first-out වේ: අවසානයට එකතු කළ අයිතමය මුලින්ම ඉවත් වේ. Queue එකක් first-in-first-out වේ: අයිතම පැමිණි අනුපිළිවෙලින්ම ඉවත් වේ. දෙකෙහිම ඇතුළත් කිරීම සහ ඉවත් කිරීම නියත කාලයකදී සිදු වේ.',
        source: 'තොරතුරු තාක්ෂණය මූලික — දත්ත ව්‍යූහ · පි. 38',
      },
      {
        subject: 'භෞතික විද්‍යාව',
        question: 'ගම්‍යතා සංස්ථිති මූලධර්මය දක්වන්න.',
        answer:
          'බාහිර සම්ප්‍රයුක්ත බලයක් නොමැති විට, පද්ධතියක සම්පූර්ණ ගම්‍යතාව නියතව පවතී. ගැටීමකදී එක් වස්තුවක් අහිමි කරගන්නා ගම්‍යතාව අනෙක් වස්තුවට ලැබේ, එබැවින් පෙර හා පසු දෛශික එකතුව වෙනස් නොවේ.',
        source: 'භෞතික විද්‍යාව 13 ශ්‍රේණිය — යාන්ත්‍ර විද්‍යාව · පි. 89',
      },
      {
        subject: 'වාණිජ්‍යය',
        question: 'ශේෂ පරීක්ෂණය සහ ශේෂ පත්‍රය අතර වෙනස කුමක්ද?',
        answer:
          'ශේෂ පරීක්ෂණය යනු නිශ්චිත මොහොතක සම්පූර්ණ ඩෙබිට් හා ක්‍රෙඩිට් සමාන දැයි පරීක්ෂා කරන අභ්‍යන්තර පරීක්ෂණයකි. ශේෂ පත්‍රය යනු වත්කම්, වගකීම් සහ හිමිකාරිත්වය පිළිබඳ ප්‍රකාශනයකි. පළමුවැන්න ගණිතය පරීක්ෂා කරයි; දෙවැන්න තත්ත්වය වාර්තා කරයි.',
        source: 'වාණිජ්‍යය හා ගිණුම්කරණය — අවසාන ගිණුම් · පි. 51',
      },
      {
        subject: 'ජීව විද්‍යාව',
        question: 'ප්‍රායෝගික ප්‍රශ්න පත්‍ර ලකුණු කරන්නේ කවුරුන්ද?',
        answer:
          'ඔබේ ලේඛනවල ප්‍රායෝගික ඇගයීම සහ එහි බර ගැන සඳහන් වුවත්, ප්‍රශ්න පත්‍ර ලකුණු කරන්නේ කවුරුන්ද යන්න සඳහන් නොවේ. උඩුගත කළ ලේඛනවල එම තොරතුරු නොමැත.',
        source: 'ඔබේ ලේඛනවල සොයාගත නොහැක',
        ungrounded: true,
      },
    ],
  },
  features: {
    heading: 'ආයතන ඇත්තටම ඉගැන්වන ආකාරයට',
    sub: 'ඔබේ ගොනු වෙත යොමු කළ සාමාන්‍ය chatbot එකක් නොවේ.',
    items: [
      { title: 'මූලාශ්‍ර සමඟ පිළිතුරු', body: 'සෑම ප්‍රකාශයක් සමඟම ලේඛනය සහ පිටු අංකය ලැබේ, එවිට ශිෂ්‍යයාට මුල් පිටපත කියවිය හැක.' },
      { title: 'නොදන්නා විට එසේ කියයි', body: 'ඔබේ ලේඛනවල ප්‍රශ්නය ආවරණය නොවේ නම්, පිළිතුරක් නිර්මාණය කරනවා වෙනුවට එය එසේ පවසයි.' },
      { title: 'ඉල්ලූ විට වචනයෙන් වචනය', body: '“තියෙන විදිහට” ඉල්ලන්න, පිටුවේ ඇති නිශ්චිත පෙළම ලැබේ.' },
      { title: 'කටහඬින් අසන්න', body: 'යතුරුපුවරුවකින් තොරව පුනරීක්ෂණය සඳහා හඬ ප්‍රකාරය.' },
      { title: 'සිංහල, දෙමළ, ඉංග්‍රීසි, අරාබි', body: 'ශිෂ්‍යයන් සිතන භාෂාවෙන්ම අසයි.' },
      { title: 'අඩුපාඩු ඔබට පෙනේ', body: 'කුමන ලේඛන වැඩිපුරම පිළිතුරු දෙනවාද — සහ ඔබේ ලේඛනවලට පිළිතුරු දිය නොහැකි වූ ප්‍රශ්න මොනවාද යන්න විශ්ලේෂණවලින් පෙනේ.' },
    ],
  },
  how: {
    heading: 'දහවලකින් ක්‍රියාත්මකයි',
    steps: [
      { title: 'ඔබේ ආයතනය සාදන්න', body: 'එක් පෝරමයක්. කාඩ්පතක් නැත, විකුණුම් ඇමතුමක් නැත.' },
      { title: 'ලේඛන උඩුගත කරන්න', body: 'විෂය නිර්දේශ, දේශන, අත්පොත්. ස්වයංක්‍රීයව සුචිගත වේ.' },
      { title: 'ශිෂ්‍යයන් එකතු කරන්න', body: 'ඔවුන් ප්‍රශ්න අසයි; ඔවුන් අපහසුතාවයට පත්වන දේ ඔබට පෙනේ.' },
    ],
  },
  closing: {
    title: 'ඔබේම විෂය නිර්දේශයෙන් අත්හදා බලන්න',
    body: 'දින හතක්, සම්පූර්ණ නිෂ්පාදනය, කාඩ්පත් තොරතුරු නැත. ප්‍රයෝජනවත් නොවේ නම්, එය නවතී.',
    cta: 'නොමිලේ අත්හදා බලන්න',
  },
  footer: 'පාසල්, ආයතන සහ විශ්වවිද්‍යාල සඳහා AI දැනුම් වේදිකාව.',
};

const ta: LandingCopy = {
  nav: { login: 'உள்நுழைக', startTrial: 'இலவசமாக முயற்சிக்கவும்' },
  hero: {
    badge: '7 நாட்கள் இலவசம் · அட்டை தேவையில்லை',
    title: 'உங்கள் நிறுவனத்தின் சொந்த',
    titleAccent: 'AI கற்றல் உதவியாளர்',
    subtitle:
      'உங்கள் பாடத்திட்டங்கள், விரிவுரைக் குறிப்புகள், கையேடுகளைப் பதிவேற்றுங்கள். உங்கள் ஆவணங்களிலிருந்தே மாணவர்களுக்குப் பதில்கள் கிடைக்கும் — அது வந்த ஆவணமும் பக்கமும் சேர்த்து, ஆவணங்களில் இல்லாதபோது அதை நேர்மையாகச் சொல்லியும்.',
    ctaPrimary: 'இலவசமாக முயற்சிக்கவும்',
    ctaSecondary: 'உள்நுழைக',
    noCard: 'அட்டை விவரங்கள் தேவையில்லை. தானாகப் புதுப்பிக்கப்படாது.',
  },
  demo: {
    heading: 'இணையத்திலிருந்து அல்ல, உங்கள் ஆவணங்களிலிருந்து',
    sub: 'ஒவ்வொரு பதிலும் அது வந்த ஆவணத்தையும் பக்கத்தையும் காட்டுகிறது.',
    items: [
      {
        subject: 'வேதியியல்',
        question: 'வெப்பநிலையை அதிகரிப்பது வினை வேகத்தை ஏன் கூட்டுகிறது?',
        answer:
          'வெப்பநிலை அதிகரிக்கும்போது துகள்களின் சராசரி இயக்க ஆற்றல் கூடுகிறது, எனவே செயற்படுத்தும் ஆற்றலைத் தாண்டும் மோதல்களின் விகிதம் அதிகரிக்கிறது. மோதல் அதிர்வெண்ணும் கூடுகிறது, ஆனால் ஆற்றல் விளைவே பெரியது.',
        source: 'வேதியியல் தரம் 12 — வினை இயக்கவியல் · ப. 112',
      },
      {
        subject: 'வரலாறு',
        question: '1815 கண்டி ஒப்பந்தத்திற்கான முக்கிய காரணங்கள் யாவை?',
        answer:
          'ஸ்ரீ விக்ரம ராஜசிங்கன் பதவி நீக்கப்பட்டதைத் தொடர்ந்து ஒப்பந்தம் ஏற்பட்டது. தலைவர்கள் தாங்கள் முரண்பட்ட ஆட்சியாளரை நீக்க விரும்பினர்; ஆங்கிலேயர் 1803 இல் படையால் கைப்பற்ற முடியாத உட்பகுதியைக் கட்டுப்படுத்த விரும்பினர்.',
        source: 'இலங்கை வரலாறு — கண்டி இராச்சியம் · ப. 64',
      },
      {
        subject: 'தகவல் தொழில்நுட்பம்',
        question: 'stack க்கும் queue க்கும் என்ன வேறுபாடு?',
        answer:
          'Stack என்பது last-in-first-out: கடைசியாகச் சேர்க்கப்பட்டதே முதலில் நீக்கப்படும். Queue என்பது first-in-first-out: வந்த வரிசையிலேயே வெளியேறும். இரண்டிலும் சேர்த்தலும் நீக்கலும் நிலையான நேரத்தில் நடக்கும்.',
        source: 'தகவல் தொழில்நுட்ப அடிப்படைகள் — தரவு அமைப்புகள் · ப. 38',
      },
      {
        subject: 'இயற்பியல்',
        question: 'உந்த அழிவின்மைத் தத்துவத்தைக் கூறுக.',
        answer:
          'வெளிப்புற விளைவு விசை இல்லாதபோது, ஒரு தொகுதியின் மொத்த உந்தம் மாறாமல் இருக்கும். மோதலின்போது ஒரு பொருள் இழக்கும் உந்தத்தை மற்றொன்று பெறுகிறது, எனவே முன்னும் பின்னும் உள்ள வெக்டர் கூட்டுத்தொகை மாறாது.',
        source: 'இயற்பியல் தரம் 13 — இயக்கவியல் · ப. 89',
      },
      {
        subject: 'வணிகவியல்',
        question: 'இருப்புச் சரிபார்ப்புக்கும் இருப்புநிலைக் குறிப்புக்கும் வேறுபாடு என்ன?',
        answer:
          'இருப்புச் சரிபார்ப்பு என்பது ஒரு கால கட்டத்தில் மொத்த பற்றும் வரவும் சமமா எனச் சோதிக்கும் உள்ளக சரிபார்ப்பு. இருப்புநிலைக் குறிப்பு என்பது சொத்துகள், பொறுப்புகள், உரிமையாளர் மூலதனம் பற்றிய அறிக்கை. முதலாவது கணக்கைச் சோதிக்கிறது; இரண்டாவது நிலையை அறிவிக்கிறது.',
        source: 'வணிகவியல் & கணக்கியல் — இறுதிக் கணக்குகள் · ப. 51',
      },
      {
        subject: 'உயிரியல்',
        question: 'செய்முறைத் தாள்களை யார் திருத்துகிறார்?',
        answer:
          'உங்கள் ஆவணங்களில் செய்முறை மதிப்பீடும் அதன் எடையும் உள்ளன, ஆனால் தாள்களை யார் திருத்துகிறார் என்பது இல்லை. பதிவேற்றப்பட்ட ஆவணங்களில் அத்தகவல் இல்லை.',
        source: 'உங்கள் ஆவணங்களில் இல்லை',
        ungrounded: true,
      },
    ],
  },
  features: {
    heading: 'நிறுவனங்கள் உண்மையில் கற்பிக்கும் விதத்திற்கு',
    sub: 'உங்கள் கோப்புகளை நோக்கித் திருப்பிய பொதுவான chatbot அல்ல.',
    items: [
      { title: 'ஆதாரத்துடன் பதில்கள்', body: 'ஒவ்வொரு கூற்றுடனும் ஆவணமும் பக்க எண்ணும் வரும், மாணவர் மூலத்தைப் படிக்கலாம்.' },
      { title: 'தெரியாதபோது சொல்லும்', body: 'உங்கள் ஆவணங்களில் இல்லையென்றால், பதிலைக் கற்பனை செய்யாமல் அதைச் சொல்லும்.' },
      { title: 'கேட்டால் அப்படியே', body: '“அப்படியே” எனக் கேளுங்கள், பக்கத்தில் உள்ள சரியான உரையே கிடைக்கும்.' },
      { title: 'குரலில் கேளுங்கள்', body: 'விசைப்பலகை இல்லாமல் திரும்பப் பார்க்க குரல் முறை.' },
      { title: 'தமிழ், சிங்களம், ஆங்கிலம், அரபு', body: 'மாணவர்கள் சிந்திக்கும் மொழியிலேயே கேட்கிறார்கள்.' },
      { title: 'இடைவெளிகள் தெரியும்', body: 'எந்த ஆவணங்கள் அதிகம் பதிலளிக்கின்றன — உங்கள் ஆவணங்களால் பதிலளிக்க முடியாத கேள்விகள் எவை என்பதும் தெரியும்.' },
    ],
  },
  how: {
    heading: 'ஒரு மதியத்தில் தயார்',
    steps: [
      { title: 'உங்கள் நிறுவனத்தை உருவாக்குங்கள்', body: 'ஒரு படிவம். அட்டை இல்லை, விற்பனை அழைப்பு இல்லை.' },
      { title: 'ஆவணங்களைப் பதிவேற்றுங்கள்', body: 'பாடத்திட்டங்கள், விரிவுரைகள், கையேடுகள். தானாகவே அட்டவணைப்படுத்தப்படும்.' },
      { title: 'மாணவர்களைச் சேர்க்கவும்', body: 'அவர்கள் கேட்பார்கள்; அவர்கள் சிரமப்படுவது உங்களுக்குத் தெரியும்.' },
    ],
  },
  closing: {
    title: 'உங்கள் சொந்தப் பாடத்திட்டத்துடன் முயற்சியுங்கள்',
    body: 'ஏழு நாட்கள், முழு தயாரிப்பு, அட்டை விவரங்கள் இல்லை. பயனில்லை என்றால், அது நின்றுவிடும்.',
    cta: 'இலவசமாக முயற்சிக்கவும்',
  },
  footer: 'பாடசாலைகள், நிறுவனங்கள், பல்கலைக்கழகங்களுக்கான AI அறிவுத் தளம்.',
};

const ar: LandingCopy = {
  nav: { login: 'تسجيل الدخول', startTrial: 'ابدأ التجربة المجانية' },
  hero: {
    badge: '٧ أيام مجانًا · بدون بطاقة',
    title: 'مساعد الدراسة الذكي',
    titleAccent: 'الخاص بمؤسستك',
    subtitle:
      'ارفع مناهجك ومذكرات المحاضرات والأدلة. يحصل طلابك على إجابات من موادك أنت — مع اسم المستند ورقم الصفحة، ومع إقرار صريح حين لا تغطي المستندات السؤال.',
    ctaPrimary: 'ابدأ التجربة المجانية',
    ctaSecondary: 'تسجيل الدخول',
    noCard: 'لا حاجة لبيانات بطاقة. ولا تجديد تلقائي.',
  },
  demo: {
    heading: 'من مستنداتك، لا من الإنترنت',
    sub: 'كل إجابة تذكر المستند والصفحة التي جاءت منها.',
    items: [
      {
        subject: 'الكيمياء',
        question: 'لماذا تزيد درجة الحرارة من سرعة التفاعل؟',
        answer:
          'رفع درجة الحرارة يزيد متوسط الطاقة الحركية للجسيمات، فترتفع نسبة التصادمات التي تتجاوز طاقة التنشيط. كما يزداد تواتر التصادم، لكن أثر الطاقة هو الأكبر.',
        source: 'الكيمياء للصف ١٢ — حركية التفاعلات · ص ١١٢',
      },
      {
        subject: 'التاريخ',
        question: 'ما أسباب اتفاقية كاندي عام ١٨١٥؟',
        answer:
          'جاءت الاتفاقية بعد خلع سري ويكراما راجاسينغه. سعى الزعماء إلى إزاحة حاكم تنازعوا معه، وسعى البريطانيون للسيطرة على الداخل الذي عجزوا عن أخذه بالقوة عام ١٨٠٣.',
        source: 'تاريخ سريلانكا — مملكة كاندي · ص ٦٤',
      },
      {
        subject: 'تقنية المعلومات',
        question: 'ما الفرق بين المكدس والطابور؟',
        answer:
          'المكدس يعمل بمبدأ الوارد أخيرًا يخرج أولًا: يُزال آخر عنصر أُضيف. الطابور يعمل بمبدأ الوارد أولًا يخرج أولًا: تخرج العناصر بترتيب وصولها. كلاهما يتيح الإضافة والإزالة في زمن ثابت.',
        source: 'أساسيات تقنية المعلومات — هياكل البيانات · ص ٣٨',
      },
      {
        subject: 'الفيزياء',
        question: 'اذكر مبدأ حفظ كمية الحركة.',
        answer:
          'في غياب قوة خارجية محصلة، تبقى كمية الحركة الكلية للنظام ثابتة. في التصادم يكتسب أحد الجسمين ما يفقده الآخر، فيبقى المجموع المتجهي قبل وبعد دون تغيير.',
        source: 'الفيزياء للصف ١٣ — الميكانيكا · ص ٨٩',
      },
      {
        subject: 'التجارة',
        question: 'ما الفرق بين ميزان المراجعة والميزانية العمومية؟',
        answer:
          'ميزان المراجعة فحص داخلي للتأكد من تساوي مجموع المدين والدائن في لحظة معينة. أما الميزانية العمومية فبيان معلن للأصول والخصوم وحقوق الملكية. الأول يختبر الحساب، والثانية تعرض المركز المالي.',
        source: 'التجارة والمحاسبة — الحسابات الختامية · ص ٥١',
      },
      {
        subject: 'الأحياء',
        question: 'من يصحح أوراق الامتحان العملي؟',
        answer:
          'تتناول مستنداتك التقييم العملي ووزنه، لكنها لا تذكر من يصحح الأوراق. هذه المعلومة غير موجودة في المواد المرفوعة.',
        source: 'غير موجود في مستنداتك',
        ungrounded: true,
      },
    ],
  },
  features: {
    heading: 'مبني على طريقة التدريس الفعلية',
    sub: 'ليس روبوت محادثة عامًا وُجّه إلى ملفاتك.',
    items: [
      { title: 'إجابات مع المصادر', body: 'كل عبارة مصحوبة باسم المستند ورقم الصفحة، ليعود الطالب إلى الأصل.' },
      { title: 'يقول حين لا يعرف', body: 'إن لم تغطِّ موادك السؤال، يقول ذلك بدل اختلاق إجابة معقولة.' },
      { title: 'نصًا كما هو عند الطلب', body: 'اطلب المقطع «كما هو» فتحصل على النص الحرفي من الصفحة.' },
      { title: 'اسأل بصوتك', body: 'وضع صوتي للمراجعة بعيدًا عن لوحة المفاتيح.' },
      { title: 'العربية والسنهالية والتاميلية والإنجليزية', body: 'يسأل الطلاب باللغة التي يفكرون بها.' },
      { title: 'ترى ما ينقصك', body: 'تُظهر التحليلات أي المستندات تجيب أكثر — وأي الأسئلة عجزت موادك عن الإجابة عنها.' },
    ],
  },
  how: {
    heading: 'جاهز خلال بعد ظهر واحد',
    steps: [
      { title: 'أنشئ مؤسستك', body: 'نموذج واحد. بلا بطاقة وبلا مكالمة مبيعات.' },
      { title: 'ارفع مستنداتك', body: 'مناهج ومحاضرات وأدلة. تُفهرس تلقائيًا.' },
      { title: 'أضف طلابك', body: 'يسألون، وترى أنت أين تكمن صعوباتهم.' },
    ],
  },
  closing: {
    title: 'جرّبه بمنهجك أنت',
    body: 'سبعة أيام، المنتج كاملًا، بلا بيانات بطاقة. وإن لم يكن مفيدًا، يتوقف ببساطة.',
    cta: 'ابدأ التجربة المجانية',
  },
  footer: 'منصة معرفة بالذكاء الاصطناعي للمدارس والمعاهد والجامعات.',
};

export const landingCopy: Record<SupportedLang, LandingCopy> = { en, si, ta, ar };
