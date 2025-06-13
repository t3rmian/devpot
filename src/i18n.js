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
      es: "Español",
      es404: "Inicio",
      ja: "日本語",
      ja404: "ホームページ",
      pt: "Português",
      pt404: "Página inicial",
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
  },
  es: {
    translation: {
      "date=year+month": "{{date, year+month}}",
      "date=month+day": "{{date, month+day}}",
      "date=post": "{{date, year+month+day}}",

      Author: "Autor",
      Recent: "Reciente",
      Article: "Artículo",
      "Posts by tag": "Artículos por etiqueta: {{tag}}",
      "Posts by category": "Artículos en la categoría: {{category}}",
      More: "Más…",
      "Search results": "Resultados de búsqueda para cualquiera de las siguientes partes de la consulta: {{parts}}",
      "Empty query": "Vaya, consulta vacía…",
      "No content": "¡Vaya! Aún no tenemos ese contenido. Pero vuelve más tarde. Tal vez escribamos sobre ello.",
      posts: "artículos",
      tags: "etiquetas",
      category: "categoría",
      search: "buscar",
      source: "fuente",
      "count minutes read_0": "{{count}} minuto de lectura",
      "count minutes read_1": "{{count}} minutos de lectura",
      "count minutes read_2": "{{count}} minutos de lectura",
      "Not found": "404 - ¡Vaya! No pudimos encontrar esa página :(",
      "Tag cloud": "Nube de etiquetas",
      "Updated": "Actualizado",
      "Light theme": "Tema claro",
      "Dark theme": "Tema oscuro",
      "Switch theme": "Cambiar tema",

      short: "~ 10 min",
      medium: "10 ~ 20 min",
      long: "20 min ~",
      Mentioned: "Mencionado",
      Related: "Relacionado",
      Relevant: "Relevante",
    }
  },
  ja: {
    translation: {
      "site title": "デブポット",
      "date=year+month": "{{date, year+month}}",
      "date=month+day": "{{date, month+day}}",
      "date=post": "{{date, year+month+day}}",

      Author: "著者",
      Recent: "最近",
      Article: "記事",
      "Posts by tag": "タグ別の記事: {{tag}}",
      "Posts by category": "カテゴリ別の記事: {{category}}",
      More: "もっと…",
      "Search results": "次のクエリ部分のいずれかの検索結果: {{parts}}",
      "Empty query": "おっと、クエリが空です…",
      "No content": "おっと！まだそのコンテンツはありません。また後で来てください。もしかしたら書くかもしれません。",
      posts: "投稿",
      tags: "タグ",
      category: "カテゴリ",
      search: "検索",
      source: "ソース",
      "count minutes read_0": "{{count}}分間の読書",
      "count minutes read_1": "{{count}}分間の読書",
      "count minutes read_2": "{{count}}分間の読書",
      "Not found": "404 - お探しのページは見つかりませんでした :(",
      "Tag cloud": "タグクラウド",
      "Updated": "更新日",
      "Light theme": "ライトテーマ",
      "Dark theme": "ダークテーマ",
      "Switch theme": "テーマを切り替え",

      short: "~ 10分",
      medium: "10 ~ 20分",
      long: "20分 ~",
      Mentioned: "言及",
      Related: "関連",
      Relevant: "関連性あり",
    }
  },
  pt: {
    translation: {
      Author: "Autor",
      Recent: "Recentes",
      Article: "Artigo",
      "Posts by tag": "Postagens com a tag: {{tag}}",
      "Posts by category": "Postagens na categoria: {{category}}",
      More: "Mais…",
      "Search results": "Resultados da pesquisa para qualquer uma das seguintes partes da consulta: {{parts}}",
      "Empty query": "Ops, consulta vazia…",
      "No content": "Puxa! Ainda não temos esse conteúdo. Mas volte mais tarde. Talvez escrevamos sobre isso.",
      posts: "postagens",
      tags: "tags",
      category: "categoria",
      search: "buscar",
      source: "fonte",
      "count minutes read_0": "{{count}} minuto de leitura",
      "count minutes read_1": "{{count}} minutos de leitura",
      "count minutes read_2": "{{count}} minutos de leitura",
      "Not found": "404 - Ops! Não conseguimos encontrar essa página :(",
      "Tag cloud": "Nuvem de tags",
      "Updated": "Atualizado",
      "Light theme": "Tema claro",
      "Dark theme": "Tema escuro",
      "Switch theme": "Alternar tema",

      short: "~ 10 min",
      medium: "10 ~ 20 min",
      long: "20 min ~",
      Mentioned: "Mencionado",
      Related: "Relacionado",
      Relevant: "Relevante",
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