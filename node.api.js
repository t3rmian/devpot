import webpack from "webpack";
import chalk from "chalk";
import sharp from "sharp";
import fs from "fs-extra";
import nodePath from "path";
import config from "./src/template.config";

export default (options = {}) => ({
  beforeDocumentToFile: (html, { meta }) => {
    const divider = "div";
    const divSplittage = html.split(divider);
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
          "shell",
          "plaintext",
          "yaml",
          "groovy",
          "sql",
          "gradle",
          "bash",
          "xml",
          "java"
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
    console.log("Updating the file");
  });
  console.log(chalk.green(`[\u2713] ${filename} updated`));
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
      .replace("$template.config.js._siteRoot", config.siteRoot.split("//")[1])
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
        .jpeg()
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