import { Link } from "components/Router";
import React from "react";
import SEOHead from "../components/SEOHead";
import SearchBar from "./SearchBar";
import convert from "htmr";

export default props => {
  const { home, root, seo, categories } = props;
  const logo = (seo.image = "/img/logo.png");

  return (
    <header className="header-container">
      <SearchBar root={root} lang={seo.lang} />
      <SEOHead {...seo} />
      <div className="header-row">
        <Link className="logo" to={root}>
          <img className="logo" src={logo} alt="logo" />
        </Link>
        {home && (
          <div className="title-row">
            <div className="logo-title">
              <h1>{home.siteTitle}</h1>
            </div>
              <hr/>
              {categories && (
                  <div className={"categories"}>
                      {categories.map(tag => (
                          <Link className={"category"} key={tag.key} to={tag.path}>{`${tag.value}`}</Link>
                      ))}
                  </div>)}
              <hr/>
            {home && (
              <div className="logo-description">{convert(home.contents)}</div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
