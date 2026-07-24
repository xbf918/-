import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { zh } from "./zh";
import { en } from "./en";

// 从 localStorage 读取语言偏好，默认中文
const savedLang = typeof localStorage !== "undefined"
  ? localStorage.getItem("lang") ?? "zh"
  : "zh";

i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
  },
  lng: savedLang,
  fallbackLng: "zh",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
