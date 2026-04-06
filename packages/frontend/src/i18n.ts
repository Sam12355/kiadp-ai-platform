import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr', 'ar'],
    resources: {
      en: {
        translation: {
          app_name: 'KIADP AI',
          new_conversation: 'New conversation',
          recent: 'Recent',
          click_rename: 'Click to rename',
          how_can_i_help: 'How can I help you today?',
          hero_subtitle: 'Ask anything about date palm research, pest management, or agricultural innovation. All answers come from verified documents.',
          prompt_1: 'What are Red Palm Weevil symptoms?',
          prompt_2: 'Summarize the latest research findings.',
          excerpt: 'Excerpt',
          thinking: 'Thinking…',
          ask_question: 'Ask a question…',
          footer_note: 'Responses are grounded in verified agricultural documents only.',
          just_now: 'Just now',
          m_ago: '{{count}}m ago',
          h_ago: '{{count}}h ago',
          d_ago: '{{count}}d ago',
        }
      },
      fr: {
        translation: {
          app_name: 'KIADP AI',
          new_conversation: 'Nouvelle conversation',
          recent: 'Récent',
          click_rename: 'Cliquez pour renommer',
          how_can_i_help: 'Comment puis-je vous aider aujourd\'hui ?',
          hero_subtitle: 'Demandez n\'importe quoi sur la recherche sur le palmier dattier, la gestion des ravageurs ou l\'innovation agricole. Toutes les réponses proviennent de documents vérifiés.',
          prompt_1: 'Quels sont les symptômes du charançon rouge du palmier ?',
          prompt_2: 'Résumez les dernières conclusions de la recherche.',
          excerpt: 'Extrait',
          thinking: 'Réflexion en cours…',
          ask_question: 'Posez une question…',
          footer_note: 'Les réponses sont basées uniquement sur des documents agricoles vérifiés.',
          just_now: 'À l\'instant',
          m_ago: 'Il y a {{count}}m',
          h_ago: 'Il y a {{count}}h',
          d_ago: 'Il y a {{count}}j',
        }
      },
      ar: {
        translation: {
          app_name: 'KIADP AI',
          new_conversation: 'محادثة جديدة',
          recent: 'الأخيرة',
          click_rename: 'انقر لإعادة التسمية',
          how_can_i_help: 'كيف يمكنني مساعدتك اليوم؟',
          hero_subtitle: 'اسأل عن أي شيء يخص أبحاث نخيل التمر، أو مكافحة الآفات المستدامة، أو الابتكار الزراعي. جميع الإجابات مستمدة من وثائق معتمدة.',
          prompt_1: 'ما هي أعراض إصابة سوسة النخيل الحمراء؟',
          prompt_2: 'لخص أحدث نتائج الأبحاث.',
          excerpt: 'مقتطف',
          thinking: 'يفكر…',
          ask_question: 'اطرح سؤالاً…',
          footer_note: 'تستند الإجابات إلى وثائق زراعية موثقة فقط.',
          just_now: 'الآن',
          m_ago: 'منذ {{count}} دقيقة',
          h_ago: 'منذ {{count}} ساعة',
          d_ago: 'منذ {{count}} يوم',
        }
      }
    },
    interpolation: {
      escapeValue: false // React already escapes values
    }
  });

// Handle RTL direction natively when language changes
i18n.on('languageChanged', (lng: string) => {
  document.documentElement.dir = i18n.dir(lng);
  document.documentElement.lang = lng;
});

// Set initial direction
document.documentElement.dir = i18n.dir();
document.documentElement.lang = i18n.language;

export default i18n;
