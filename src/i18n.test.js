import {useTranslation} from "./i18n";

const {t} = useTranslation();

describe("i18n", () => {

    test('variable numerals are translated [en][count minutes read]', async () => {
        const lng = "en";
        const oneMinute = t("count minutes read", {count: 1, lng});
        const twoMinutes = t("count minutes read", {count: 2, lng});
        const threeMinutes = t("count minutes read", {count: 3, lng});
        expect(oneMinute).toEqual("1 minute read");
        expect(twoMinutes).toEqual("2 minutes read");
        expect(threeMinutes).toEqual("3 minutes read");
    })
    test('variable numerals are translated [pl][count minutes read]', async () => {
        const lng = "pl";
        const oneMinute = t("count minutes read", {count: 1, lng});
        const twoMinutes = t("count minutes read", {count: 2, lng});
        const threeMinutes = t("count minutes read", {count: 3, lng});
        const fiveMinutes = t("count minutes read", {count: 5, lng});
        const _23Minutes = t("count minutes read", {count: 23, lng});
        expect(oneMinute).toEqual("1 minuta");
        expect(twoMinutes).toEqual("2 minuty");
        expect(threeMinutes).toEqual("3 minuty");
        expect(fiveMinutes).toEqual("5 minut");
        expect(_23Minutes).toEqual("23 minuty");
    })

    test('variable injected [pl][Search results]', async () => {
        const lng = "pl";
        const translation = t("Search results", {parts: "abc", lng});
        expect(translation).toEqual("Rezultaty wyszukiwania dla następujących części zapytania: abc");
    })

    test('date formatted [pl][date=month+day]', async () => {
        const lng = "pl";
        const translation = t("date=month+day", {date: new Date(Date.UTC(2012, 11, 20, 3, 0, 0)), lng});
        expect(translation).toEqual("20 grudnia");
    })

    test('no translation found, return key [pl][sdasdasdasd]', async () => {
        const lng = "pl";
        const translation = t("sdasdasdasd", {lng});
        expect(translation).toEqual("sdasdasdasd");
    })


});