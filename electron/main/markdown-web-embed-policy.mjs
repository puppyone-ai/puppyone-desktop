export function assertMarkdownWebEmbedHref(href) {
  if (typeof href !== "string" || !/^https:\/\//i.test(href)) {
    throw new Error("Only https embeds are allowed.");
  }
  return href;
}
