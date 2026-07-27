/**
 * INPUT VALIDATION AND SANITIZATION MIDDLEWARE
 */

import validator from 'validator';
import xss from 'xss';

export const sanitizeInput = (input: string): string => {
  return xss(input);
};

export const validateEmail = (email: string): boolean => {
  return validator.isEmail(email);
};

export const validateUsername = (username: string): boolean => {
  return validator.isAlphanumeric(username) && username.length >= 3 && username.length <= 30;
};

export const validatePassword = (password: string): boolean => {
  return password.length >= 8;
};

export const validateUrl = (url: string): boolean => {
  return validator.isURL(url);
};

export const extractHashtags = (content: string): string[] => {
  const hashtagRegex = /#(\w+)/g;
  const hashtags: string[] = [];
  let match;
  
  while ((match = hashtagRegex.exec(content)) !== null) {
    hashtags.push(match[1].toLowerCase());
  }
  
  return [...new Set(hashtags)];
};

export const extractMentions = (content: string): string[] => {
  const mentionRegex = /@(\w+)/g;
  const mentions: string[] = [];
  let match;
  
  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push(match[1]);
  }
  
  return [...new Set(mentions)];
};

export const moderateContent = (content: string): { isSafe: boolean; reason?: string } => {
  const bannedWords = ['spam', 'abuse', 'hate', 'violence'];
  const lowerContent = content.toLowerCase();
  
  for (const word of bannedWords) {
    if (lowerContent.includes(word)) {
      return { isSafe: false, reason: `Contains banned word: ${word}` };
    }
  }
  
  return { isSafe: true };
};
