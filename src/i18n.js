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

      Recent: "Recent",
      "Posts by tag": "Posts by tag: {{tag}}",
      More: "More…",
      "Search results": "Search results for any of the following query parts: {{parts}}",
      "Empty query": "Oops, empty query…",
      "No content": "Oh snap! We don't have such content yet. But come back later. Maybe we will write about it.",
      posts: "posts",
      tags: "tags",
      search: "search",
      source: "source",
      "count minutes read": "{{count}} minute read",
      "count minutes read_plural": "{{count}} minutes read",
      "Not found": "404 - Oh no's! We couldn't find that page :(",
      "Tag cloud": "Tag cloud",
      "Updated": "Updated",
      "Light theme": "Light theme",
      "Dark theme": "Dark theme",
      "Tested in Brave": "Tested with Brave",

      short: "~ 10 min",
      medium: "10 ~ 20 min",
      long: "20 min ~",
    }
  },
  pl: {
    translation: {
      Recent: "Najnowsze",
      "Posts by tag": "Artykuły z etykietą: {{tag}}",
      More: "Więcej…",
      "Search results": "Rezultaty wyszukiwania dla następujących części zapytania: {{parts}}",
      "Empty query": "Ups, puste zapytanie…",
      "No content": "O nie! Nie mamy jeszcze takiej zawartości. Ale wpadnij później. Może wkrótce coś o tym napiszemy.",
      posts: "posty",
      tags: "tagi",
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
      "Tested in Brave": "Sprawdź w Brave",
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
