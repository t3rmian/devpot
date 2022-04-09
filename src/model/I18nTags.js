import { flatMap } from '../utils';
import Tags from './Tags';
import {I18nPage} from "./utils";

export default function I18nTags(blog, defaultLang) {
  return flatMap(Object.keys(blog), lang => Tags(new I18nPage(blog, defaultLang, lang)));
}
