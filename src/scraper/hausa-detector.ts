import { franc } from 'franc';

export function isHausa(text: string): boolean {
  const lang = franc(text, { minLength: 20 });
  return lang === 'hau';
}
