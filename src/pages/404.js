import Footer from "../components/Footer";
import Loader from "../components/Loader";
import { Head } from "react-static";
import React from "react";
import i18n from "../i18n";

const langs = Object.keys(i18n.services.resourceStore.data);

export default () => {
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    setReady(true);
  }, []);
  const reason = navigator.onLine ? "404" : "🖧";

  return ready ? (
    <div className="error">
      <Head>
        <title>{reason}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <h1>{reason}</h1>
      <Footer lang={i18n.t("defaultLang")}
        langRefs={[
          ...langs
            .filter(lang => lang !== i18n.t("defaultLang"))
            .map(lang => ({
              lang,
              url: `/${lang}/`
            })),
          {
            lang: i18n.t("defaultLang"),
            url: "/"
          }
        ]}
      />
    </div>
  ) : (
    <Loader />
  );
};
