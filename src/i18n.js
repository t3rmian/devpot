import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import config from './template.config';

const resources = {
  en: {
    translation: {
      defaultLang: config.defaultLanguage,
      "site title": config.siteTitle,
      "twitter author": config.optional.twitterAuthor,
      en: "English",
      pl: "Polski",
      "date=year+month": "{{date, year+month}}",
      "date=month+day": "{{date, month+day}}",
      "date=post": "{{date, year+month+day}}",

      Author: "Author",
      Recent: "Recent",
      Article: "Article",
      "Posts by tag": "Posts by tag: {{tag}}",
      "Posts by category": "Posts in category: {{category}}",
      More: "More…",
      "Search results": "Search results for any of the following query parts: {{parts}}",
      "Empty query": "Oops, empty query…",
      "No content": "Oh snap! We don't have such content yet. But come back later. Maybe we will write about it.",
      posts: "posts",
      tags: "tags",
      category: "category",
      search: "search",
      source: "source",
      "count minutes read": "{{count}} minute read",
      "count minutes read_plural": "{{count}} minutes read",
      "Not found": "404 - Oh no's! We couldn't find that page :(",
      "Tag cloud": "Tag cloud",
      "Updated": "Updated",
      "Light theme": "Light theme",
      "Dark theme": "Dark theme",
      "Switch theme": "Switch theme",

      short: "~ 10 min",
      medium: "10 ~ 20 min",
      long: "20 min ~",
    }
  },
  pl: {
    translation: {
      Author: "Autor",
      Recent: "Najnowsze",
      Article: "Artykuł",
      "Posts by tag": "Artykuły z etykietą: {{tag}}",
      "Posts by category": "Artykuły z kategorii: {{category}}",
      More: "Więcej…",
      "Search results": "Rezultaty wyszukiwania dla następujących części zapytania: {{parts}}",
      "Empty query": "Ups, puste zapytanie…",
      "No content": "O nie! Nie mamy jeszcze takiej zawartości. Ale wpadnij później. Może wkrótce coś o tym napiszemy.",
      posts: "posty",
      tags: "tagi",
      category: "kategoria",
      search: "szukaj",
      source: "źródło",
      "count minutes read_0": "{{count}} minuta",
      "count minutes read_1": "{{count}} minuty",
      "count minutes read_2": "{{count}} minut",
      "Not found": "404 - nic tu nie ma",
      "Tag cloud": "Chmura tagów",
      "Updated": "Aktualizacja",
      "Light theme": "Jasny szablon",
      "Dark theme": "Ciemny szablon",
      "Switch theme": "Zmień motyw",
    }
  }
};

i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",

  keySeparator: false,

  interpolation: {
    escapeValue: false,
    format: function(value, format, lng) {
      if (value instanceof Date) {
        let options = {};
        if (format === "year+month") {
          options = { year: "numeric", month: "short" };
        } else if (format === "month+day") {
          options = { month: "long", day: "numeric" };
        } else if (format === "year+month+day") {
          options = { year: "numeric", month: "long", day: "numeric" };
        }
        return new Intl.DateTimeFormat(lng, options).format(value);
      }
      return value;
    }
  },

  react: {
    bindI18n: ''
  }
});

export default i18n;
