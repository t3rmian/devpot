import React from "react";
import { Link } from "components/Router";

export default ({
  tags,
  routeTags,
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
    {tags && (
      <div className="tags">
        {tags.map((tag) => (
          <Link
            className="item"
            key={tag}
            to={`${routeTags.find((t) => t.value === tag).path}`}
          >
            {tag}
          </Link>
        ))}
      </div>
    )}
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

      <span className="item">{minutesRead}</span>
    </div>
  </div>
);
