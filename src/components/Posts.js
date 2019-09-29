import { Link } from "components/Router";
import React from "react";
import { capitalize, groupBy } from "../utils.js";
import { useTranslation } from "react-i18next";

export default function Posts({ posts, lang }) {
  const { t } = useTranslation();
  const now = new Date();
  const postsByMonth = groupBy(
    posts.filter(post => new Date(post.date) < now || post.devMode),
    post =>
      capitalize(t("date=year+month", { date: new Date(post.date), lng: lang }))
  );
  return (
    <table>
      {postsByMonth.map(([month, posts]) => (
        <tbody key={month}>
          <tr>
            <th colSpan="2" className="date-head">
              <div className={posts.some(p => !p.expanded) ? "" : "expanded"}>
                <time
                  dateTime={new Date(posts[0].date)
                    .toISOString()
                    .split("-")
                    .slice(0, 2)
                    .join("-")}
                >
                  {month}
                </time>
              </div>
            </th>
          </tr>
          {posts.map(post => (
            <tr key={post.title}>
              <td className="date-col">
                <div className={post.expanded ? "expanded" : ""}>
                  <time dateTime={new Date(post.date).toISOString()}>
                    {t("date=month+day", {
                      date: new Date(post.date),
                      lng: lang
                    })}
                  </time>
                </div>
              </td>
              <td>
                <div className={post.expanded ? "expanded" : ""}>
                  <Link to={post.path}>{post.title}</Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
}
