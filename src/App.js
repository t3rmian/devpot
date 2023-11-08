import "./app.scss";

import { CSSTransition, TransitionGroup } from "react-transition-group";
import { Head, Routes, prefetch as reactPrefetch } from "react-static";
import { Location, Router } from "components/Router";

import Loader from "./components/Loader";
import React from "react";
import lifecycle from "react-pure-lifecycle";
import { loadSiteTheme } from "components/Theme";
import { makeVisible } from "./utils";

const methods = {
  componentDidMount() {
    startPreloader();
    loadSiteTheme();
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
    const fadeObjects = [
      {
        visible: true,
        fadeOutSelector: "header .fadeIn, nav.fadeIn",
        fadeInSelector: "header .fadeOut, nav.fadeOut",
        minOffset: 50
      },
      {
        inverted: true,
        visible: false,
        fadeOutSelector: ".social",
        fadeInSelector: ".social",
        get minOffset() {
          return document.querySelector(".content")?.clientHeight / 2
        }
      }
    ]

    document.addEventListener("scroll", throttle(throttleTimeout, function (scrolledElement) {
      fadeObjects.forEach(fadeObject => {
        const belowOffset = fadeObject.inverted ? !fadeObject.visible : fadeObject.visible;
        if (belowOffset) {
          if (scrolledElement.target.scrollTop > fadeObject.minOffset) {
            fadeObject.visible = !!fadeObject.inverted;
            document.querySelectorAll(fadeObject.fadeOutSelector).forEach(domElement => {
              makeVisible(domElement, fadeObject.visible);
            });
          }
        } else {
          if (scrolledElement.target.scrollTop <= fadeObject.minOffset) {
            fadeObject.visible = !fadeObject.inverted;
            document.querySelectorAll(fadeObject.fadeInSelector).forEach(domElement => {
              makeVisible(domElement, fadeObject.visible);
            });
          }
        }
      })
    }), true);
  }
};

function App() {
  let lastLocation; // workaround for duplicate key content caused by CSSTransition
  return (
    <div tabIndex={-1}>
      <Head>
        <meta charSet="UTF-8" />
      </Head>
      <div id="theme" className="theme-light">
        <React.Suspense fallback={Loader()}>
          <Location>
            {({ location }) => {
              if (lastLocation === location.pathname) {
                lastLocation = location.pathname + Math.random();
              } else {
                lastLocation = location.pathname;
              }
              return (
                <TransitionGroup className="transition-group">
                  <CSSTransition
                    key={lastLocation}
                    classNames="fade"
                    timeout={{enter: 500, exit: 0}}
                  >
                    <Router location={location} className="router" style={({ outline: undefined })}>
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
    </div>
  );
}

const list = new Map()

const onVisible = (element, callback) => {
  if (list.get(element)) {
    return
  }
  const io = new window.IntersectionObserver(entries => {
    entries.forEach(entry => {
      // Edge doesn't support isIntersecting. intersectionRatio > 0 works as a fallback
      if (
          element === entry.target &&
          (entry.isIntersecting || entry.intersectionRatio > 0)
      ) {
        io.unobserve(element)
        io.disconnect()

        callback()
      }
    })
  })
  io.observe(element)
  list.set(element, true)
}



function startPreloader() {
  const mobile = "ontouchstart" in document.documentElement;
  const prefetch = href => {
      reactPrefetch(href);
  }
  const prefetchCallback = mobile ? (el, href) => {
    prefetch(href);
  } : (el, href) => {
    if (!el.classList.contains("nofetch")) {
      prefetch(href);
      return;
    }
    const onHover = function() {
      el.removeEventListener("pointerenter", onHover)
      prefetch(href);
    };
    el.addEventListener("pointerenter", onHover)
  };

  if (typeof document !== 'undefined') {
    const run = () => {
      const els = [].slice.call(document.getElementsByTagName('a'))
      els.forEach(el => {
        const href = el.getAttribute('href')
        if (href) {
          onVisible(el, prefetchCallback.bind(null, el, href));
        }
      })
    }

    setInterval(run, Number(process.env.REACT_STATIC_PRELOAD_POLL_INTERVAL))
  }
}

export default lifecycle(methods)(App);
