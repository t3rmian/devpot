import { flatMap } from '../utils';
import Categories from './Categories';
import {I18nPage} from "./utils";

export default function I18nCategories(blog, defaultLang) {
  return flatMap(Object.keys(blog), lang => Categories(new I18nPage(blog, defaultLang, lang)));
}
