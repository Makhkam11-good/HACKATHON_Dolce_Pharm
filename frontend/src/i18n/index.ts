/**
 * i18n с «естественными» ключами: ключ = русский текст (ru — язык по умолчанию),
 * kk.json содержит переводы этих же строк. Непереведённое показывается по-русски.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import kk from './kk.json';
import ru from './ru.json';

const saved = (() => {
  try {
    return localStorage.getItem('lang');
  } catch {
    return null;
  }
})();

void i18n.use(initReactI18next).init({
  resources: { ru: { translation: ru }, kk: { translation: kk } },
  lng: saved === 'kk' ? 'kk' : 'ru',
  fallbackLng: 'ru',
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  returnEmptyString: false,
});

export function setLang(l: 'ru' | 'kk') {
  void i18n.changeLanguage(l);
  document.documentElement.lang = l;
  try {
    localStorage.setItem('lang', l);
  } catch {
    /* ignore */
  }
}

export default i18n;
