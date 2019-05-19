# react-static-teapot

Blog template build on *React Static*. This approach generates static blog from markdown posts. Both the blog structure and theme are designed in minimalistic style. The structure consists of the following pages:  
- index
- post
- tags
- search
- 404
- offline (**PWA**)

The blog supports **multilingual** content as well as path translation. Basic sitemap with reflangs is provided. Standard **SEO** meta tags are generated based on content. Two **themes** - light and dark - are available with smooth **animations** and transitions. **Lazy image loading** has been implemented for posts to reduce data usage. For blog **comment system** the *utteranc.es* was chosen. Comments are saved and loaded dynamically per post path as github issues. Loading could be later moved to build process in case of meeting the quota. The pages were designed with **RWD** in mind. Favicons were generated in one of online creators which supports most of the systems.

Additional features like small page sizes and instant loading come from *react-static*. Feel free to read more about it, and use this template with your own modifications! I used JavaScript and Sass in this project. For other components - check out `package.json`. For basic configuration refer to `/src/template.config.js`.

## License

Copyright (c) 2019 Damian Terlecki

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.