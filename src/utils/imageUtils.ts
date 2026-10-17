import React from 'react';

/**
 * Converts Google Drive preview/view URLs into direct image thumbnail URLs that can be displayed in <img> tags.
 * Falls back to the original URL if not a Google Drive link.
 */
export const getDirectImageUrl = (url?: string): string => {
  if (!url) return '';
  const trimmed = url.trim();

  // Match Google Drive file ID
  const gDriveMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (gDriveMatch && gDriveMatch[1]) {
    const fileId = gDriveMatch[1];
    // Googleusercontent thumbnail URL directly returns image bytes (supports CORS, doesn't redirect to HTML page)
    return `https://lh3.googleusercontent.com/d/${fileId}=s800`;
  }

  return trimmed;
};

/**
 * Handles image load errors gracefully. First tries an alternative Google Drive thumbnail URL.
 * If that fails, renders a sleek fallback placeholder without collapsing the parent container.
 */
export const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>, originalUrl: string) => {
  const target = e.currentTarget;
  const gDriveMatch = originalUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || originalUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);

  if (gDriveMatch && gDriveMatch[1]) {
    const fileId = gDriveMatch[1];
    const fallbackUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
    if (target.src !== fallbackUrl) {
      target.src = fallbackUrl;
      return;
    }
  }

  // Graceful fallback UI when image cannot be displayed
  target.style.display = 'none';
  const parent = target.parentElement;
  if (parent && !parent.querySelector('.img-fallback-placeholder')) {
    const fallback = document.createElement('div');
    fallback.className = 'img-fallback-placeholder w-full h-full flex flex-col items-center justify-center p-3 text-center bg-slate-100 dark:bg-slate-800 text-slate-500 absolute inset-0';
    fallback.innerHTML = `
      <svg class="h-6 w-6 text-slate-400 mb-1" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
      <span class="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Session Photo</span>
      <span class="text-[10px] text-blue-600 dark:text-blue-400 font-medium mt-0.5">Click to Open</span>
    `;
    parent.appendChild(fallback);
  }
};
