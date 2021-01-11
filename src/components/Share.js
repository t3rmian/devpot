import React from "react";
import { useSiteData } from "react-static";
import { absoluteUrl, ellipsizeDescription } from "../components/SEOHead";

import {
  EmailShareButton,
  FacebookShareButton,
  LinkedinShareButton,
  RedditShareButton,
  TwitterShareButton,
  EmailIcon,
  FacebookIcon,
  LinkedinIcon,
  RedditIcon,
  TwitterIcon,
} from "react-share";

export default ({
  siteTitle,
  langRefs,
  description,
  title,
  tags,
  twitterAuthor,
  twitterContentUsername,
}) => {
  const { siteRoot } = useSiteData();
  const url = absoluteUrl(siteRoot, langRefs.find((ref) => ref.selected).url);
  const via =
    twitterContentUsername != null ? `@${twitterContentUsername}` : undefined;
  const related =
    twitterAuthor != null
      ? twitterAuthor !== twitterContentUsername
        ? [`@${twitterAuthor}`]
        : undefined
      : undefined;
  return (
    <div role="region" className="social">
      <TwitterShareButton
        url={url}
        title={title}
        hashtags={tags}
        via={via}
        related={related}
        resetButtonStyle={false}
      >
        <TwitterIcon size={32} round={true} />
      </TwitterShareButton>
      <RedditShareButton url={url} title={title} resetButtonStyle={false}>
        <RedditIcon size={32} round={true} />
      </RedditShareButton>
      <LinkedinShareButton
        url={url}
        title={title}
        description={ellipsizeDescription(description)}
        source={siteTitle}
        resetButtonStyle={false}
      >
        <LinkedinIcon size={32} round={true} />
      </LinkedinShareButton>
      <FacebookShareButton
        url={url}
        quote={ellipsizeDescription(description)}
        hashtag={`#${siteTitle.toLowerCase()}`}
        resetButtonStyle={false}
      >
        <FacebookIcon size={32} round={true} />
      </FacebookShareButton>
      <EmailShareButton
        url={url}
        subject={title}
        body={ellipsizeDescription(description)}
        resetButtonStyle={false}
      >
        <EmailIcon size={32} round={true} />
      </EmailShareButton>
    </div>
  );
};
