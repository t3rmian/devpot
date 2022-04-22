import { Link } from "components/Router";
import React from "react";
import { capitalize, groupBy } from "../utils.js";
import { useTranslation } from "react-i18next";
import {scoreToRelevance} from "../model/Relevance";

export default function Posts({ posts, lang }) {
  const { t } = useTranslation();
  const now = new Date();
  const archive = posts?.[0]?.score;
  const postsByMonth = groupBy(
    posts.filter(post => new Date(post.date) < now || post.devMode),
    post => archive ? t(scoreToRelevance(post.score), { lng: lang }) :
      capitalize(t("date=year+month", { date: new Date(post.date), lng: lang }))
  )
  postsByMonth.forEach(([_, posts]) => posts.sort((a, b) => b.id - a.id));
  return (
    <table>
      {postsByMonth.map(([month, posts]) => (
        <tbody key={month}>
          {archive ? <Title month={month}/> : <Month month={month} posts={posts}/>}
          {posts.map(post =>
              <Post key={post.title} post={post} t={t} lang={lang} archive={archive}/>
          )}
        </tbody>
      ))}
    </table>
  );
}

function dateToIsoYYYYMM(date) {
  return new Date(date)
      .toISOString()
      .split("-")
      .slice(0, 2)
      .join("-");
}

function Month({month, posts}) {
  return (<tr>
    <th colSpan="2" className="date-head">
      <div className={posts.some(p => !p.expanded) ? "" : "expanded"}>
        <time dateTime={dateToIsoYYYYMM(posts[0].date)}>
          {month}
        </time>
      </div>
    </th>
  </tr>)
}

function Title({month}) {
  return (<tr>
    <th colSpan="2" className="date-head">
      <div>
        <span>
          {month}
        </span>
      </div>
    </th>
  </tr>)
}

function Post({post, t, lang, archive}) {
  return (<tr>
    <td className="date-col">
      <div className={post.expanded ? "expanded" : ""}>
        <time dateTime={new Date(post.date).toISOString()}>
          {archive ? dateToIsoYYYYMM(post.date) : t("date=month+day", {
            date: new Date(post.date),
            lng: lang
          })}
        </time>
        {archive && <span>{`[${Object.values(post.category[0])[0]}]`}</span>}
      </div>
    </td>
    <td>
      <div className={post.expanded ? "expanded" : ""}>
        <Link to={post.path}>{post.title}</Link>
      </div>
    </td>
  </tr>)
}
