export function groupBy(list, keyGetter) {
  const map = new Map();
  list.forEach(item => {
    const key = keyGetter(item);
    const collection = map.get(key);
    if (!collection) {
      map.set(key, [item]);
    } else {
      collection.push(item);
    }
  });
  return Array.from(map);
}

export const concat = (x, y) => x.concat(y);
export const flatMap = (xs, f) => xs.map(f).reduce(concat, []);

export function countSubstrings(text, substring) {
  var m = text.match(
    new RegExp(
      substring.toString().replace(/(?=[.\\+*?[^\]$(){}\|])/g, "\\"),
      "g"
    )
  );
  return m ? m.length : 0;
}

export function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function loadComments(anchor, repo, theme) {
  const script = document.createElement("script");
  script.setAttribute("src", "https://utteranc.es/client.js");
  script.setAttribute("crossorigin", "anonymous");
  script.setAttribute("async", true);
  script.setAttribute("repo", repo);
  script.setAttribute("issue-term", "pathname");
  script.setAttribute("theme", theme);
  anchor.appendChild(script);
}

export function lazyLoadImages(images) {
  const options = {
    rootMargin: "100px 0px",
    root: null
  };

  function onIntersection(images, observer) {
    images.forEach(image => {
      if (image.intersectionRatio > 0.001) {
        observer.unobserve(image.target);
        image.target.src = image.target.dataset.src;
      }
    });
  }

  const observer = new IntersectionObserver(onIntersection, options);
  images.forEach(image => observer.observe(image));
}