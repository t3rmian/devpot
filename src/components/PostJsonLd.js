import config from "../template.config";

export default function PostJsonLd(post, authorPictureSeo) {
    const publishIsoDate = new Date(post.date).toISOString();
    const modifyIsoDate = post.updated ? new Date(post.updated).toISOString() : null;
    const author = post.author ? post.author : config.author;
    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": post.title,
        "name": post.title,
        "image": [post.imageUrl],
        "datePublished": publishIsoDate,
        "author" : PersonJsonLd(author, authorPictureSeo),
        "publisher" : PersonJsonLd(config.author, authorPictureSeo),
        "mainEntityOfPage" : post.path
    }
    if (modifyIsoDate != null) {
        jsonLd["dateModified"] = modifyIsoDate;
    }

    return jsonLd;
}

function PersonJsonLd(author, authorPicture) {
    const person = {
        "@type": "Person",
        "name": author,
        "image": [authorPicture]
    };
    if (config.author === author) {
        person["url"] = config.authorSite;
        person["email"] = "contact@termian.dev";
        person["jobTitle"] = "Software Engineer";
    }
    return person;
}