import React from "react";
import { Link } from "components/Router";

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
        {updated && (
          <time dateTime={new Date(updated).toISOString()}>
            {updatedFormatted}
            <br />
          </time>
        )}
        <time dateTime={new Date(date).toISOString()}>{dateFormatted}</time>
      </span>
      <span className="item profile">
        <a href={authorSite} className="profile">
          {authorPicture && <img crossOrigin="true" src={authorPicture} alt={authorAlt}/>}
          <div>{authorName}<br/>{authorSurname}</div>
        </a>
      </span>

      <div className="item">
        {minutesRead}
      </div>
      {category && (
          <span className="item">
        {category.map((tag) => (
            <Link
                key={Object.keys(tag)[0]}
                to={`${routeCategories.find((t) => t.key === Object.keys(tag)[0]).path}`}
            >
              {tag[Object.keys(tag)[0]]}
            </Link>
        ))}
      </span>
      )}
    </div>
  </div>
);
