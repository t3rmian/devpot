import { flatMap } from '../utils';
import Tags from './Tags';

export default function I18nTags(blog, defaultLang) {
  return flatMap(Object.keys(blog), lang => Tags(blog, defaultLang, lang));
}
