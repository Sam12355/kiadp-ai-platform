import fs from 'fs';

let code = fs.readFileSync('src/pages/client/KnowledgeAssistant.tsx', 'utf8');

if (!code.includes('useTranslation')) {
  code = code.replace(/import \{ useState, useRef, useEffect \} from 'react';/, "import { useState, useRef, useEffect } from 'react';\nimport { useTranslation } from 'react-i18next';");
  
  code = code.replace(/export default function KnowledgeAssistant\(\) \{/, "export default function KnowledgeAssistant() {\n  const { t, i18n } = useTranslation();");
}

const repls: [RegExp | string, string][] = [
  [/'Khalifa Agent'/g, "t('app_name')"],
  [/\{activeSession\?\.title \|\| 'Khalifa Agent'\}/g, "{activeSession?.title || t('app_name')}"],
  [/>Khalifa Agent</g, ">{t('app_name')}<"],
  [/'New conversation'/g, "t('new_conversation')"],
  [/>New conversation</g, ">{t('new_conversation')}<"],
  [/>Recent</g, ">{t('recent')}<"],
  [/'Click to rename'/g, "t('click_rename')"],
  [/>How can I help you today\?</g, ">{t('how_can_i_help')}<"],
  [/>Ask anything about date palm research, pest management, or agricultural innovation\. All answers come from verified documents\.</g, ">{t('hero_subtitle')}<"],
  [/'What are Red Palm Weevil symptoms\?'/g, "t('prompt_1')"],
  [/'Summarize the latest research findings\.'/g, "t('prompt_2')"],
  [/>Excerpt</g, ">{t('excerpt')}<"],
  [/>Thinking…</g, ">{t('thinking')}<"],
  [/placeholder="Ask a question…"/g, 'placeholder={t("ask_question")}'],
  [/>Responses are grounded in verified agricultural documents only\.</g, ">{t('footer_note')}<"],
  
  [/return 'Just now';/g, "return t('just_now');"],
  [/return `\$\{mins\}m ago`;/g, "return t('m_ago', { count: mins });"],
  [/return `\$\{hrs\}h ago`;/g, "return t('h_ago', { count: hrs });"],
  [/return `\$\{Math\.floor\(hrs \/ 24\)\}d ago`;/g, "return t('d_ago', { count: Math.floor(hrs / 24) });"]
];

for (const [find, rep] of repls) {
  code = code.replace(find, rep);
}

// Convert physical CSS to logical properties
code = code.replace(/pl-4/g, 'ps-4');
code = code.replace(/pr-14/g, 'pe-14');
code = code.replace(/ml-3/g, 'ms-3');
code = code.replace(/ml-1/g, 'ms-1');
code = code.replace(/text-left/g, 'text-start');
code = code.replace(/left-0/g, 'start-0');
code = code.replace(/right-2/g, 'end-2');

const topbarRegex = /(<header .*?>\s*<div className="flex items-center gap-3">\s*<button[\s\S]*?<\/button>)/;
if (!code.includes('className="language-selector')) {
  const switcher = `
            <select
               className="language-selector ms-3 bg-transparent border border-white/20 rounded px-2 py-1 text-xs text-white/70 outline-none hover:border-white/50"
               value={i18n.language}
               onChange={(e) => i18n.changeLanguage(e.target.value)}
            >
               <option value="en" className="text-black">EN</option>
               <option value="fr" className="text-black">FR</option>
               <option value="ar" className="text-black">AR</option>
            </select>`;
  code = code.replace(topbarRegex, "$1" + switcher);
}

fs.writeFileSync('src/pages/client/KnowledgeAssistant.tsx', code);
console.log('Translations applied!');
