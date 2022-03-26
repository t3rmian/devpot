const fs = require('fs')
const {performance} = require('perf_hooks')
const {sha256} = require('js-sha256')
const globby = require('globby')
const {JSDOM} = require('jsdom')

const {
    mergeWithDefaultPolicies,
    buildCSPArray,
    splitToGlobalAndLocal
} = require('netlify-plugin-csp-generator/functions')

function generateHashes(dom, getPropertyValue) {
    return selector => {
        const hashes = new Set()
        const iframeDocs = [...dom.window.document.querySelectorAll('iframe')]
            .map(d => new JSDOM(`<!DOCTYPE html>${d.srcdoc}`))
            .map(dom => dom.window.document);
        for (const document of [dom.window.document, ...iframeDocs]) {
            for (const matchedElement of document.querySelectorAll(selector)) {
                const value = getPropertyValue(matchedElement)
                if (value.length) {
                    const hash = sha256.arrayBuffer(value)
                    const base64hash = Buffer.from(hash).toString('base64')
                    hashes.add(`'sha256-${base64hash}'`)
                }
            }
        }
        return Array.from(hashes)
    }
}

function createFileProcessor(buildDir, disableGeneratedPolicies, generateForAllFiles) {
    return path => file => {
        const dom = new JSDOM(file)
        const shouldGenerate = (key) => !(disableGeneratedPolicies || []).includes(key)
        const generateHashesFromElement = generateHashes(dom, element => element.innerHTML)
        const generateHashesFromStyle = generateHashes(dom, element => element.getAttribute('style'))

        const scripts = shouldGenerate('scriptSrc') ? generateHashesFromElement('script') : []
        const styles = shouldGenerate('styleSrc') ? generateHashesFromElement('style') : []
        const inlineStyles = shouldGenerate('styleSrc') ? generateHashesFromStyle('[style]') : []

        const indexMatcher = new RegExp(`^${buildDir}(.*)index\\.html$`)
        const nonIndexMatcher = new RegExp(`^${buildDir}(.*\\/).*?\\.html$`)

        let webPath = null
        let globalCSP = null
        if (path.match(indexMatcher)) {
            webPath = path.replace(indexMatcher, '$1')
            globalCSP = false
        } else {
            webPath = path.replace(nonIndexMatcher, generateForAllFiles ? '$1*' : '$1*.html')
            globalCSP = true
        }

        const cspObject = {
            scriptSrc: scripts,
            styleSrc: [...inlineStyles, ...styles],
        }

        return {
            webPath,
            cspObject,
            globalCSP,
        }
    }
}

module.exports = {
    onPostBuild: async ({inputs}) => {
        const startTime = performance.now()

        const {
            buildDir,
            exclude,
            policies,
            disablePolicies,
            disableGeneratedPolicies,
            reportOnly,
            reportURI,
            reportTo,
            generateForAllFiles,
        } = inputs

        const mergedPolicies = mergeWithDefaultPolicies(policies)

        const htmlFiles = `${buildDir}/**/**.html`
        const excludeFiles = (exclude || []).map((filePath) => `!${filePath.replace(/^!/, '')}`)
        console.info(`Excluding ${excludeFiles.length} ${excludeFiles.length === 1 ? 'file' : 'files'}`)

        const lookup = [htmlFiles].concat(excludeFiles)
        const paths = await globby(lookup)
        console.info(`Found ${paths.length} HTML ${paths.length === 1 ? 'file' : 'files'}`)

        const processFile = createFileProcessor(buildDir, disableGeneratedPolicies, generateForAllFiles)

        const processedFileHeaders = await Promise.all(
            paths.map(path => fs.promises.readFile(path, 'utf-8').then(processFile(path)))
        )

        const {globalHeaders, localHeaders} = processedFileHeaders
            .reduce(splitToGlobalAndLocal, {globalHeaders: [], localHeaders: []})

        const file = globalHeaders.concat(...localHeaders)
            .flatMap(({webPath, cspObject}) => {
                const cspArray = buildCSPArray(mergedPolicies, disablePolicies, cspObject)
                if (reportURI) {
                    cspArray.push(`report-uri ${reportURI};`)
                }
                if (reportTo) {
                    cspArray.push(`report-to ${reportTo};`)
                }
                const cspString = cspArray.join(' ')
                const headerType = reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy'

                const nonAlphanumeric = encodeURI(webPath) !== webPath

                const cspEntry = `${webPath}\n  ${headerType}: ${cspString}`;
                return nonAlphanumeric ? [`${encodeURI(webPath)}\n  ${headerType}: ${cspString}`, cspEntry] : [cspEntry];
            }).join('\n')

        fs.appendFileSync(`${buildDir}/_headers`, file)

        const completedTime = performance.now() - startTime
        console.info(`Saved at ${buildDir}/_headers - ${(completedTime / 1000).toFixed(2)} seconds`)
    },
}
