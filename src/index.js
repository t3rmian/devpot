import './i18n';

import App from './App';
import React from 'react';
import ReactDOM from 'react-dom';
import { getTheme } from "./components/Theme";

export default App;

if (typeof document !== "undefined") {
  const target = document.getElementById("root");

  const renderMethod = target.hasChildNodes()
    ? ReactDOM.hydrate
    : ReactDOM.render;

  const theme = getTheme();

  const render = Comp => {
    renderMethod(<Comp theme={theme}/>, target);
  };

  render(App);

  if (module && module.hot) {
    module.hot.accept("./App", () => {
      render(App);
    });
  }
}
