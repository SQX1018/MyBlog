interface HtmlNode {
  type: string;
  children?: HtmlNode[];
  properties?: Record<string, unknown>;
  attributes?: { type: string; name: string; value?: unknown }[];
  value?: string;
}

/** Apply the deployment prefix to Markdown and MDX links without editing posts. */
export function rehypeBaseUrls({ base }: { base: string }) {
  const prefix = base.replace(/\/+$/, "");
  const attributes = ["href", "src", "poster"];

  function withBase(url: string) {
    if (
      !prefix ||
      !url.startsWith("/") ||
      url.startsWith("//") ||
      url === prefix ||
      url.startsWith(`${prefix}/`) ||
      url.startsWith(`${prefix}?`) ||
      url.startsWith(`${prefix}#`)
    ) {
      return url;
    }
    return `${prefix}${url}`;
  }

  return (root: HtmlNode) => {
    function walk(node: HtmlNode) {
      if (node.type === "element" && node.properties) {
        for (const name of attributes) {
          const value = node.properties[name];
          if (typeof value === "string")
            node.properties[name] = withBase(value);
        }
      }
      if (node.type.startsWith("mdxJsx")) {
        for (const attribute of node.attributes ?? []) {
          if (
            attribute.type === "mdxJsxAttribute" &&
            attributes.includes(attribute.name) &&
            typeof attribute.value === "string"
          ) {
            attribute.value = withBase(attribute.value);
          }
        }
      }
      if (node.type === "raw" && node.value) {
        node.value = node.value.replace(
          /\b(href|src|poster)=(['"])(\/(?!\/)[^'"]*)\2/g,
          (_match, name: string, quote: string, url: string) =>
            `${name}=${quote}${withBase(url)}${quote}`
        );
      }
      node.children?.forEach(walk);
    }
    walk(root);
  };
}
