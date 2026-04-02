import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';

import ko from './locales/ko.json';
import en from './locales/en.json';

const LANGUAGE_KEY = 'user_language';

async function getStoredLanguage() {
  try {
    const stored = await AsyncStorage.getItem(LANGUAGE_KEY);
    if (stored === 'ko' || stored === 'en') return stored;
  } catch (e) {}
  return null;
}

function getDeviceLanguage() {
  try {
    const locales = getLocales();
    const lang = locales?.[0]?.languageCode;
    if (lang === 'en') return 'en';
  } catch (e) {}
  return 'ko';
}

async function initI18n() {
  const storedLang = await getStoredLanguage();
  const lng = storedLang || getDeviceLanguage();

  await i18next
    .use(initReactI18next)
    .init({
      lng,
      fallbackLng: 'ko',
      resources: {
        ko: { translation: ko },
        en: { translation: en },
      },
      interpolation: {
        escapeValue: false,
      },
      react: {
        useSuspense: false,
      },
    });
}

initI18n();

export default i18next;
