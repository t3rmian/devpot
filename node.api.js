import webpack from "webpack";
import chalk from "chalk";
import sharp from "sharp";
import fs from "fs-extra";
import nodePath from "path";
import config from "./src/template.config";

export default (options = {}) => ({
  beforeDocumentToFile: (html, { meta }) => {
    const divider = "div";
    const divSplittage = html
        .replace('<div style="outline:none" tabindex="-1">', "<div tabindex=\"-1\">")
        .replace('<div style="outline:none" tabindex="-1" role="group">', "<div tabindex=\"-1\" role=\"group\">")
        .split(divider);
    if (divSplittage.length > 1) {
      divSplittage[0] = divSplittage[0].replace(
        new RegExp('<script charset="utf-8" ', "g"),
        ""
      );
      const lastIndex = divSplittage.length - 1;
      divSplittage[lastIndex] = divSplittage[lastIndex].replace(
        new RegExp(' type="text/javascript"', "g"),
        ""
      );
      return divSplittage.join(divider);
    } else {
      return html
        .replace(new RegExp(' type="text/javascript"', "g"), "")
        .replace(new RegExp('<script charset="utf-8" ', "g"), "");
    }
  },
  afterExport: async state => {
    const {
      config: {
        paths: { DIST }
      },
      staging
    } = state;
    fixMultilingualSitemap(DIST, staging);
    applyManifestConfig(DIST);
    applyBraveRewardsConfig(DIST);
    applyRobotsConfig(DIST);
    generateThumbnails(DIST);
    setCache(DIST);
  },
  webpack: (currentWebpackConfig, state) => {
    const { stage } = state
    if (stage === 'dev') {
      return currentWebpackConfig;
    }
    const newConfig = { ...currentWebpackConfig };
    newConfig.optimization.splitChunks.cacheGroups.vendors = {
      test: /[\\/]node_modules[\\/]/,
      priority: -10,
      chunks: "initial"
    };
    newConfig.optimization.splitChunks.cacheGroups.default = {
      minChunks: 2,
      priority: -20,
      reuseExistingChunk: true
    };
    newConfig.plugins.push(
      new webpack.ContextReplacementPlugin(
        /highlight\.js\/lib\/languages$/,
        new RegExp(`^./(${[
          "kotlin",
          "properties",
          "plaintext",
          "yaml",
          "groovy",
          "sql",
          "gradle",
          "bash",
          "dockerfile",
          "xml",
          "java",
          "javascript",
        ].join('|')})$`),
      )
    );
    return newConfig;
  }
});

function fixMultilingualSitemap(DIST, staging) {
  const filename = staging ? "sitemap.staging.xml" : "sitemap.xml";
  console.log(`Reading ${filename}...`);
  const path = nodePath.join(DIST, filename);
  const allLines = fs.readFileSync(path).toString();
  fs.writeFileSync(
    path,
    allLines
      .replace("<urlset", '<urlset xmlns:xhtml="http://www.w3.org/1999/xhtml"')
      .split("></xhtml:link")
      .map(e =>
        e.indexOf("<urlset") > 0
          ? e
          : e
              .split(">")
              .slice(1)
              .join(">")
      )
      .join("/>"),
    () => {
      console.log("Updating the file");
    }
  );
  console.log(chalk.green(`[\u2713] ${filename} updated`));
}

function applyManifestConfig(DIST) {
  const filename = "site.webmanifest";
  console.log(`Reading ${filename}...`);
  const path = nodePath.join(DIST, filename);
  const allLines = fs.readFileSync(path).toString();
  const splittage = allLines.split("$template.config.js.");
  const output =
    splittage[0] +
    splittage
      .slice(1)
      .map(swap => {
        const quoteSplittage = swap.split('"');
        quoteSplittage[0] = config[quoteSplittage[0]];
        return quoteSplittage.join('"');
      })
      .join("");
  fs.writeFileSync(path, output, () => {
    console.log(`Updating the ${path} file`);
  });
  fs.readdirSync("content/posts/collections")
    .map(path => path.split("/").pop())
    .filter(lang => lang !== config.defaultLanguage)
    .forEach(lang => fs.writeFileSync(`${path.split(".")[0]}-${lang}.webmanifest`, i18nManifest(output, config, lang), () => {
      console.log(`Creating ${path.split(".")[0]}-${lang}.manifest file`);
    }))
  console.log(chalk.green(`[\u2713] ${filename} updated`));
}

function i18nManifest(contents, config, targetLanguage) {
  return contents
    .replace(`"lang": "${config.defaultLanguage}"`, `"lang": "${targetLanguage}"`)
    .replace(`"start_url" :"${config.siteRoot}"`, `"start_url" :"${config.siteRoot}/${targetLanguage}/"`);
}

function applyBraveRewardsConfig(DIST) {
  if (!config.optional.braveRewardsToken) {
    return;
  }
  const filename = "./.well-known/brave-rewards-verification.txt";
  console.log(`Reading ${filename}...`);
  const path = nodePath.join(DIST, filename);
  const allLines = fs.readFileSync(path).toString();
  fs.writeFileSync(
    path,
    allLines
      .replace("$template.config.js.siteRoot", config.siteRoot.split("//")[1])
      .replace(
        "$template.config.js.optional.braveRewardsToken",
        config.optional.braveRewardsToken
      ),
    () => {
      console.log("Updating the file");
    }
  );
  console.log(chalk.green(`[\u2713] ${filename} updated`));
}

function applyRobotsConfig(DIST) {
  if (!config.optional.disallow) {
    return;
  }
  const filename = "robots.txt";
  console.log(`Reading ${filename}...`);
  const path = nodePath.join(DIST, filename);
  const allLines = fs.readFileSync(path).toString();
  fs.writeFileSync(
    path,
    allLines + "\n" + config.optional.disallow,
    () => {
      console.log("Updating the file");
    }
  );
  console.log(chalk.green(`[\u2713] ${filename} updated`));
}

function generateThumbnails(DIST) {
  const root = DIST + "/img/hq/";
  const dir = fs.opendirSync(root);
  let entry;
  while ((entry = dir.readSync()) !== null) {
    const inputFilePath = root + entry.name;
    if (inputFilePath.endsWith(".svg")) {
      const outputFilePath =
        inputFilePath.substring(0, inputFilePath.length - 3) + "jpeg";
      console.debug(
        "Found a SVG image applicable for conversion: " + inputFilePath
      );
      sharp(inputFilePath)
        .jpeg({
          quality: 100,
          chromaSubsampling: '4:4:4'
        })
        .toFile(outputFilePath)
        .then(function () {
          console.log("Converted: " + inputFilePath + " -> " + outputFilePath);
        })
        .catch(function (err) {
          console.error(
            "Encountered error during conversion of: " +
              inputFilePath +
              " -> " +
              outputFilePath +
              ": " +
              err
          );
        });
    }
  }
}

function setCache(DIST) {
  const dir = fs.opendirSync(DIST + "/templates/__react_static_root__/src/pages/");
  let entry;
  while ((entry = dir.readSync()) !== null) {
    if (entry.name.startsWith("404")) {
      const pwaSwFilePath = DIST + "/pwabuilder-sw.js"
      const allLines = fs.readFileSync(pwaSwFilePath).toString()
      const splittage = allLines.split('"/404"');
      if (splittage.length < 2) {
        console.warn("/404 page not found in pwabuilder-sw.js")
        return;
      }
      splittage[0] += `"/404/routeInfo.json", "/templates/__react_static_root__/src/pages/${entry.name}", `;
      fs.writeFileSync(pwaSwFilePath, splittage.join('"/404"'), () => {
        console.log("Updating pwabuilder-sw.js");
      });
    }
  }
}