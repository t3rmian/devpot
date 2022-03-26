const fs = require('fs')
const { onPostBuild } = require('../../index.js')

const folders = [
  ['all-or-html-only', { generateForAllFiles: true }, `/
  Content-Security-Policy: default-src 'self';
/Za%C5%BC%C3%B3%C5%82%C4%87%20g%C4%99%C5%9Bl%C4%85%20ja%C5%BA%C5%84/
  Content-Security-Policy: default-src 'self'; script-src 'sha256-aSU9mrOZvWUNmx9t2Ywr6NuYPX1YqDmzPl1rJSVI6c4='; style-src 'sha256-YarYAnBvAbw+4LP2yH2mr5o0HX5u7z6bCD0bakC5/lI=' 'sha256-TCJ+IrYl9kIj0RoTGIySt0hfxEopq0zDT7Pb0xg3cH8=';
/Zażółć gęślą jaźń/
  Content-Security-Policy: default-src 'self'; script-src 'sha256-aSU9mrOZvWUNmx9t2Ywr6NuYPX1YqDmzPl1rJSVI6c4='; style-src 'sha256-YarYAnBvAbw+4LP2yH2mr5o0HX5u7z6bCD0bakC5/lI=' 'sha256-TCJ+IrYl9kIj0RoTGIySt0hfxEopq0zDT7Pb0xg3cH8=';`],
]

if (folders.length < fs.readdirSync('./tests/e2e/', { withFileTypes: true }).filter(dirent => dirent.isDirectory()).length) {
  console.warn('\u001b[37m\u001b[43m\u001b[1m WARN \u001b[22m\u001b[49m\u001b[39m Some folders are missing from test run')
}

global.console = {
  info: () => {},
}

test.each(folders)('%s', async (folder, customInputs, expected) => {
  const inputs = {
    buildDir: `./tests/e2e/${folder}`,
    exclude: [],
    policies: {
      defaultSrc: `'self'`,
    },
    disablePolicies: [],
    disableGeneratedPolicies: false,
    ...customInputs,
  }

  const headersFilePath = `${inputs.buildDir}/_headers`

  if (fs.existsSync(headersFilePath)) {
    fs.unlinkSync(headersFilePath)
  }

  await onPostBuild({ inputs })

  const file = fs.readFileSync(headersFilePath, 'utf-8')

  expect(file).toBe(expected)
})
