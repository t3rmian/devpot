import config from './template.config';

const resources = {
  en: {
    translation: {
      defaultLang: config.defaultLanguage,
      "site title": config.siteTitle,
      "twitter author": config.optional.twitterAuthor,
      en: "English",
      en404: "Home",
      pl: "Polski",
      pl404: "Strona główna",
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
      "count minutes read_0": "{{count}} minute read",
      "count minutes read_1": "{{count}} minutes read",
      "count minutes read_2": "{{count}} minutes read",
      "Not found": "404 - Oh no's! We couldn't find that page :(",
      "Tag cloud": "Tag cloud",
      "Updated": "Updated",
      "Light theme": "Light theme",
      "Dark theme": "Dark theme",
      "Switch theme": "Switch theme",

      short: "~ 10 min",
      medium: "10 ~ 20 min",
      long: "20 min ~",
      Mentioned: "Mentioned",
      Related: "Related",
      Relevant: "Relevant",
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
      Mentioned: "Wspomniane",
      Related: "Powiązane",
      Relevant: "Istotne",
    }
  }
};

function getTranslationValue(lng, key) {
  let value;
  try {
    value = resources[lng]["translation"][key];
  } catch (error) {
    return {value, error};
  }
  if (!value) {
    try {
      return {value: resources[config.defaultLanguage]["translation"][key]};
    } catch (error) {
      return {value, error};
    }
  }
  return {value};
}

function dli(count) {
  if (count === 1) {
    return "0";
  }
  if (count % 10 > 1 && count % 10 < 5 && !(count % 100 >= 10 && count % 100 <= 21)) {
    return "1";
  }

  return "2";
}

const i18n = {
  t: (key, options = {lng: config.defaultLanguage}) => {
    const {lng, date, count} = options;
    let {value, error} = getTranslationValue(lng, key);
    if (count !== undefined) {
      const numeral = getTranslationValue(lng, key + "_" + dli(count));
      if (numeral.value !== undefined) {
        value = numeral.value;
      }
    }
    if (!value) {
      return key;
    }
    if (date instanceof Date) {
      const format = value.split(",")[1].split("}")[0].trim();
      let options = {};
      if (format === "year+month") {
        options = { year: "numeric", month: "short" };
      } else if (format === "month+day") {
        options = { month: "long", day: "numeric" };
      } else if (format === "year+month+day") {
        options = { year: "numeric", month: "long", day: "numeric" };
      }
      return new Intl.DateTimeFormat(lng, options).format(date);
    }
    Object.keys(options).forEach(key => {
      value = value.replace(`{{${key}}}`, options[key]);
    });
    return value;
  },
  services: {
    resourceStore: {
      data: resources
    }
  }
}
export const useTranslation = () => ({
  ...i18n
});

export default i18n;
