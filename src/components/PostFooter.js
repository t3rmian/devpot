import React from "react";
import { Link } from "components/Router";

export default ({ prev, next, source }) => (
  <div className="post-footer">
    <span>{prev && <Link to={prev.url}>&lt; {prev.title}</Link>}</span>
    <span>{source && <a href={source.url}>&lt;{source.title}/&gt;</a>}</span>
    <span>{next && <Link to={next.url}>{next.title} &gt;</Link>}</span>
  </div>
);
