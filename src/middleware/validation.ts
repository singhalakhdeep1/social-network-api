/**
 * Input validation, sanitisation, hashtag / mention extraction and a small content filter.
 */
import validator from 'validator';
import xss from 'xss';
import { badInput } from '../utils/errors';

/** Strips HTML (script/style bodies removed) but keeps the text; output is rendered as plain text by clients. */
export const sanitizeInput = (input: string): string =>
  xss(input, { whiteList: {}, stripIgnoreTag: true, stripIgnoreTagBody: ['script', 'style'] }).trim();

export const validateEmail = (email: string): boolean => validator.isEmail(email);
export const validateUsername = (username: string): boolean => /^[a-zA-Z0-9_]{3,30}$/.test(username);
export const validatePassword = (password: string): boolean => password.length >= 8 && password.length <= 128;
export const validateUrl = (url: string): boolean => validator.isURL(url, { protocols: ['http', 'https'], require_protocol: true });

export const assertUrl = (url: string, label = 'URL'): string => {
  if (!validateUrl(url)) throw badInput(`${label} must be a valid http(s) URL`);
  return url;
};

export const extractHashtags = (content: string): string[] => {
  const tags = new Set<string>();
  for (const match of content.matchAll(/(?:^|\s)#([\p{L}\p{N}_]{1,50})/gu)) tags.add(match[1].toLowerCase());
  return [...tags];
};

export const extractMentions = (content: string): string[] => {
  const names = new Set<string>();
  for (const match of content.matchAll(/(?:^|\s)@([a-zA-Z0-9_]{3,30})/g)) names.add(match[1].toLowerCase());
  return [...names];
};

const BANNED = ['spam', 'abuse', 'hate', 'violence'];

export const moderateContent = (content: string): { isSafe: boolean; reason?: string } => {
  const lower = content.toLowerCase();
  for (const word of BANNED) {
    if (new RegExp(`\\b${word}\\b`).test(lower)) return { isSafe: false, reason: `Contains banned word: ${word}` };
  }
  if ((content.match(/https?:\/\//g) ?? []).length > 5) return { isSafe: false, reason: 'Too many links' };
  return { isSafe: true };
};

/** Escapes a user string for use inside a RegExp. */
export const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
