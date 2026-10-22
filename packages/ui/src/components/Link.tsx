'use client';
import { createContext, useContext, type AnchorHTMLAttributes, type ComponentType } from 'react';

export type LinkComponent = ComponentType<AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>;

const DefaultLink: LinkComponent = (props) => <a {...props} />;
const LinkContext = createContext<LinkComponent>(DefaultLink);

/** Lets the app swap plain anchors for its router's link (next/link in apps/web). */
export const LinkProvider = LinkContext.Provider;

export function UiLink(props: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const L = useContext(LinkContext);
  return <L {...props} />;
}
