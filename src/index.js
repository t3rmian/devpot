import './i18n';

import App from './App';
import React from 'react';
import ReactDOM from 'react-dom';

export default App;

if (typeof document !== "undefined") {
  const target = document.getElementById("root");

  const renderMethod = target.hasChildNodes()
    ? ReactDOM.hydrate
    : ReactDOM.render;

  const render = Comp => {
    renderMethod(<Comp />, target);
  };

  render(App);

  if (module && module.hot) {
    module.hot.accept("./App", () => {
      render(App);
    });
  }
}
