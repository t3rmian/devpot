import { flatMap } from '../utils';
import Category from './Category';

export default function I18nCategory(blog, defaultLang) {
  return flatMap(Object.keys(blog), lang => Category(blog, defaultLang, lang));
}
