import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names, letting later Tailwind utilities win over earlier ones.
 *
 * `clsx` flattens conditionals; `twMerge` then resolves conflicts within a
 * utility group, so `cn('p-2', 'p-4')` is `p-4` rather than both. Every shadcn
 * component routes its className through this, which is what makes overriding
 * one from a call site work at all.
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
