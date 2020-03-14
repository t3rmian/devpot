import "./app.scss";

import { CSSTransition, TransitionGroup } from "react-transition-group";
import { Head, Root, Routes } from "react-static";
import { Location, Router } from "components/Router";

import Loader from "./components/Loader";
import React from "react";
import config from "./template.config";
import lifecycle from "react-pure-lifecycle";

const methods = {
  componentDidMount(props) {
    if (config.optional.ga) {
      window.dataLayer = window.dataLayer || [];
      function gtag() {
        window.dataLayer.push(arguments);
      }
      gtag("js", new Date());
      gtag("config", config.optional.ga);
    }

    const throttle = (ms, fun) => {
      let isThrottled;
      return (...args) => {
        if (!isThrottled) {
          fun(...args);
          isThrottled = setTimeout(() => (isThrottled = false), ms);
        }
      };
    };
    const throttleTimeout = 25;
    const minOffset = 50;
    let visible = true;

    document.addEventListener(
      "scroll",
      throttle(throttleTimeout, function(e) {
        if (visible) {
          if (e.srcElement.scrollTop > minOffset) {
            visible = false;
            document
              .querySelectorAll("header .fadeIn, nav.fadeIn")
              .forEach(c => {
                c.classList.remove("fadeIn");
                c.classList.add("fadeOut");
              });
          }
        } else {
          if (e.srcElement.scrollTop < minOffset) {
            visible = true;
            document
              .querySelectorAll("header .fadeOut, nav.fadeOut")
              .forEach(c => {
                c.classList.remove("fadeOut");
                c.classList.add("fadeIn");
              });
          }
        }
      }),
      true
    );
  }
};

function App({ theme }) {
  return (
    <Root>
      <Head>
        <meta charSet="UTF-8" />
      </Head>
      <div id="theme" className={theme}>
        <React.Suspense fallback={Loader()}>
          <Location>
            {({ location }) => {
              return (
                <TransitionGroup className="transition-group">
                  <CSSTransition
                    key={location.pathname}
                    classNames="fade"
                    timeout={500}
                  >
                    <Router location={location} className="router">
                      <Routes
                        default
                        routePath={decodeURI(location.pathname)}
                      />
                    </Router>
                  </CSSTransition>
                </TransitionGroup>
              );
            }}
          </Location>
        </React.Suspense>
      </div>
    </Root>
  );
}

export default lifecycle(methods)(App);
