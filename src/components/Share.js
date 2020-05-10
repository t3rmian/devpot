import { Head } from "react-static";
import React from "react";
import { useSiteData } from "react-static";
import { useTranslation } from "react-i18next";
import { absoluteUrl } from "../components/SEOHead";

import {
  EmailShareButton,
  FacebookShareButton,
  FacebookMessengerShareButton,
  LinkedinShareButton,
  RedditShareButton,
  TwitterShareButton,
  EmailIcon,
  FacebookIcon,
  FacebookMessengerIcon,
  LinkedinIcon,
  RedditIcon,
  TwitterIcon,
} from "react-share";

export default ({langRefs}) => {
  const { siteRoot } = useSiteData();
  const { t } = useTranslation();

  return (
    <aside>
        <FacebookShareButton url={absoluteUrl(siteRoot, langRefs.find(ref => ref.selected).url)}>
            <FacebookIcon size={32} round={true} />
        </FacebookShareButton>
        <FacebookMessengerShareButton url={absoluteUrl(siteRoot, langRefs.find(ref => ref.selected).url)}>
            <FacebookMessengerIcon size={32} round={true} />
        </FacebookMessengerShareButton>
        <TwitterShareButton url={absoluteUrl(siteRoot, langRefs.find(ref => ref.selected).url)}>
            <TwitterIcon size={32} round={true} />
        </TwitterShareButton>
        <RedditShareButton url={absoluteUrl(siteRoot, langRefs.find(ref => ref.selected).url)}>
            <RedditIcon size={32} round={true} />
        </RedditShareButton>
        <LinkedinShareButton url={absoluteUrl(siteRoot, langRefs.find(ref => ref.selected).url)}>
            <LinkedinIcon size={32} round={true} />
        </LinkedinShareButton>
        <EmailShareButton url={absoluteUrl(siteRoot, langRefs.find(ref => ref.selected).url)}>
            <EmailIcon size={32} round={true} />
        </EmailShareButton>
    </aside>
  );
};
