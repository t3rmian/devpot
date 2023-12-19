import React from "react";
// noinspection ES6PreferShortImport
import { Link } from "../components/Router";

export default ({
  routeCategories,
  category,
  title,
  date,
  dateFormatted,
  updated,
  updatedFormatted,
  minutesRead,
  authorAlt,
  authorSite,
  authorPicture,
  author,
  authorName = author.split(" ")[0],
  authorSurname = author.split(" ")[1],
}) => (
  <div className="header">
    <h1 className="title">{title}</h1>
    <div className="meta">
      <span className="item">
        <span className={"creation-date" + (updated ? " updated" : "")}>
          {updated && (
          <time dateTime={new Date(updated).toISOString()}>
            {updatedFormatted}
            <br />
          </time>
          )}
          <time dateTime={new Date(date).toISOString()}>{dateFormatted}</time>
        </span>
      </span>
      <span className="item profile">
        <span>
        <a href={authorSite} className="profile">
          {authorPicture && <img crossOrigin="true" src={authorPicture} alt={authorAlt}/>}
          <div>{authorName}<br/>{authorSurname}</div>
        </a>
        </span>
      </span>

      <div className="item">
        <span>
        {minutesRead}
        </span>
      </div>
      {category && category.map((tag) => (
        <span className="item" key={Object.keys(tag)[0]}>
          <span>
            <Link
                to={`${routeCategories.find((t) => t.key === Object.keys(tag)[0]).path}`}
            >
              {tag[Object.keys(tag)[0]]}
            </Link>
          </span>
        </span>
      ))}
    </div>
  </div>
);
