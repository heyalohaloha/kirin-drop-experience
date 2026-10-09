export const isEnglish = () => typeof document !== 'undefined' && document.documentElement?.lang === 'en';
export const text = (ja, en) => isEnglish() ? en : ja;
